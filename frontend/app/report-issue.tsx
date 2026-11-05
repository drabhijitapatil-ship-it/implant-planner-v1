/**
 * Report an Issue — any signed-in user describes a problem and attaches
 * screenshots; Implanr super admins see it under Super Admin → Issue Reports.
 *
 * Users take a normal phone screenshot of the problem and attach it here
 * (screenshot blocking is off app-wide, see app/_layout.tsx).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Device from 'expo-device';
import api from '../utils/api';
import { appVersionLabel } from '../utils/appVersion';
import { safeLaunchLibrary } from '../utils/safePicker';
import { uploadErrorMessage } from '../utils/consentUpload';

const CATEGORIES = [
  { key: 'not_working', label: 'Something isn’t working', icon: 'bug-outline' },
  { key: 'wrong_data', label: 'Wrong or missing data', icon: 'alert-circle-outline' },
  { key: 'slow_or_crash', label: 'Slow / app closes', icon: 'speedometer-outline' },
  { key: 'suggestion', label: 'Suggestion', icon: 'bulb-outline' },
  { key: 'other', label: 'Other', icon: 'help-circle-outline' },
] as const;

const STATUS_LABEL: Record<string, { label: string; fg: string; bg: string }> = {
  new: { label: 'Received', fg: '#1565C0', bg: '#E3F2FD' },
  in_progress: { label: 'Being looked at', fg: '#EF6C00', bg: '#FFF3E0' },
  resolved: { label: 'Resolved', fg: '#2E7D32', bg: '#E8F5E9' },
  closed: { label: 'Closed', fg: '#546E7A', bg: '#ECEFF1' },
};

const MAX_SHOTS = 5;

type Shot = { uri: string; filename?: string; uploading: boolean };

export default function ReportIssueScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [category, setCategory] = useState<string>('not_working');
  const [description, setDescription] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<any[]>([]);
  const loadMine = useCallback(() => {
    api.get('/issues/mine').then((r) => setMine(r.data || [])).catch(() => {});
  }, []);
  useEffect(loadMine, [loadMine]);

  const addShots = async () => {
    try {
      const room = MAX_SHOTS - shots.length;
      if (room <= 0) return;
      const result = await safeLaunchLibrary({
        mediaTypes: ['images'] as any,
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: room,
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets.slice(0, room);
      const start = shots.length;
      setShots((prev) => [...prev, ...picked.map((a) => ({ uri: a.uri, uploading: true }))]);
      await Promise.all(picked.map(async (a, i) => {
        const fd = new FormData();
        const name = a.fileName || `screenshot_${Date.now()}_${i}.jpg`;
        if (Platform.OS === 'web') {
          const blob = await fetch(a.uri).then((r) => r.blob());
          fd.append('file', blob, name);
        } else {
          fd.append('file', { uri: a.uri, name, type: a.mimeType || 'image/jpeg' } as any);
        }
        try {
          const res = await api.post('/issues/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
          setShots((prev) => prev.map((s, j) => (j === start + i ? { ...s, filename: res.data.filename, uploading: false } : s)));
        } catch (err) {
          setShots((prev) => prev.filter((_, j) => j !== start + i));
          Alert.alert('Screenshot not added', uploadErrorMessage(err, 'Could not upload the screenshot'));
        }
      }));
    } catch (err: any) {
      Alert.alert('Photos unavailable', err?.message || 'Could not open your photos.');
    }
  };

  const submit = async () => {
    if (description.trim().length < 10) {
      Alert.alert('Tell us a bit more', 'Please describe the problem in at least a sentence.');
      return;
    }
    if (shots.some((s) => s.uploading)) {
      Alert.alert('Please wait', 'Screenshots are still uploading.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/issues', {
        category,
        description: description.trim(),
        screen: typeof from === 'string' ? from : null,
        app_version: appVersionLabel(),
        platform: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
        device: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || null,
        attachments: shots.map((s) => s.filename).filter(Boolean),
      });
      setDescription('');
      setShots([]);
      loadMine();
      Alert.alert('Thank you', 'Your report has been sent to the Implanr team. You can follow its status below.');
    } catch (err: any) {
      Alert.alert('Not sent', err?.response?.data?.detail || 'Could not send your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="report-issue-back">
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={s.title}>Report an Issue</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>Tell us what went wrong. Your report goes straight to the Implanr team.</Text>

        <Text style={s.label}>What kind of issue?</Text>
        <View style={s.chips}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity key={c.key} style={[s.chip, active && s.chipActive]} onPress={() => setCategory(c.key)} testID={`issue-cat-${c.key}`}>
                <Ionicons name={c.icon as any} size={15} color={active ? '#FFF' : '#1565C0'} />
                <Text style={[s.chipText, active && { color: '#FFF' }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.label}>What happened?</Text>
        <TextInput
          style={s.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Which screen, what you tapped, what you expected and what happened instead…"
          placeholderTextColor="#90A4AE"
          multiline
          maxLength={4000}
          textAlignVertical="top"
          testID="issue-description"
        />

        <Text style={s.label}>Screenshots (optional, up to {MAX_SHOTS})</Text>
        <Text style={s.hint}>Take a screenshot of the problem screen, then add it here.</Text>
        <View style={s.shotRow}>
          {shots.map((sh, i) => (
            <View key={`${sh.uri}-${i}`} style={s.shot}>
              <Image source={{ uri: sh.uri }} style={s.shotImg} />
              {sh.uploading ? (
                <View style={s.shotOverlay}><ActivityIndicator color="#FFF" /></View>
              ) : (
                <TouchableOpacity style={s.shotRemove} onPress={() => setShots((prev) => prev.filter((_, j) => j !== i))}>
                  <Ionicons name="close" size={14} color="#FFF" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {shots.length < MAX_SHOTS && (
            <TouchableOpacity style={[s.shot, s.shotAdd]} onPress={addShots} testID="issue-add-screenshots">
              <Ionicons name="add" size={26} color="#1565C0" />
              <Text style={s.shotAddText}>Add screenshots</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.meta}>Sent with your report: app version {appVersionLabel()}, {Platform.OS === 'ios' ? 'iPhone/iPad' : 'Android'}{from ? `, screen ${from}` : ''}.</Text>

        <TouchableOpacity style={[s.submit, submitting && { opacity: 0.7 }]} onPress={submit} disabled={submitting} testID="issue-submit">
          {submitting ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Ionicons name="send" size={16} color="#FFF" />
              <Text style={s.submitText}>Send report</Text>
            </>
          )}
        </TouchableOpacity>

        {mine.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={s.label}>Your reports</Text>
            {mine.map((r) => {
              const st = STATUS_LABEL[r.status] || STATUS_LABEL.new;
              return (
                <View key={r.id} style={s.mineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mineText} numberOfLines={2}>{r.description}</Text>
                    <Text style={s.mineDate}>{(r.created_at || '').slice(0, 10)}</Text>
                    {!!r.admin_note && <Text style={s.mineNote}>Implanr team: {r.admin_note}</Text>}
                  </View>
                  <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillText, { color: st.fg }]}>{st.label}</Text></View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E9F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginLeft: 4 },
  intro: { fontSize: 14, color: '#546E7A', marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#BBDEFB', backgroundColor: '#FFF' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  input: { minHeight: 130, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 12, padding: 12, fontSize: 15, color: '#1A1A1A', marginBottom: 18 },
  shotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  shot: { width: 92, height: 140, borderRadius: 10, overflow: 'hidden', backgroundColor: '#ECEFF1' },
  shotImg: { width: '100%', height: '100%' },
  shotOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  shotRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  shotAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#90CAF9', backgroundColor: '#F3F8FE' },
  shotAddText: { fontSize: 11, fontWeight: '600', color: '#1565C0', textAlign: 'center', marginTop: 4, paddingHorizontal: 6 },
  meta: { fontSize: 11, color: '#90A4AE', marginBottom: 16 },
  hint: { fontSize: 12, color: '#78909C', marginTop: -4, marginBottom: 10 },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14 },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  mineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E3EAF2', padding: 12, marginBottom: 8 },
  mineText: { fontSize: 13, color: '#263238' },
  mineDate: { fontSize: 11, color: '#90A4AE', marginTop: 3 },
  mineNote: { fontSize: 12, color: '#2E7D32', marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
});
