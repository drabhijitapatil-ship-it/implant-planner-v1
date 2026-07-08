import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Switch, Alert, KeyboardAvoidingView, Platform, Modal, FlatList, Pressable, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../../utils/api';
import CenteredHeader from '../../components/CenteredHeader';

/**
 * Organization Settings. Implant In-Charge only.
 *
 * Three independent things live here:
 *  1. Organization Logo — shown on generated documents (case reports, lab
 *     slips, consent forms) and in-app. Moved here from Profile so all
 *     org-wide settings live in one place.
 *  2. 24-Hour Advance Scheduling — students/supervisors can't book <24h out.
 *     In-Charge always bypasses this regardless of the toggle.
 *  3. Time Slot mode — how the "Time Slot" picker behaves on case creation:
 *       default — the original fixed slots (10:00 AM Mon-Sat, 2:00 PM Mon-Fri).
 *       custom  — In-Charge defines named slots per weekday.
 *       open    — scheduler picks ANY start time; a slot occupies
 *                 [start, start + duration). In-Charge sets the duration.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_OPTIONS = [
  { value: '08:00', label: '08:00 AM' },
  { value: '08:30', label: '08:30 AM' },
  { value: '09:00', label: '09:00 AM' },
  { value: '09:30', label: '09:30 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '10:30', label: '10:30 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '11:30', label: '11:30 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '12:30', label: '12:30 PM' },
  { value: '13:00', label: '01:00 PM' },
  { value: '13:30', label: '01:30 PM' },
  { value: '14:00', label: '02:00 PM' },
  { value: '14:30', label: '02:30 PM' },
  { value: '15:00', label: '03:00 PM' },
  { value: '15:30', label: '03:30 PM' },
  { value: '16:00', label: '04:00 PM' },
  { value: '16:30', label: '04:30 PM' },
  { value: '17:00', label: '05:00 PM' },
  { value: '17:30', label: '05:30 PM' },
  { value: '18:00', label: '06:00 PM' },
  { value: '18:30', label: '06:30 PM' },
  { value: '19:00', label: '07:00 PM' },
];

type CustomSlot = { time: string; label: string; days: string[] };

const DEFAULT_SLOTS_PREVIEW = [
  { label: '10:00 AM', days: 'Mon – Sat' },
  { label: '2:00 PM', days: 'Mon – Fri' },
];

const emptySlot = (): CustomSlot => ({ time: '', label: '', days: [] });

// "HH:MM" (24h) -> "10:00 AM" for slot labels / previews.
const formatTime = (t: string): string => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${suffix}`;
};

export default function SchedulingSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orgName, setOrgName] = useState('');
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [enforceRestriction, setEnforceRestriction] = useState(true);
  const [restrictionSaving, setRestrictionSaving] = useState(false);

  const [mode, setMode] = useState<'default' | 'custom' | 'open'>('default');
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>([emptySlot()]);
  const [openWindowHours, setOpenWindowHours] = useState('2');
  const [activePickerSlotIdx, setActivePickerSlotIdx] = useState<number | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/organizations/me');
      const org = res.data?.organization;
      if (org) {
        setOrgName(org.name || '');
        setOrgLogo(org.logo || null);
        setEnforceRestriction(org.enforce_scheduling_restriction ?? true);
        const cfg = org.scheduling_config || {};
        setMode(cfg.mode || 'default');
        if (Array.isArray(cfg.custom_slots) && cfg.custom_slots.length > 0) {
          setCustomSlots(cfg.custom_slots.map((s: any) => ({ time: s.time || '', label: s.label || '', days: s.days || [] })));
        }
        if (cfg.open_window_hours) setOpenWindowHours(String(cfg.open_window_hours));
      }
    } catch {
      Alert.alert('Error', 'Could not load organization settings');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handlePickLogo = async () => {
    // System photo picker needs no media-library permission (Play policy: READ_MEDIA_* removed).
    // allowsEditing intentionally omitted — chaining PHPicker -> the native
    // crop screen hangs/blanks on iOS Simulator; real devices are fine, and
    // display-side sizing (borderRadius + resizeMode cover) handles non-square logos.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled) return;
    if (!result.assets?.[0]?.base64) {
      Alert.alert('Could not read photo', 'That photo could not be loaded. Please try a different one.');
      return;
    }
    setLogoUploading(true);
    try {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const res = await api.put('/organizations/me/logo', { logo: base64Image });
      setOrgLogo(res.data?.logo || base64Image);
      Alert.alert('Success', 'Organization logo updated successfully!');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const toggleRestriction = async (value: boolean) => {
    setRestrictionSaving(true);
    const prev = enforceRestriction;
    setEnforceRestriction(value); // optimistic
    try {
      await api.put('/organizations/me/scheduling-restriction', { enforce: value });
    } catch (e: any) {
      setEnforceRestriction(prev);
      Alert.alert('Error', e?.response?.data?.detail || 'Could not update this setting');
    } finally {
      setRestrictionSaving(false);
    }
  };

  const toggleSlotDay = (idx: number, day: string) => {
    setCustomSlots(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const has = s.days.includes(day);
      return { ...s, days: has ? s.days.filter(d => d !== day) : [...s.days, day] };
    }));
  };

  const addSlot = () => setCustomSlots(prev => [...prev, emptySlot()]);
  const removeSlot = (idx: number) => setCustomSlots(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const saveScheduleMode = async () => {
    if (mode === 'custom') {
      for (const s of customSlots) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
          Alert.alert('Invalid time', 'Each custom slot needs a time in HH:MM (24-hour) format, e.g. 09:00 or 14:30.');
          return;
        }
        if (s.days.length === 0) {
          Alert.alert('Missing days', 'Each custom slot needs at least one day selected.');
          return;
        }
      }
    }
    if (mode === 'open') {
      const h = parseFloat(openWindowHours);
      if (Number.isNaN(h) || h < 0.5 || h > 8) {
        Alert.alert('Invalid duration', 'Slot duration must be between 0.5 and 8 hours.');
        return;
      }
    }
    setSaving(true);
    try {
      const payload: any = { mode };
      if (mode === 'custom') {
        payload.custom_slots = customSlots.map(s => ({ time: s.time, label: s.label || formatTime(s.time), days: s.days }));
      } else if (mode === 'open') {
        payload.open_window_hours = parseFloat(openWindowHours);
      }
      await api.put('/organizations/me/scheduling-config', payload);
      Alert.alert('Saved', 'Scheduling settings updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not save scheduling settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <CenteredHeader title="Organization Settings" fallback="/(tabs)/user-management" />
        <View style={s.center}><ActivityIndicator size="large" color="#1A73E8" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <CenteredHeader title="Organization Settings" subtitle={orgName || 'Organization-wide'} fallback="/(tabs)/user-management" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

          {/* ── Organization Logo ── */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="business" size={20} color="#1A73E8" />
              <Text style={s.cardTitle}>Organization Logo</Text>
            </View>
            <Text style={s.hint}>Shown on generated documents (case reports, lab slips, consent forms) and in the app.</Text>
            <View style={s.logoRow}>
              {orgLogo ? (
                <Image source={{ uri: orgLogo }} style={s.logoPreview} />
              ) : (
                <View style={[s.logoPreview, s.logoPreviewPlaceholder]}>
                  <Ionicons name="business" size={28} color="#94A3B8" />
                </View>
              )}
              <TouchableOpacity
                style={[s.logoChangeBtn, logoUploading && { opacity: 0.6 }]}
                onPress={handlePickLogo}
                disabled={logoUploading}
                data-testid="change-org-logo-btn"
              >
                {logoUploading ? (
                  <ActivityIndicator color="#1A73E8" size="small" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={16} color="#1A73E8" style={{ marginRight: 6 }} />
                    <Text style={s.logoChangeBtnText}>{orgLogo ? 'Change Logo' : 'Upload Logo'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 24-Hour Advance Scheduling ── */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="time" size={20} color="#1A73E8" />
              <Text style={s.cardTitle}>24-Hour Advance Scheduling</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={s.hint}>
                When on, Students and Supervisors cannot schedule a procedure less than 24 hours before the appointment. You (Implant In-Charge) can always schedule at any time regardless of this setting.
              </Text>
              {restrictionSaving ? (
                <ActivityIndicator color="#1A73E8" style={{ marginLeft: 12 }} />
              ) : (
                <Switch
                  value={enforceRestriction}
                  onValueChange={toggleRestriction}
                  trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                  thumbColor={enforceRestriction ? '#1A73E8' : '#F1F5F9'}
                  style={{ marginLeft: 12 }}
                  data-testid="scheduling-restriction-toggle"
                />
              )}
            </View>
          </View>

          {/* ── Time Slot Mode ── */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-outline" size={22} color="#1A73E8" />
                <Text style={s.cardTitle}>Time Slot Mode</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHelpModal(true)} style={{ padding: 4 }} data-testid="scheduling-help-btn">
                <Ionicons name="help-circle-outline" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={s.hint}>Controls what students and supervisors see when picking a procedure time during case creation.</Text>

            <View style={s.modeRow}>
              {([
                { key: 'default', label: 'Default', desc: 'Use system default settings', icon: 'checkmark-circle-outline' },
                { key: 'custom', label: 'Custom Slots', desc: 'Define specific time slots and days', icon: 'list-outline' },
                { key: 'open', label: 'Open Window', desc: 'Allow any time within a date range', icon: 'timer-outline' },
              ] as const).map(opt => {
                const active = mode === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.modeCard, active && s.modeCardActive]}
                    onPress={() => setMode(opt.key)}
                    data-testid={`sched-mode-${opt.key}`}
                  >
                    {active && (
                      <View style={s.cardCheckBadge}>
                        <Ionicons name="checkmark-circle" size={18} color="#1A73E8" />
                      </View>
                    )}
                    <Ionicons name={opt.icon as any} size={24} color={active ? '#1A73E8' : '#64748B'} style={{ marginBottom: 8 }} />
                    <Text style={[s.modeCardTitle, active && s.modeCardTitleActive]}>{opt.label}</Text>
                    <Text style={[s.modeCardDesc, active && s.modeCardDescActive]}>{opt.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === 'default' && (
              <View style={s.modeBody}>
                <Text style={s.modeBodyHint}>The original fixed slots. Sunday is fully blocked.</Text>
                {DEFAULT_SLOTS_PREVIEW.map((d, i) => (
                  <View key={i} style={s.previewRow}>
                    <Text style={s.previewTime}>{d.label}</Text>
                    <Text style={s.previewDays}>{d.days}</Text>
                  </View>
                ))}
              </View>
            )}

            {mode === 'custom' && (
              <View style={s.modeBody}>
                {/* Custom Slots Sub-Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <View style={s.subHeaderIconBg}>
                    <Ionicons name="time-outline" size={18} color="#1A73E8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.subHeaderTitle}>Define Time Slots</Text>
                    <Text style={s.subHeaderHint}>Add named time slots and select the days they are available.</Text>
                  </View>
                </View>

                {customSlots.map((slot, idx) => (
                  <View key={idx} style={s.slotCard} data-testid={`custom-slot-${idx}`}>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' }}>
                      
                      {/* Label input field */}
                      <View style={[s.inputGroup, { flex: 1.2 }]}>
                        {/* <Ionicons name="pricetag-outline" size={16} color="#64748B" style={{ marginRight: 6 }} /> */}
                        <View style={{ flex: 1 }}>
                          <Text style={s.inputInsideLabel}>Label</Text>
                          <TextInput
                            style={s.slotInputClean}
                            placeholder="e.g. Morning"
                            placeholderTextColor="#94A3B8"
                            value={slot.label}
                            onChangeText={(v) => setCustomSlots(prev => prev.map((s2, i) => i === idx ? { ...s2, label: v } : s2))}
                            data-testid={`custom-slot-label-${idx}`}
                          />
                        </View>
                      </View>

                      {/* Time Dropdown field */}
                      <TouchableOpacity
                        style={[s.inputGroup, { flex: 1 }]}
                        onPress={() => setActivePickerSlotIdx(idx)}
                        data-testid={`custom-slot-time-${idx}`}
                      >
                        {/* <Ionicons name="time-outline" size={16} color="#64748B" style={{ marginRight: 6 }} /> */}
                        <View style={{ flex: 1 }}>
                          <Text style={s.inputInsideLabel}>Time</Text>
                          <Text 
                            style={[s.slotInputCleanText, !slot.time && { color: '#94A3B8' }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {slot.time ? formatTime(slot.time) : '--:--'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-down-outline" size={14} color="#64748B" />
                      </TouchableOpacity>

                      {/* Delete Button (Red trash can inside a pink card) */}
                      <TouchableOpacity
                        style={s.slotRemoveBtnSolid}
                        onPress={() => removeSlot(idx)}
                        disabled={customSlots.length <= 1}
                        data-testid={`custom-slot-remove-${idx}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={customSlots.length <= 1 ? '#FCA5A5' : '#EF4444'} />
                      </TouchableOpacity>
                    </View>

                    {/* Days Row */}
                    <Text style={s.daysSectionLabel}>Available on</Text>
                    <View style={s.dayChipsRow}>
                      {WEEKDAYS.map(day => {
                        const active = slot.days.includes(day);
                        return (
                          <TouchableOpacity
                            key={day}
                            style={[s.dayChip, active && s.dayChipActive]}
                            onPress={() => toggleSlotDay(idx, day)}
                            data-testid={`custom-slot-${idx}-day-${day}`}
                          >
                            <Text style={[s.dayChipText, active && s.dayChipTextActive]}>{day}</Text>
                            {active ? (
                              <View style={s.dayChipBadgeSelected}>
                                <Ionicons name="checkmark" size={8} color="#FFF" />
                              </View>
                            ) : (
                              <View style={s.dayChipBadgeUnselected} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}

                <TouchableOpacity style={s.addSlotBtnDashed} onPress={addSlot} data-testid="add-custom-slot">
                  <Ionicons name="add-circle" size={18} color="#1A73E8" style={{ marginRight: 8 }} />
                  <Text style={s.addSlotBtnText}>Add Time Slot</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'open' && (
              <View style={s.modeBody}>
                <Text style={s.modeBodyHint}>
                  Students and supervisors pick any start time directly. A booking automatically occupies the next N hours you set below — e.g. picking 10:00 AM with a 2-hour window blocks until 12:00 PM.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <Text style={s.durationLabel}>Slot Duration</Text>
                  <TextInput
                    style={s.durationInput}
                    value={openWindowHours}
                    onChangeText={setOpenWindowHours}
                    keyboardType="decimal-pad"
                    maxLength={4}
                    data-testid="open-window-hours"
                  />
                  <Text style={s.durationUnit}>hours</Text>
                </View>
                {!Number.isNaN(parseFloat(openWindowHours)) && parseFloat(openWindowHours) > 0 && (
                  <Text style={s.slotPreview}>
                    Example: 10:00 AM occupies until {formatTime(
                      (() => {
                        const h = parseFloat(openWindowHours) || 0;
                        const startMin = 10 * 60;
                        const endMin = startMin + Math.round(h * 60);
                        const hh = Math.floor((endMin / 60) % 24).toString().padStart(2, '0');
                        const mm = (endMin % 60).toString().padStart(2, '0');
                        return `${hh}:${mm}`;
                      })()
                    )}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[s.saveBtnSolid, saving && { opacity: 0.6 }]}
              onPress={saveScheduleMode}
              disabled={saving}
              data-testid="save-scheduling-config"
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={s.saveBtnText}>Save Time Slot Settings</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {activePickerSlotIdx !== null && (
        <Modal
          visible={activePickerSlotIdx !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setActivePickerSlotIdx(null)}
        >
          <Pressable style={s.modalOverlay} onPress={() => setActivePickerSlotIdx(null)}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Select Time</Text>
                <TouchableOpacity onPress={() => setActivePickerSlotIdx(null)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={TIME_OPTIONS}
                keyExtractor={item => item.value}
                renderItem={({ item }) => {
                  const currentSlotTime = customSlots[activePickerSlotIdx]?.time;
                  const selected = currentSlotTime === item.value;
                  return (
                    <TouchableOpacity
                      style={[s.modalItem, selected && s.modalItemSelected]}
                      onPress={() => {
                        setCustomSlots(prev => prev.map((s, i) => i === activePickerSlotIdx ? { ...s, time: item.value } : s));
                        setActivePickerSlotIdx(null);
                      }}
                    >
                      <Text style={[s.modalItemText, selected && s.modalItemTextSelected]}>{item.label}</Text>
                      {selected && <Ionicons name="checkmark" size={18} color="#1A73E8" />}
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            </View>
          </Pressable>
        </Modal>
      )}

      {showHelpModal && (
        <Modal
          visible={showHelpModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowHelpModal(false)}
        >
          <Pressable style={s.modalOverlay} onPress={() => setShowHelpModal(false)}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Time Slot Modes Guide</Text>
                <TouchableOpacity onPress={() => setShowHelpModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={s.helpTitle}>How Time Slot Modes Work</Text>
                
                <Text style={s.helpSubtitle}>1. Default Mode</Text>
                <Text style={s.helpText}>
                  Uses pre-configured fixed organization slots:
                  {'\n'}• 10:00 AM (Monday to Saturday)
                  {'\n'}• 02:00 PM (Monday to Friday)
                </Text>

                <Text style={s.helpSubtitle}>2. Custom Slots</Text>
                <Text style={s.helpText}>
                  Define your own time slots by specifying a label (like "Morning"), a start time, and selection of days.
                </Text>
                <View style={s.exampleBox}>
                  <Text style={s.exampleTextBold}>Example:</Text>
                  <Text style={s.exampleText}>
                    • Slot 1: "Morning" at 09:00 AM (offered Mon – Fri)
                    {'\n'}• Slot 2: "Afternoon" at 02:00 PM (offered Mon – Sat)
                  </Text>
                </View>

                <Text style={s.helpSubtitle}>3. Open Window</Text>
                <Text style={s.helpText}>
                  Supervisors and students can pick ANY custom start time they want. A case booking blocks out a slot for the duration you configure (e.g. 2 hours).
                </Text>

                <TouchableOpacity style={s.helpCloseBtn} onPress={() => setShowHelpModal(false)}>
                  <Text style={s.helpCloseBtnText}>Got it</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0A192F',
  },
  hint: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    fontWeight: '500',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logoPreviewPlaceholder: {
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1A73E8',
    backgroundColor: '#F0F7FF',
  },
  logoChangeBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A73E8',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
  },
  modeCard: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
    position: 'relative',
  },
  modeCardActive: {
    backgroundColor: '#F0F7FF',
    borderColor: '#1A73E8',
  },
  cardCheckBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFF',
    borderRadius: 9,
    zIndex: 10,
  },
  modeCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 4,
  },
  modeCardTitleActive: {
    color: '#1A73E8',
  },
  modeCardDesc: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 14,
  },
  modeCardDescActive: {
    color: '#1A73E8',
  },
  modeBody: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1.5,
    borderTopColor: '#F1F5F9',
  },
  modeBodyHint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
    fontWeight: '500',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewTime: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  previewDays: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  subHeaderIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0A192F',
  },
  subHeaderHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  slotCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  inputGroup: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    height: 52,
  },
  inputInsideLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  slotInputClean: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '800',
    padding: 0,
  },
  slotRemoveBtnSolid: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  slotInputCleanText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '800',
    marginTop: 2,
  },
  daysSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 4,
  },
  dayChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 4,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayChipActive: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  dayChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayChipTextActive: {
    color: '#FFF',
  },
  dayChipBadgeSelected: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#1A73E8',
    borderRadius: 7,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipBadgeUnselected: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  modalItemSelected: {
    backgroundColor: '#F0F7FF',
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  modalItemTextSelected: {
    color: '#1A73E8',
    fontWeight: '800',
  },
  addSlotBtnDashed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#1A73E8',
    backgroundColor: '#FFF',
  },
  addSlotBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A73E8',
  },
  durationLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  durationInput: {
    width: 80,
    borderWidth: 2,
    borderColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: '#FFF',
    color: '#1A73E8',
  },
  durationUnit: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  slotPreview: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A73E8',
    marginTop: 10,
  },
  saveBtnSolid: {
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 20,
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  helpSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A73E8',
    marginTop: 14,
    marginBottom: 4,
  },
  helpText: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
  },
  exampleBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  exampleTextBold: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  helpCloseBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  helpCloseBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
