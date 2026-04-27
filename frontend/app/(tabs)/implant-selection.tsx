import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import api from '../../utils/api';
import DrillingProtocolScreen from '../../components/DrillingProtocol';
import { getImplantDetails } from '../../constants/implantIndications';
import { evaluateImplantSafety, annotateImplantSafety, shortSafetyChip, type SafetyVerdict } from '../../utils/implantSafety';

// ── Types ──────────────────────────────────────────────────
type ImplantSystem = {
  brand: string;
  system: string;
  diameters: number[];
  lengths: number[];
  count: number;
  indication?: string;
  restricted_teeth?: string[];
};

type Implant = { brand: string; system: string; diameter: number; length: number };
type ToothRec = { region: string; diameter: [number, number]; length: [number, number] };
type SuggestSystem = {
  brand: string;
  system: string;
  indication: string;
  implants: { diameter: number; length: number }[];
};

// ── FDI Chart ──────────────────────────────────────────────
const UPPER_RIGHT = ['17', '16', '15', '14', '13', '12', '11'];
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27'];
const LOWER_RIGHT = ['47', '46', '45', '44', '43', '42', '41'];
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37'];

const TOOTH_TYPE: Record<string, string> = {};
['16', '17', '26', '27', '36', '37', '46', '47'].forEach((t) => (TOOTH_TYPE[t] = 'molar'));
['14', '15', '24', '25', '34', '35', '44', '45'].forEach((t) => (TOOTH_TYPE[t] = 'premolar'));
['13', '23', '33', '43'].forEach((t) => (TOOTH_TYPE[t] = 'canine'));
['11', '12', '21', '22', '31', '32', '41', '42'].forEach((t) => (TOOTH_TYPE[t] = 'incisor'));

function getToothWidth(tooth: string) {
  const t = TOOTH_TYPE[tooth];
  return t === 'molar' ? 26 : t === 'premolar' ? 23 : t === 'canine' ? 22 : 20;
}

// ── Shared: Tooth Button ───────────────────────────────────
function Tooth({ tooth, isSelected, onPress, isUpper }: {
  tooth: string; isSelected: boolean; onPress: () => void; isUpper: boolean;
}) {
  const w = getToothWidth(tooth);
  const isMolar = TOOTH_TYPE[tooth] === 'molar';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} data-testid={`tooth-${tooth}`}
      style={[toothS.tooth, {
        width: w,
        height: isMolar ? 34 : TOOTH_TYPE[tooth] === 'premolar' ? 32 : TOOTH_TYPE[tooth] === 'canine' ? 30 : 28,
        borderRadius: isMolar ? 5 : 9,
        backgroundColor: isSelected ? '#1E88E5' : '#E8EDF2',
        borderColor: isSelected ? '#1565C0' : '#C5CDD5',
      }]}
    >
      <Text style={[toothS.num, { color: isSelected ? '#FFF' : '#37474F' }]}>{tooth}</Text>
    </TouchableOpacity>
  );
}
const toothS = StyleSheet.create({
  tooth: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginHorizontal: 1 },
  num: { fontWeight: '700', fontSize: 10 },
});

// ── Shared: FDI Dental Chart Component ─────────────────────
function FDIChart({ selectedTooth, onSelect }: {
  selectedTooth: string | null;
  onSelect: (tooth: string) => void;
}) {
  const renderRow = (teeth: string[], isUpper: boolean, leftTeeth: string[]) => (
    <View style={s.jawRow}>
      <View style={s.quadrant}>
        <View style={s.teethRow}>
          {teeth.map((t) => (
            <Tooth key={t} tooth={t} isSelected={selectedTooth === t} isUpper={isUpper}
              onPress={() => onSelect(t)} />
          ))}
        </View>
      </View>
      <View style={s.midline} />
      <View style={s.quadrant}>
        <View style={s.teethRow}>
          {leftTeeth.map((t) => (
            <Tooth key={t} tooth={t} isSelected={selectedTooth === t} isUpper={isUpper}
              onPress={() => onSelect(t)} />
          ))}
        </View>
      </View>
    </View>
  );
  return (
    <View>
      <Text style={s.jawLabel}>Upper Jaw (Maxillary)</Text>
      {renderRow(UPPER_RIGHT, true, UPPER_LEFT)}
      <View style={s.jawDivider} />
      <Text style={s.jawLabel}>Lower Jaw (Mandibular)</Text>
      {renderRow(LOWER_RIGHT, false, LOWER_LEFT)}
    </View>
  );
}

// ── Shared: Tooth Recommendation Box ───────────────────────
function ToothRecBox({ tooth, info }: { tooth: string; info: ToothRec }) {
  return (
    <View style={s.toothRecBox}>
      <View style={s.toothRecHeader}>
        <Ionicons name="information-circle" size={18} color="#1565C0" />
        <Text style={s.toothRecTitle}>Tooth {tooth}: {info.region}</Text>
      </View>
      <View style={s.toothRecRow}>
        <Text style={s.toothRecLabel}>Recommended Diameter:</Text>
        <Text style={s.toothRecVal}>{info.diameter[0]} – {info.diameter[1]} mm</Text>
      </View>
      <View style={s.toothRecRow}>
        <Text style={s.toothRecLabel}>Recommended Length:</Text>
        <Text style={s.toothRecVal}>{info.length[0]} – {info.length[1]} mm</Text>
      </View>
    </View>
  );
}

// ── MAIN SCREEN ────────────────────────────────────────────
export default function ImplantSelectionScreen() {
  const [activeTab, setActiveTab] = useState<'choose' | 'suggest'>('choose');
  const [systems, setSystems] = useState<ImplantSystem[]>([]);
  const [toothRecs, setToothRecs] = useState<Record<string, ToothRec>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // "Let Me Choose" states
  const [cTooth, setCTooth] = useState<string | null>(null);
  const [cSystem, setCSystem] = useState<ImplantSystem | null>(null);
  const [cWidth, setCWidth] = useState('');
  const [cHeight, setCHeight] = useState('');
  const [cResult, setCResult] = useState<any>(null);
  const [cSearching, setCSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // "Suggest Me" states
  const [sTooth, setSTooth] = useState<string | null>(null);
  const [sProcedures, setSProcedures] = useState<string[]>([]);
  const [sBoneType, setSBoneType] = useState('');
  const [sWidth, setSWidth] = useState('');
  const [sHeight, setSHeight] = useState('');
  const [sResult, setSResult] = useState<any>(null);
  const [sSearching, setSSearching] = useState(false);
  const [showBoneTypeDD, setShowBoneTypeDD] = useState(false);

  // Drilling Protocol states
  const [showDrillingProtocol, setShowDrillingProtocol] = useState(false);
  const [selectedDrillImplant, setSelectedDrillImplant] = useState<{
    brand: string; system: string; diameter: number; length: number;
  } | null>(null);
  const [selectedDrillTooth, setSelectedDrillTooth] = useState('');

  const PROCEDURES = [
    'Conventional Implant Placement',
    'Conventional Implant Placement with Bone Graft',
    'Immediate Implant Placement',
    'Immediate Implant Placement with Bone Graft',
    'Sinus Lift',
    'Restricted Bone Height',
    'Narrow Ridge',
  ];
  const BONE_TYPES = ['D1', 'D2', 'D3', 'D4'];

  useEffect(() => {
    Promise.all([
      api.get('/implant-library/systems'),
      api.get('/implant-library/tooth-recommendations'),
    ])
      .then(([sysRes, toothRes]) => {
        setSystems(sysRes.data || []);
        setToothRecs(toothRes.data || {});
      })
      .catch((err) => setLoadError(err?.response?.data?.detail || err?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  // ── Let Me Choose: handlers ──
  const handleChooseSuggest = async () => {
    if (!cTooth || !cSystem || !cWidth || !cHeight) return;
    setCSearching(true);
    setCResult(null);
    try {
      const res = await api.get('/implant-library/suggest', {
        params: { brand: cSystem.brand, system: cSystem.system, bone_width: parseFloat(cWidth), bone_height: parseFloat(cHeight), tooth: cTooth },
      });
      setCResult(res.data);
    } catch { Alert.alert('Error', 'Failed to get suggestion.'); }
    finally { setCSearching(false); }
  };

  const resetChoose = () => { setCTooth(null); setCSystem(null); setCWidth(''); setCHeight(''); setCResult(null); };

  // ── Suggest Me: handlers ──
  const toggleProcedure = (proc: string) => {
    setSProcedures((prev) => prev.includes(proc) ? prev.filter((p) => p !== proc) : [...prev, proc]);
    setSResult(null);
  };

  const handleSuggestMe = async () => {
    if (!sProcedures.length || !sBoneType || !sWidth || !sHeight) return;
    setSSearching(true);
    setSResult(null);
    try {
      const res = await api.post('/implant-library/suggest-auto', {
        tooth: sTooth, procedures: sProcedures, bone_type: sBoneType,
        bone_width: parseFloat(sWidth), bone_height: parseFloat(sHeight),
      });
      setSResult(res.data);
    } catch { Alert.alert('Error', 'Failed to get suggestions.'); }
    finally { setSSearching(false); }
  };

  const resetSuggest = () => { setSTooth(null); setSProcedures([]); setSBoneType(''); setSWidth(''); setSHeight(''); setSResult(null); };

  // Drilling Protocol handler
  const openDrillingProtocol = (implant: { brand: string; system: string; diameter: number; length: number }, tooth: string) => {
    setSelectedDrillImplant(implant);
    setSelectedDrillTooth(tooth);
    setShowDrillingProtocol(true);
  };

  // helpers
  const cToothInfo = cTooth ? toothRecs[cTooth] : null;
  const sToothInfo = sTooth ? toothRecs[sTooth] : null;

  if (loading) return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.center}><ActivityIndicator size="large" color="#1E88E5" /><Text style={s.centerText}>Loading implant data...</Text></View>
    </SafeAreaView>
  );
  if (loadError) return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.center}><Ionicons name="alert-circle" size={48} color="#D32F2F" /><Text style={s.errText}>{loadError}</Text></View>
    </SafeAreaView>
  );

  // Show Drilling Protocol screen as full overlay
  if (showDrillingProtocol && selectedDrillImplant) {
    return (
      <DrillingProtocolScreen
        implant={selectedDrillImplant}
        tooth={selectedDrillTooth}
        onClose={() => { setShowDrillingProtocol(false); setSelectedDrillImplant(null); }}
      />
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Ionicons name="medical" size={26} color="#1E88E5" />
          <Text style={s.headerTitle}>Implant Selection</Text>
        </View>

        {/* ── Tab Bar ── */}
        <View style={s.tabBar} data-testid="implant-tab-bar">
          <TouchableOpacity
            style={[s.tab, activeTab === 'choose' && s.tabActive]}
            onPress={() => setActiveTab('choose')}
            data-testid="tab-let-me-choose"
          >
            <Ionicons name="hand-left-outline" size={16} color={activeTab === 'choose' ? '#FFF' : '#546E7A'} />
            <Text style={[s.tabText, activeTab === 'choose' && s.tabTextActive]}>Let Me Choose</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'suggest' && s.tabActive]}
            onPress={() => setActiveTab('suggest')}
            data-testid="tab-suggest-me"
          >
            <Ionicons name="bulb-outline" size={16} color={activeTab === 'suggest' ? '#FFF' : '#546E7A'} />
            <Text style={[s.tabText, activeTab === 'suggest' && s.tabTextActive]}>Suggest Me</Text>
          </TouchableOpacity>
        </View>

        {/* ═════════════════════════════════════════════════ */}
        {/* TAB 1: LET ME CHOOSE                            */}
        {/* ═════════════════════════════════════════════════ */}
        {activeTab === 'choose' && (
          <View>
            {/* Step 1: Select Tooth */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Select Tooth</Text>
              <FDIChart selectedTooth={cTooth} onSelect={(t) => { setCTooth(t); setCSystem(null); setCWidth(''); setCHeight(''); setCResult(null); }} />
              {cTooth && cToothInfo && <ToothRecBox tooth={cTooth} info={cToothInfo} />}
            </View>

            {/* Step 2: Select System */}
            <View style={[s.card, !cTooth && s.cardOff]}>
              <Text style={s.cardTitle}>Select Implant System</Text>
              <TouchableOpacity style={s.dropdown} onPress={() => { if (cTooth) { setShowDropdown(true); setSearchQuery(''); } }} data-testid="system-dropdown">
                <Ionicons name="medical" size={18} color={cTooth ? '#1E88E5' : '#B0BEC5'} />
                <Text style={cSystem ? s.ddText : s.ddPlaceholder}>
                  {cSystem ? `${cSystem.brand} – ${cSystem.system}` : `Select Implant System (${systems.length})`}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#8E8E93" />
              </TouchableOpacity>
              {/* ── Verbatim Indications & Features from institutional doc ── */}
              {(() => {
                const detail = cSystem ? getImplantDetails(cSystem.brand, cSystem.system) : null;
                if (!detail) {
                  // Fallback to the legacy short indication when the system isn't in the doc yet.
                  return cSystem?.indication ? (
                    <View style={s.indBox}><Ionicons name="information-circle" size={14} color="#0D47A1" /><Text style={s.indText}>{cSystem.indication}</Text></View>
                  ) : null;
                }
                return (
                  <>
                    {detail.indications ? (
                      <View style={s.indBox} testID="lmc-indications-detail">
                        <Ionicons name="checkmark-circle" size={14} color="#0D47A1" />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.indText, { fontStyle: 'normal', fontWeight: '700', marginBottom: 2 }]}>Indications</Text>
                          <Text style={s.indText}>{detail.indications}</Text>
                        </View>
                      </View>
                    ) : null}
                    {detail.features ? (
                      <View style={s.indBox} testID="lmc-features-detail">
                        <Ionicons name="sparkles" size={14} color="#0D47A1" />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.indText, { fontStyle: 'normal', fontWeight: '700', marginBottom: 2 }]}>Features</Text>
                          <Text style={s.indText}>{detail.features}</Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                );
              })()}
            </View>

            {/* Step 3: Bone Measurements */}
            <View style={[s.card, !cSystem && s.cardOff]}>
              <Text style={s.cardTitle}>Enter Bone Measurements</Text>
              <BoneInputs width={cWidth} height={cHeight} setWidth={(v) => { setCWidth(v); setCResult(null); }} setHeight={(v) => { setCHeight(v); setCResult(null); }} enabled={!!cSystem} tooth={cTooth} />
              <RidgeClassIndicator width={cWidth} />
              <TouchableOpacity style={[s.primaryBtn, (!cSystem || !cWidth || !cHeight) && s.btnOff]} onPress={handleChooseSuggest}
                disabled={!cSystem || !cWidth || !cHeight || cSearching} data-testid="find-best-btn">
                {cSearching ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <><Ionicons name="search" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Find Best Implant</Text></>
                )}
              </TouchableOpacity>
            </View>

            {/* Result */}
            {cResult && <ChooseResult result={cResult} system={cSystem!} tooth={cTooth!} toothInfo={cToothInfo} boneWidth={cWidth} boneHeight={cHeight} onReset={resetChoose} onOpenProtocol={openDrillingProtocol} />}
          </View>
        )}

        {/* ═════════════════════════════════════════════════ */}
        {/* TAB 2: SUGGEST ME                               */}
        {/* ═════════════════════════════════════════════════ */}
        {activeTab === 'suggest' && (
          <View>
            {/* Step 1: Select Tooth */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Select Tooth</Text>
              <FDIChart selectedTooth={sTooth} onSelect={(t) => { setSTooth(t); setSResult(null); }} />
              {sTooth && sToothInfo && <ToothRecBox tooth={sTooth} info={sToothInfo} />}
            </View>

            {/* Step 2: Procedure Type */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Implant Procedure Type</Text>
              <Text style={s.subLabel}>Select one or more procedures:</Text>
              {PROCEDURES.map((proc) => {
                const selected = sProcedures.includes(proc);
                return (
                  <TouchableOpacity key={proc} style={[s.procChip, selected && s.procChipActive]}
                    onPress={() => toggleProcedure(proc)} data-testid={`proc-${proc.replace(/\s+/g, '-').toLowerCase()}`}>
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? '#1E88E5' : '#90A4AE'} />
                    <Text style={[s.procChipText, selected && s.procChipTextActive]}>{proc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Step 3: Bone Type */}
            <View style={[s.card, !sProcedures.length && s.cardOff]}>
              <Text style={s.cardTitle}>Bone Type</Text>
              <View style={s.boneTypeRow}>
                {BONE_TYPES.map((bt) => (
                  <TouchableOpacity key={bt} style={[s.boneTypeBtn, sBoneType === bt && s.boneTypeBtnActive]}
                    onPress={() => { if (sProcedures.length) { setSBoneType(bt); setSResult(null); } }}
                    data-testid={`bone-type-${bt}`}>
                    <Text style={[s.boneTypeBtnText, sBoneType === bt && s.boneTypeBtnTextActive]}>{bt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Step 4: Bone Measurements */}
            <View style={[s.card, !sBoneType && s.cardOff]}>
              <Text style={s.cardTitle}>Bone Measurements</Text>
              <BoneInputs width={sWidth} height={sHeight} setWidth={(v) => { setSWidth(v); setSResult(null); }} setHeight={(v) => { setSHeight(v); setSResult(null); }} enabled={!!sBoneType} tooth={sTooth} />
              <RidgeClassIndicator width={sWidth} />
              <TouchableOpacity style={[s.suggestBtn, (!sBoneType || !sWidth || !sHeight || !sProcedures.length) && s.btnOff]}
                onPress={handleSuggestMe} disabled={!sBoneType || !sWidth || !sHeight || !sProcedures.length || sSearching}
                data-testid="suggest-me-btn">
                {sSearching ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <><Ionicons name="bulb" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Suggest Me</Text></>
                )}
              </TouchableOpacity>
            </View>

            {/* Result */}
            {sResult && <SuggestResult result={sResult} tooth={sTooth} toothInfo={sToothInfo} onReset={resetSuggest} onOpenProtocol={openDrillingProtocol} />}
          </View>
        )}

        {/* ── System Dropdown Modal (shared for "Let Me Choose") ── */}
        <Modal visible={showDropdown} animationType="slide" transparent statusBarTranslucent={Platform.OS === 'android'} onRequestClose={() => setShowDropdown(false)}>
          <Pressable style={s.modalOverlay} onPress={() => setShowDropdown(false)}>
            <Pressable style={s.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Select Implant System</Text>
                <TouchableOpacity onPress={() => setShowDropdown(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} data-testid="close-dropdown">
                  <Ionicons name="close-circle" size={28} color="#666" />
                </TouchableOpacity>
              </View>
              <View style={s.modalDiv} />
              <View style={s.searchBar}>
                <Ionicons name="search" size={18} color="#90A4AE" />
                <TextInput style={s.searchInput} value={searchQuery} onChangeText={setSearchQuery}
                  placeholder="Search brand or system..." placeholderTextColor="#B0BEC5" autoFocus data-testid="system-search-input" />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color="#B0BEC5" />
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                style={s.modalScroll}
                data={systems.filter((it) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return it.brand.toLowerCase().includes(q) || it.system.toLowerCase().includes(q) || (it.indication || '').toLowerCase().includes(q);
                })}
                keyExtractor={(item, i) => `${item.brand}-${item.system}-${i}`}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                ListFooterComponent={<View style={{ height: 30 }} />}
                renderItem={({ item, index: i }) => {
                  const isSel = cSystem?.brand === item.brand && cSystem?.system === item.system;
                  const isRestricted = item.restricted_teeth && cTooth && !item.restricted_teeth.includes(cTooth);
                  return (
                    <TouchableOpacity key={`${item.brand}-${item.system}-${i}`}
                      style={[s.ddItem, isSel && s.ddItemActive, isRestricted && s.ddItemRestricted]}
                      onPress={() => {
                        if (isRestricted) { Alert.alert('Not Indicated', `${item.brand} – ${item.system} is not indicated for tooth ${cTooth}.\n\n${item.indication}`); return; }
                        setCSystem(item); setShowDropdown(false); setCWidth(''); setCHeight(''); setCResult(null);
                      }}
                      activeOpacity={isRestricted ? 1 : 0.6} data-testid={`system-option-${i}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.ddItemTitle, isRestricted && { color: '#9E9E9E' }]}>{item.brand} – {item.system}</Text>
                        {item.indication ? <Text style={[s.ddItemInd, isRestricted && { color: '#B0BEC5' }]} numberOfLines={2}>{item.indication}</Text> : null}
                        <Text style={[s.ddItemSizes, isRestricted && { color: '#B0BEC5' }]}>
                          {item.count} sizes | D: {item.diameters[0]}–{item.diameters[item.diameters.length - 1]} mm | L: {item.lengths[0]}–{item.lengths[item.lengths.length - 1]} mm
                        </Text>
                        {isRestricted && (
                          <View style={s.restrictBadge}><Ionicons name="lock-closed" size={10} color="#E53935" /><Text style={s.restrictText}>Not for tooth {cTooth}</Text></View>
                        )}
                      </View>
                      {isSel && <Ionicons name="checkmark-circle" size={22} color="#1E88E5" />}
                    </TouchableOpacity>
                  );
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared: Bone Measurement Inputs ────────────────────────
function BoneInputs({ width, height, setWidth, setHeight, enabled, tooth }: {
  width: string; height: string; setWidth: (v: string) => void; setHeight: (v: string) => void; enabled: boolean; tooth: string | null;
}) {
  const [widthFocused, setWidthFocused] = React.useState(false);
  const [heightFocused, setHeightFocused] = React.useState(false);

  const widthInfo = React.useMemo(() => {
    if (!tooth) return '';
    const t = parseInt(tooth);
    if ([11,12,13,21,22,23].includes(t)) return 'Measure distance between labial and palatal bone plate';
    if ([14,15,16,17,24,25,26,27].includes(t)) return 'Measure distance between buccal and palatal bone plate';
    if ([31,32,33,41,42,43].includes(t)) return 'Measure distance between labial and lingual bone plate';
    if ([34,35,36,37,44,45,46,47].includes(t)) return 'Measure distance between buccal and lingual bone plate';
    return '';
  }, [tooth]);

  const heightInfo = React.useMemo(() => {
    if (!tooth) return '';
    const t = parseInt(tooth);
    if ([14,15,16,17,24,25,26,27].includes(t)) return 'Measure from crest of the ridge to the floor of maxillary sinus';
    if ([34,35,36,37,44,45,46,47].includes(t)) return 'Measure from crest of the ridge to inferior alveolar nerve';
    return '';
  }, [tooth]);

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={s.inputLabel}>Bone Width (mm)</Text>
        {widthInfo ? <Ionicons name="information-circle" size={18} color="#1565C0" /> : null}
      </View>
      {widthInfo && !widthFocused ? <Text style={{ fontSize: 11, color: '#1565C0', marginBottom: 4, marginLeft: 2, fontStyle: 'italic' }}>{widthInfo}</Text> : null}
      <View style={s.inputRow}>
        <Ionicons name="resize-outline" size={18} color="#1E88E5" />
        <TextInput style={s.measureInput} value={width} onChangeText={setWidth} placeholder="e.g. 7"
          placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" editable={enabled}
          onFocus={() => setWidthFocused(true)} onBlur={() => setWidthFocused(false)}
          data-testid="bone-width-input" />
        <Text style={s.unit}>mm</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={s.inputLabel}>Bone Height (mm)</Text>
        {heightInfo ? <Ionicons name="information-circle" size={18} color="#1565C0" /> : null}
      </View>
      {heightInfo && !heightFocused ? <Text style={{ fontSize: 11, color: '#1565C0', marginBottom: 4, marginLeft: 2, fontStyle: 'italic' }}>{heightInfo}</Text> : null}
      <View style={s.inputRow}>
        <Ionicons name="arrow-up-outline" size={18} color="#1E88E5" />
        <TextInput style={s.measureInput} value={height} onChangeText={setHeight} placeholder="e.g. 12"
          placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" editable={enabled}
          onFocus={() => setHeightFocused(true)} onBlur={() => setHeightFocused(false)}
          data-testid="bone-height-input" />
        <Text style={s.unit}>mm</Text>
      </View>
    </>
  );
}

// ── "Let Me Choose" Result ─────────────────────────────────
function ChooseResult({ result, system, tooth, toothInfo, boneWidth, boneHeight, onReset, onOpenProtocol }: {
  result: any; system: ImplantSystem; tooth: string; toothInfo: ToothRec | null;
  boneWidth: string; boneHeight: string; onReset: () => void;
  onOpenProtocol: (implant: { brand: string; system: string; diameter: number; length: number }, tooth: string) => void;
}) {
  const [riskBoneType, setRiskBoneType] = useState('');
  const [riskProcedure, setRiskProcedure] = useState('');
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiExplaining, setAiExplaining] = useState(false);

  const BONE_TYPES_R = ['D1', 'D2', 'D3', 'D4'];
  const PROCEDURES_R = [
    'Conventional Implant Placement',
    'Immediate Implant Placement',
    'Immediate Implant Placement with Bone Graft',
    'Sinus Lift',
    'Restricted Bone Height',
  ];

  const recommended: Implant[] = result.recommended || [];
  const allOptions: Implant[] = result.all_options || [];
  const narrowOptions: Implant[] = result.narrow_options || [];
  const hasNarrowRidge = result.narrow_ridge_evaluation && result.narrow_ridge_evaluation.classification !== 'adequate';
  const isBlocked = result.narrow_ridge_evaluation?.blocked;

  // Use narrow options when narrow ridge is detected and narrow_options available
  const baseImplants = (hasNarrowRidge && narrowOptions.length > 0) ? narrowOptions : (recommended.length > 0 ? recommended : allOptions);
  const isUsingAllOptions = !hasNarrowRidge && recommended.length === 0 && allOptions.length > 0;
  // Annotate every option with a per-implant safety verdict (Q2=b: greyed-out + chip).
  const safetyAnnotated = annotateImplantSafety(baseImplants, {
    toothPosition: tooth,
    boneWidthMm: parseFloat(boneWidth) || null,
    boneHeightMm: parseFloat(boneHeight) || null,
  });

  // Safety-aware tap — soft warning for width, hard block for length.
  // Width override is logged to the access_logs collection per HIPAA spec Q3=a.
  const handleImplantTap = (idx: number, imp: any) => {
    if (selectedIdx === idx) { setSelectedIdx(null); return; } // unselect — always allowed
    const verdict = safetyAnnotated[idx]?._safety as SafetyVerdict | undefined;
    if (!verdict || verdict.kind === 'ok') { setSelectedIdx(idx); return; }
    if (verdict.kind === 'length_block') {
      Alert.alert('Selection blocked', verdict.message);
      return;
    }
    // width_warning — soft, two options.
    Alert.alert('Bone margin warning', verdict.message, [
      { text: 'Change the selection', style: 'cancel' },
      {
        text: 'Continue with selection',
        onPress: async () => {
          setSelectedIdx(idx);
          try {
            await api.post('/audit/safety-override', {
              context: 'implant_selection_home',
              tooth_position: tooth,
              bone_width: parseFloat(boneWidth) || null,
              bone_height: parseFloat(boneHeight) || null,
              implant_diameter: imp.diameter,
              implant_length: imp.length,
              margin_mm: (verdict as any).marginMm,
              system: `${imp.brand} - ${imp.system}`,
            });
          } catch {/* non-fatal */}
        },
      },
    ]);
  };
  const isUsingNarrowOptions = hasNarrowRidge && narrowOptions.length > 0;
  const visibleImplants = showAll ? baseImplants : baseImplants.slice(0, 5);
  const hasMore = baseImplants.length > 5;
  const selectedImplant = selectedIdx !== null ? baseImplants[selectedIdx] : null;
  const riskImplant = selectedImplant || baseImplants[0];

  const handleCalcRisk = async () => {
    if (!riskImplant || !riskBoneType || !riskProcedure) return;
    setRiskLoading(true);
    try {
      const res = await api.post('/implant-library/calculate-risk', {
        bone_width: parseFloat(boneWidth),
        bone_height: parseFloat(boneHeight),
        implant_diameter: riskImplant.diameter,
        implant_length: riskImplant.length,
        bone_type: riskBoneType,
        procedure: riskProcedure,
        tooth,
      });
      setRiskResult(res.data);
    } catch { Alert.alert('Error', 'Failed to calculate risk.'); }
    finally { setRiskLoading(false); }
  };

  const riskColor = riskResult?.color === 'green' ? '#4CAF50' : riskResult?.color === 'orange' ? '#FF9800' : '#F44336';

  const copyRec = async () => {
    const imp = selectedImplant || baseImplants[0];
    if (!imp) return;
    const lines = ['Implant Recommendation', `Tooth: ${tooth}${toothInfo ? ` (${toothInfo.region})` : ''}`,
      `System: ${imp.brand} – ${imp.system}`, `Diameter: ${imp.diameter} mm`, `Length: ${imp.length} mm`,
      `Bone Width: ${boneWidth} mm`, `Bone Height: ${boneHeight} mm`];
    if (riskResult) {
      lines.push('', `Risk Level: ${riskResult.risk_level} (Score: ${riskResult.total_score}/15)`);
      riskResult.factors.forEach((f: any) => lines.push(`  ${f.factor}: ${f.risk} (${f.score})`));
      if (riskResult.suggested_actions?.length) { lines.push('', 'Suggested Actions:'); riskResult.suggested_actions.forEach((a: string) => lines.push(`  - ${a}`)); }
    }
    await Clipboard.setStringAsync(lines.join('\n'));
    Alert.alert('Copied', 'Recommendation copied to clipboard.');
  };

  return (
    <View>
      {/* Implant Recommendation Card */}
      <View style={s.card} data-testid="choose-result">
        <Text style={s.cardTitle}>Implant Recommendation</Text>
        <View style={s.summaryBox}>
          <SummaryRow label="Tooth" value={`${tooth}${toothInfo ? ` (${toothInfo.region})` : ''}`} />
          <SummaryRow label="System" value={`${system.brand} – ${system.system}`} />
          <SummaryRow label="Bone Width" value={`${boneWidth} mm`} />
          <SummaryRow label="Bone Height" value={`${boneHeight} mm`} />
        </View>
        {system.indication ? (
          <View style={s.indResultBox}><Ionicons name="information-circle" size={16} color="#0D47A1" /><Text style={s.indResultText}>{system.indication}</Text></View>
        ) : null}

        {/* Narrow Ridge Treatment Protocol Display */}
        <NarrowRidgeProtocol evaluation={result.narrow_ridge_evaluation} />

        {/* High Constraint Mode */}
        <HighConstraintDisplay hc={result.high_constraint_evaluation} />

        {/* No narrow options warning */}
        {result.narrow_ridge_warning && (
          <View style={nrS.noNarrowWarning} data-testid="no-narrow-options-warning">
            <Ionicons name="warning" size={18} color="#E65100" />
            <Text style={nrS.noNarrowWarningText}>{result.narrow_ridge_warning}</Text>
          </View>
        )}

        {/* Blocked: Severe narrow ridge */}
        {isBlocked ? (
          <View style={nrS.blockedCard} data-testid="narrow-ridge-blocked">
            <Ionicons name="ban" size={40} color="#B71C1C" />
            <Text style={nrS.blockedTitle}>Implant Placement Blocked</Text>
            <Text style={nrS.blockedText}>
              Ridge width ({result.narrow_ridge_evaluation?.ridge_width_mm}mm) is insufficient for any implant.{'\n'}Bone augmentation (GBR or block graft) is required before implant placement.
            </Text>
          </View>
        ) : (
        <>
        {isUsingNarrowOptions && (
          <View style={s.indResultBox}>
            <Ionicons name="information-circle" size={16} color="#1565C0" />
            <Text style={s.indResultText}>Showing narrow diameter ({'\u2264'}3.5mm) implants from {system.brand} {system.system} for narrow ridge compatibility.</Text>
          </View>
        )}

        {baseImplants.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            {isUsingAllOptions && (
              <View style={s.allOptionsNote}>
                <Ionicons name="information-circle" size={16} color="#E65100" />
                <Text style={s.allOptionsNoteText}>No exact matches for given measurements. Showing all available sizes in this system.</Text>
              </View>
            )}
            <Text style={s.recTitle}>
              {isUsingNarrowOptions
                ? (showAll ? `All Narrow Options (${baseImplants.length})` : `Narrow Diameter Options (${Math.min(5, baseImplants.length)})`)
                : isUsingAllOptions
                ? (showAll ? `All Available Sizes (${baseImplants.length})` : `Available Sizes (${Math.min(5, baseImplants.length)})`)
                : (showAll ? `All Implants (${baseImplants.length})` : `Top ${Math.min(5, baseImplants.length)} Implants`)}
            </Text>
            <Text style={s.selectHint}>Tap an implant to select it for drilling protocol</Text>
            {visibleImplants.map((imp: Implant, i: number) => {
              const isSelected = selectedIdx === i;
              const verdict = safetyAnnotated[i]?._safety;
              const blocked = verdict?.kind === 'length_block';
              const warning = verdict?.kind === 'width_warning';
              const chip = verdict ? shortSafetyChip(verdict) : null;
              return (
                <TouchableOpacity key={`r-${i}`}
                  style={[s.impCard, isSelected && s.impCardSelected, blocked && { opacity: 0.55 }]}
                  onPress={() => handleImplantTap(i, imp)}
                  activeOpacity={0.7}
                  data-testid={`recommended-implant-${i}`}>
                  <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={22} color={isSelected ? '#1565C0' : '#B0BEC5'} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.impSys}>{imp.brand} – {imp.system}</Text>
                    <View style={s.impSpecs}>
                      <View style={[s.specBadge, isSelected && { backgroundColor: '#BBDEFB' }]}><Text style={[s.specText, isSelected && { color: '#0D47A1' }]}>Diameter: {imp.diameter} mm</Text></View>
                      <View style={[s.specBadge, isSelected && { backgroundColor: '#BBDEFB' }]}><Text style={[s.specText, isSelected && { color: '#0D47A1' }]}>Length: {imp.length} mm</Text></View>
                    </View>
                    {chip && (
                      <View style={[s.safetyChip, blocked ? s.safetyChipBlocked : s.safetyChipWarn]} testID={`safety-chip-${i}`}>
                        <Ionicons name={blocked ? 'close-circle' : 'warning'} size={12} color={blocked ? '#B71C1C' : '#E65100'} />
                        <Text style={[s.safetyChipText, { color: blocked ? '#B71C1C' : '#E65100' }]}>{chip}</Text>
                      </View>
                    )}
                  </View>
                  {i === 0 && !blocked && !warning && <View style={s.bestBadge}><Text style={s.bestBadgeText}>Best</Text></View>}
                </TouchableOpacity>
              );
            })}
            {hasMore && !showAll && (
              <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAll(true)} data-testid="show-more-btn">
                <Text style={s.showMoreText}>Show More ({baseImplants.length - 5} more)</Text>
                <Ionicons name="chevron-down" size={16} color="#1E88E5" />
              </TouchableOpacity>
            )}
            {showAll && hasMore && (
              <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAll(false)} data-testid="show-less-btn">
                <Text style={s.showMoreText}>Show Less</Text>
                <Ionicons name="chevron-up" size={16} color="#1E88E5" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.noMatch}><Ionicons name="information-circle" size={22} color="#FF9800" /><Text style={s.noMatchText}>No exact matches found for the given measurements in this system.</Text></View>
        )}
        <GuidanceBox guidance={result.clinical_guidance} />

        {/* Give Drilling Protocol Button */}
        {selectedImplant && (
          <TouchableOpacity
            style={s.drillProtocolBtn}
            onPress={() => onOpenProtocol(selectedImplant, tooth)}
            data-testid="give-drilling-protocol-btn">
            <Ionicons name="construct" size={18} color="#FFF" />
            <Text style={s.drillProtocolBtnText}>Give Drilling Protocol</Text>
          </TouchableOpacity>
        )}
        </>
        )}
      </View>

      {/* ── Risk Calculator Card ── */}
      {riskImplant && (
        <View style={s.card} data-testid="risk-calculator-card">
          <View style={s.riskHeader}>
            <Ionicons name="shield-checkmark" size={22} color="#5C6BC0" />
            <Text style={s.riskHeaderTitle}>Implant Risk Calculator</Text>
          </View>

          <Text style={s.riskSubLabel}>
            Using: {riskImplant.brand} – {riskImplant.system} (D: {riskImplant.diameter} mm, L: {riskImplant.length} mm)
            {selectedImplant ? ' (Selected)' : ' (Best Match)'}
          </Text>

          {/* Bone Type */}
          <Text style={s.inputLabel}>Bone Type (Lekholm & Zarb)</Text>
          <View style={s.boneTypeRow}>
            {BONE_TYPES_R.map((bt) => (
              <TouchableOpacity key={bt} style={[s.boneTypeBtn, riskBoneType === bt && s.boneTypeBtnActive]}
                onPress={() => { setRiskBoneType(bt); setRiskResult(null); }} data-testid={`risk-bone-${bt}`}>
                <Text style={[s.boneTypeBtnText, riskBoneType === bt && s.boneTypeBtnTextActive]}>{bt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Procedure */}
          <Text style={[s.inputLabel, { marginTop: 14 }]}>Procedure Type</Text>
          {PROCEDURES_R.map((proc) => {
            const sel = riskProcedure === proc;
            return (
              <TouchableOpacity key={proc} style={[s.riskProcChip, sel && s.riskProcChipActive]}
                onPress={() => { setRiskProcedure(proc); setRiskResult(null); }}
                data-testid={`risk-proc-${proc.replace(/\s+/g, '-').toLowerCase()}`}>
                <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? '#5C6BC0' : '#B0BEC5'} />
                <Text style={[s.riskProcText, sel && s.riskProcTextActive]}>{proc}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Calculate Button */}
          <TouchableOpacity
            style={[s.riskCalcBtn, (!riskBoneType || !riskProcedure) && s.btnOff]}
            onPress={handleCalcRisk}
            disabled={!riskBoneType || !riskProcedure || riskLoading}
            data-testid="calculate-risk-btn">
            {riskLoading ? <ActivityIndicator color="#FFF" size="small" /> : (
              <><Ionicons name="calculator" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Calculate Risk</Text></>
            )}
          </TouchableOpacity>

          {/* ── Risk Result ── */}
          {riskResult && (
            <View style={{ marginTop: 16 }} data-testid="risk-result">
              {/* Risk Level Badge */}
              <View style={[s.riskLevelBox, { backgroundColor: riskColor + '18', borderColor: riskColor }]}>
                <Ionicons name={riskResult.risk_level === 'Low' ? 'shield-checkmark' : riskResult.risk_level === 'Moderate' ? 'alert-circle' : 'warning'}
                  size={28} color={riskColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.riskLevelText, { color: riskColor }]}>{riskResult.risk_level} Risk</Text>
                  <Text style={s.riskScoreText}>Score: {riskResult.total_score} / 15</Text>
                </View>
              </View>

              {/* Risk Meter */}
              <View style={s.riskMeter} data-testid="risk-meter">
                <View style={s.riskMeterTrack}>
                  <View style={[s.riskMeterFill, { width: `${Math.min((riskResult.total_score / 15) * 100, 100)}%`, backgroundColor: riskColor }]} />
                </View>
                <View style={s.riskMeterLabels}>
                  <Text style={[s.riskMeterLabel, { color: '#4CAF50' }]}>Low (5-7)</Text>
                  <Text style={[s.riskMeterLabel, { color: '#FF9800' }]}>Mod (8-11)</Text>
                  <Text style={[s.riskMeterLabel, { color: '#F44336' }]}>High (12-15)</Text>
                </View>
              </View>

              {/* Breakdown Table */}
              <View style={s.riskTable}>
                <View style={s.riskTableHeader}>
                  <Text style={[s.riskTableHCol, { flex: 2 }]}>Factor</Text>
                  <Text style={s.riskTableHCol}>Risk</Text>
                  <Text style={s.riskTableHCol}>Score</Text>
                </View>
                {riskResult.factors.map((f: any, i: number) => {
                  const fc = f.risk === 'Low' ? '#4CAF50' : f.risk === 'Moderate' ? '#FF9800' : '#F44336';
                  return (
                    <View key={i} style={s.riskTableRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={s.riskTableCell}>{f.factor}</Text>
                        {f.remaining !== undefined && <Text style={s.riskTableDetail}>Remaining: {f.remaining} mm</Text>}
                        {f.detail && <Text style={s.riskTableDetail}>{f.detail}</Text>}
                      </View>
                      <View style={[s.riskBadge, { backgroundColor: fc + '20' }]}>
                        <Text style={[s.riskBadgeText, { color: fc }]}>{f.risk}</Text>
                      </View>
                      <Text style={[s.riskTableScore, { color: fc }]}>{f.score}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Suggested Actions */}
              {riskResult.suggested_actions?.length > 0 && (
                <View style={s.riskActionsBox}>
                  <Text style={s.riskActionsTitle}>Suggested Actions</Text>
                  {riskResult.suggested_actions.map((a: string, i: number) => (
                    <View key={i} style={s.riskActionRow}>
                      <Ionicons name="chevron-forward" size={14} color="#5C6BC0" />
                      <Text style={s.riskActionText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* AI Explain Recommendation */}
      {riskImplant && (
        <View style={s.card} data-testid="ai-explain-card">
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0D47A1', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, opacity: aiExplaining ? 0.7 : 1 }}
            onPress={async () => {
              if (aiExplaining) return;
              const imp = selectedImplant || baseImplants[0];
              if (!imp) return;
              setAiExplaining(true);
              setAiExplanation('');
              try {
                const res = await api.post('/ai/explain-standalone', {
                  tooth,
                  tooth_region: toothInfo?.region || '',
                  brand: imp.brand,
                  system: imp.system,
                  diameter: imp.diameter,
                  length: imp.length,
                  bone_width: boneWidth,
                  bone_height: boneHeight,
                  bone_type: riskBoneType || '',
                  risk_level: riskResult?.risk_level || '',
                  risk_score: riskResult?.total_score || '',
                });
                setAiExplanation(res.data.explanation);
              } catch (e: any) {
                Alert.alert('Error', e.response?.data?.detail || 'Failed to generate explanation');
              } finally { setAiExplaining(false); }
            }}
            disabled={aiExplaining}
            data-testid="ai-explain-btn"
          >
            {aiExplaining ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="sparkles" size={18} color="#FFF" />}
            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Explain Recommendation</Text>
          </TouchableOpacity>
          {aiExplanation ? (
            <View style={{ marginTop: 10, backgroundColor: '#E8EAF6', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#3F51B5' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="sparkles" size={14} color="#3F51B5" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#3F51B5' }}>AI Clinical Insight</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#37474F', lineHeight: 18 }}>{aiExplanation}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Actions */}
      <View style={[s.card, { paddingVertical: 12 }]}>
        <View style={s.actions}>
          <TouchableOpacity style={s.copyBtn} onPress={copyRec} data-testid="copy-recommendation-btn">
            <Ionicons name="copy-outline" size={18} color="#FFF" /><Text style={s.copyBtnText}>Copy Recommendation</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.resetBtn} onPress={onReset} data-testid="reset-btn">
            <Ionicons name="refresh" size={18} color="#1E88E5" /><Text style={s.resetBtnText}>New Selection</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── "Suggest Me" Result ────────────────────────────────────
function SuggestResult({ result, tooth, toothInfo, onReset, onOpenProtocol }: {
  result: any; tooth: string | null; toothInfo: ToothRec | null; onReset: () => void;
  onOpenProtocol: (implant: { brand: string; system: string; diameter: number; length: number }, tooth: string) => void;
}) {
  const cg = result.clinical_guidance || {};
  const systems: SuggestSystem[] = result.recommended_systems || [];
  const warnings: string[] = result.validation_warnings || [];
  const [showAll, setShowAll] = useState(false);

  // Risk Calculator state
  const [riskProcedure, setRiskProcedure] = useState(cg.procedures?.length === 1 ? cg.procedures[0] : '');
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // AI Explain state
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiExplaining, setAiExplaining] = useState(false);

  // Implant selection state: track by "sysIdx-impIdx"
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const visibleSystems = showAll ? systems : systems.slice(0, 5);
  const hasMore = systems.length > 5;

  const getSelectedImplant = (): { brand: string; system: string; diameter: number; length: number } | null => {
    if (!selectedKey) return null;
    const [si, ii] = selectedKey.split('-').map(Number);
    const sys = systems[si];
    if (!sys) return null;
    const imp = sys.implants[ii];
    if (!imp) return null;
    return { brand: sys.brand, system: sys.system, diameter: imp.diameter, length: imp.length };
  };

  const selectedImplant = getSelectedImplant();
  const bestSystem = systems[0];
  const bestImplant = selectedImplant || (bestSystem?.implants?.[0] ? { brand: bestSystem.brand, system: bestSystem.system, ...bestSystem.implants[0] } : null);

  const handleCalcRisk = async () => {
    if (!bestImplant || !riskProcedure || !tooth) return;
    setRiskLoading(true);
    try {
      const res = await api.post('/implant-library/calculate-risk', {
        bone_width: cg.bone_width,
        bone_height: cg.bone_height,
        implant_diameter: bestImplant.diameter,
        implant_length: bestImplant.length,
        bone_type: cg.bone_type,
        procedure: riskProcedure,
        tooth,
      });
      setRiskResult(res.data);
    } catch { Alert.alert('Error', 'Failed to calculate risk.'); }
    finally { setRiskLoading(false); }
  };

  const riskColor = riskResult?.color === 'green' ? '#4CAF50' : riskResult?.color === 'orange' ? '#FF9800' : '#F44336';

  const copySuggest = async () => {
    const imp = selectedImplant || (bestSystem?.implants?.[0] ? { brand: bestSystem.brand, system: bestSystem.system, ...bestSystem.implants[0] } : null);
    if (!imp) return;
    const lines = ['Implant Suggestion',
      tooth ? `Tooth: ${tooth}${toothInfo ? ` (${toothInfo.region})` : ''}` : '',
      `System: ${imp.brand} – ${imp.system}`,
      `Diameter: ${imp.diameter} mm`, `Length: ${imp.length} mm`,
      `Bone Type: ${cg.bone_type}`, `Procedure: ${cg.procedures?.join(', ')}`,
      `Bone Width: ${cg.bone_width} mm`, `Bone Height: ${cg.bone_height} mm`,
    ].filter(Boolean);
    if (riskResult) {
      lines.push('', `Risk Level: ${riskResult.risk_level} (Score: ${riskResult.total_score}/15)`);
      riskResult.factors.forEach((f: any) => lines.push(`  ${f.factor}: ${f.risk} (${f.score})`));
      if (riskResult.suggested_actions?.length) { lines.push('', 'Suggested Actions:'); riskResult.suggested_actions.forEach((a: string) => lines.push(`  - ${a}`)); }
    }
    await Clipboard.setStringAsync(lines.join('\n'));
    Alert.alert('Copied', 'Suggestion copied to clipboard.');
  };

  return (
    <View>
      {/* Suggestion Card */}
      <View style={s.card} data-testid="suggest-result">
        <Text style={s.cardTitle}>Suggested Implants</Text>

        {warnings.length > 0 && (
          <View style={s.warningBox}>
            <Ionicons name="warning" size={18} color="#E65100" />
            <View style={{ flex: 1 }}>
              {warnings.map((w, i) => <Text key={i} style={s.warningText}>{w}</Text>)}
            </View>
          </View>
        )}

        <View style={s.summaryBox}>
          {tooth && <SummaryRow label="Tooth" value={`${tooth}${toothInfo ? ` (${toothInfo.region})` : ''}`} />}
          <SummaryRow label="Bone Type" value={cg.bone_type || ''} />
          <SummaryRow label="Procedure(s)" value={cg.procedures?.join(', ') || ''} />
          <SummaryRow label="Bone Width" value={`${cg.bone_width} mm`} />
          <SummaryRow label="Bone Height" value={`${cg.bone_height} mm`} />
        </View>

        <GuidanceBox guidance={cg} />

        {/* Narrow Ridge Treatment Protocol Display */}
        <NarrowRidgeProtocol evaluation={result.narrow_ridge_evaluation} />

        {/* High Constraint Mode */}
        <HighConstraintDisplay hc={result.high_constraint_evaluation} />

        {/* Blocked: Severe narrow ridge */}
        {(result.narrow_ridge_blocked || result.narrow_ridge_evaluation?.blocked) ? (
          <View style={nrS.blockedCard} data-testid="narrow-ridge-blocked">
            <Ionicons name="ban" size={40} color="#B71C1C" />
            <Text style={nrS.blockedTitle}>Implant Placement Blocked</Text>
            <Text style={nrS.blockedText}>
              Ridge width ({result.narrow_ridge_evaluation?.ridge_width_mm}mm) is insufficient for any implant.{'\n'}Bone augmentation (GBR or block graft) is required before implant placement.
            </Text>
          </View>
        ) : (
        <>
        {systems.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.recTitle}>
              {showAll ? `All Matching Systems (${systems.length})` : `Top ${Math.min(5, systems.length)} Systems`}
            </Text>
            <Text style={s.selectHint}>Tap an implant size to select it for drilling protocol</Text>
            {visibleSystems.map((sys, i) => (
              <View key={`sys-${i}`} style={s.sugSysCard} data-testid={`suggest-system-${i}`}>
                <View style={s.sugSysHeader}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={s.sugSysName}>{sys.brand} – {sys.system}</Text>
                  {i === 0 && <View style={s.bestBadge}><Text style={s.bestBadgeText}>Best</Text></View>}
                </View>
                {sys.indication ? <Text style={s.sugSysInd}>{sys.indication}</Text> : null}
                <View style={s.sugSysSizes}>
                  {sys.implants.map((imp, j) => {
                    const key = `${i}-${j}`;
                    const isSelected = selectedKey === key;
                    return (
                      <TouchableOpacity key={`imp-${j}`}
                        style={[s.sugSizeBadge, isSelected && s.sugSizeBadgeSelected]}
                        onPress={() => setSelectedKey(isSelected ? null : key)}
                        activeOpacity={0.7}
                        data-testid={`suggest-implant-${i}-${j}`}>
                        <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={14} color={isSelected ? '#0D47A1' : '#66BB6A'} />
                        <Text style={[s.sugSizeText, isSelected && { color: '#0D47A1' }]}>D: {imp.diameter} mm  L: {imp.length} mm</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            {hasMore && !showAll && (
              <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAll(true)} data-testid="suggest-show-more-btn">
                <Text style={s.showMoreText}>Show More ({systems.length - 5} more)</Text>
                <Ionicons name="chevron-down" size={16} color="#1E88E5" />
              </TouchableOpacity>
            )}
            {showAll && hasMore && (
              <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAll(false)} data-testid="suggest-show-less-btn">
                <Text style={s.showMoreText}>Show Less</Text>
                <Ionicons name="chevron-up" size={16} color="#1E88E5" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.noMatch}><Ionicons name="information-circle" size={22} color="#FF9800" /><Text style={s.noMatchText}>No implants found matching these clinical conditions.</Text></View>
        )}

        {/* Give Drilling Protocol Button */}
        {selectedImplant && tooth && (
          <TouchableOpacity
            style={s.drillProtocolBtn}
            onPress={() => onOpenProtocol(selectedImplant, tooth)}
            data-testid="suggest-give-drilling-protocol-btn">
            <Ionicons name="construct" size={18} color="#FFF" />
            <Text style={s.drillProtocolBtnText}>Give Drilling Protocol</Text>
          </TouchableOpacity>
        )}
        </>
        )}
      </View>

      {/* ── Risk Calculator Card ── */}
      {bestImplant && tooth && (
        <View style={s.card} data-testid="suggest-risk-calculator-card">
          <View style={s.riskHeader}>
            <Ionicons name="shield-checkmark" size={22} color="#5C6BC0" />
            <Text style={s.riskHeaderTitle}>Implant Risk Calculator</Text>
          </View>
          <Text style={s.riskSubLabel}>
            Using: {bestImplant.brand} – {bestImplant.system} (D: {bestImplant.diameter} mm, L: {bestImplant.length} mm) | Bone: {cg.bone_type}
            {selectedImplant ? ' (Selected)' : ' (Best Match)'}
          </Text>

          {/* Procedure selector (only if multiple procedures were selected) */}
          {cg.procedures?.length > 1 ? (
            <>
              <Text style={s.inputLabel}>Select procedure for risk assessment:</Text>
              {cg.procedures.map((proc: string) => {
                const sel = riskProcedure === proc;
                return (
                  <TouchableOpacity key={proc} style={[s.riskProcChip, sel && s.riskProcChipActive]}
                    onPress={() => { setRiskProcedure(proc); setRiskResult(null); }}
                    data-testid={`suggest-risk-proc-${proc.replace(/\s+/g, '-').toLowerCase()}`}>
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? '#5C6BC0' : '#B0BEC5'} />
                    <Text style={[s.riskProcText, sel && s.riskProcTextActive]}>{proc}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          <TouchableOpacity
            style={[s.riskCalcBtn, !riskProcedure && s.btnOff]}
            onPress={handleCalcRisk}
            disabled={!riskProcedure || riskLoading}
            data-testid="suggest-calculate-risk-btn">
            {riskLoading ? <ActivityIndicator color="#FFF" size="small" /> : (
              <><Ionicons name="calculator" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Calculate Risk</Text></>
            )}
          </TouchableOpacity>

          {riskResult && (
            <View style={{ marginTop: 16 }} data-testid="suggest-risk-result">
              <View style={[s.riskLevelBox, { backgroundColor: riskColor + '18', borderColor: riskColor }]}>
                <Ionicons name={riskResult.risk_level === 'Low' ? 'shield-checkmark' : riskResult.risk_level === 'Moderate' ? 'alert-circle' : 'warning'}
                  size={28} color={riskColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.riskLevelText, { color: riskColor }]}>{riskResult.risk_level} Risk</Text>
                  <Text style={s.riskScoreText}>Score: {riskResult.total_score} / 15</Text>
                </View>
              </View>

              <View style={s.riskMeter} data-testid="suggest-risk-meter">
                <View style={s.riskMeterTrack}>
                  <View style={[s.riskMeterFill, { width: `${Math.min((riskResult.total_score / 15) * 100, 100)}%`, backgroundColor: riskColor }]} />
                </View>
                <View style={s.riskMeterLabels}>
                  <Text style={[s.riskMeterLabel, { color: '#4CAF50' }]}>Low (5-7)</Text>
                  <Text style={[s.riskMeterLabel, { color: '#FF9800' }]}>Mod (8-11)</Text>
                  <Text style={[s.riskMeterLabel, { color: '#F44336' }]}>High (12-15)</Text>
                </View>
              </View>

              <View style={s.riskTable}>
                <View style={s.riskTableHeader}>
                  <Text style={[s.riskTableHCol, { flex: 2 }]}>Factor</Text>
                  <Text style={s.riskTableHCol}>Risk</Text>
                  <Text style={s.riskTableHCol}>Score</Text>
                </View>
                {riskResult.factors.map((f: any, i: number) => {
                  const fc = f.risk === 'Low' ? '#4CAF50' : f.risk === 'Moderate' ? '#FF9800' : '#F44336';
                  return (
                    <View key={i} style={s.riskTableRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={s.riskTableCell}>{f.factor}</Text>
                        {f.remaining !== undefined && <Text style={s.riskTableDetail}>Remaining: {f.remaining} mm</Text>}
                        {f.detail && <Text style={s.riskTableDetail}>{f.detail}</Text>}
                      </View>
                      <View style={[s.riskBadge, { backgroundColor: fc + '20' }]}>
                        <Text style={[s.riskBadgeText, { color: fc }]}>{f.risk}</Text>
                      </View>
                      <Text style={[s.riskTableScore, { color: fc }]}>{f.score}</Text>
                    </View>
                  );
                })}
              </View>

              {riskResult.suggested_actions?.length > 0 && (
                <View style={s.riskActionsBox}>
                  <Text style={s.riskActionsTitle}>Suggested Actions</Text>
                  {riskResult.suggested_actions.map((a: string, i: number) => (
                    <View key={i} style={s.riskActionRow}>
                      <Ionicons name="chevron-forward" size={14} color="#5C6BC0" />
                      <Text style={s.riskActionText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* AI Explain Recommendation */}
      {bestImplant && tooth && (
        <View style={s.card} data-testid="suggest-ai-explain-card">
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0D47A1', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, opacity: aiExplaining ? 0.7 : 1 }}
            onPress={async () => {
              if (aiExplaining) return;
              const imp = selectedImplant || bestImplant;
              if (!imp) return;
              setAiExplaining(true);
              setAiExplanation('');
              try {
                const res = await api.post('/ai/explain-standalone', {
                  tooth,
                  tooth_region: toothInfo?.region || '',
                  brand: imp.brand,
                  system: imp.system,
                  diameter: imp.diameter,
                  length: imp.length,
                  bone_width: cg.bone_width || '',
                  bone_height: cg.bone_height || '',
                  bone_type: cg.bone_type || '',
                  risk_level: riskResult?.risk_level || '',
                  risk_score: riskResult?.total_score || '',
                  procedures: cg.procedures || [],
                });
                setAiExplanation(res.data.explanation);
              } catch (e: any) {
                Alert.alert('Error', e.response?.data?.detail || 'Failed to generate explanation');
              } finally { setAiExplaining(false); }
            }}
            disabled={aiExplaining}
            data-testid="suggest-ai-explain-btn"
          >
            {aiExplaining ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="sparkles" size={18} color="#FFF" />}
            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Explain Recommendation</Text>
          </TouchableOpacity>
          {aiExplanation ? (
            <View style={{ marginTop: 10, backgroundColor: '#E8EAF6', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#3F51B5' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="sparkles" size={14} color="#3F51B5" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#3F51B5' }}>AI Clinical Insight</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#37474F', lineHeight: 18 }}>{aiExplanation}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Actions */}
      <View style={[s.card, { paddingVertical: 12 }]}>
        <View style={s.actions}>
          <TouchableOpacity style={s.copyBtn} onPress={copySuggest} data-testid="copy-suggest-btn">
            <Ionicons name="copy-outline" size={18} color="#FFF" /><Text style={s.copyBtnText}>Copy Suggestion</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.resetBtn} onPress={onReset} data-testid="reset-suggest-btn">
            <Ionicons name="refresh" size={18} color="#1E88E5" /><Text style={s.resetBtnText}>New Suggestion</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Shared micro-components ────────────────────────────────
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.sumRow}><Text style={s.sumLabel}>{label}:</Text><Text style={s.sumVal}>{value}</Text></View>
  );
}

function GuidanceBox({ guidance }: { guidance: any }) {
  if (!guidance) return null;
  return (
    <View style={s.guidanceBox}>
      <Text style={s.guidanceTitle}>Clinical Guidance</Text>
      <View style={s.guidRow}><Text style={s.guidLabel}>Diameter Range:</Text><Text style={s.guidVal}>{guidance.recommended_diameter_range}</Text></View>
      <View style={s.guidRow}><Text style={s.guidLabel}>Length Range:</Text><Text style={s.guidVal}>{guidance.recommended_length_range}</Text></View>
      <View style={s.guidRow}><Text style={s.guidLabel}>Category:</Text><Text style={s.guidVal}>{guidance.length_category}</Text></View>
      {guidance.safety_note && (
        <View style={s.safetyBox}><Ionicons name="alert-circle" size={14} color="#E65100" /><Text style={s.safetyText}>{guidance.safety_note}</Text></View>
      )}
    </View>
  );
}

// ── High Constraint Mode Display ────────────────────────────
function HighConstraintDisplay({ hc }: { hc: any }) {
  if (!hc?.active) return null;
  const isHigh = hc.risk_level === 'HIGH';
  const riskColor = isHigh ? '#B71C1C' : '#E65100';
  return (
    <View style={[hcS.card, { borderColor: isHigh ? '#EF9A9A' : '#FFB74D' }]} data-testid="high-constraint-display">
      <View style={[hcS.badge, { backgroundColor: riskColor }]}>
        <Ionicons name="warning" size={14} color="#FFF" />
        <Text style={hcS.badgeText}>High Constraint Mode — {hc.risk_level} Risk</Text>
      </View>
      <View style={hcS.region}>
        <Ionicons name="locate" size={16} color="#37474F" />
        <Text style={hcS.regionText}>
          {hc.region?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
          {hc.anatomical_constraint ? ` (${hc.anatomical_constraint.replace(/_/g, ' ')})` : ''}
        </Text>
      </View>
      <View style={hcS.options}>
        <View style={hcS.option}><Text style={hcS.optionLabel}>Primary:</Text><Text style={hcS.optionValue}>{hc.primary_option}</Text></View>
        <View style={hcS.option}><Text style={hcS.optionLabel}>Alternative:</Text><Text style={hcS.optionValue}>{hc.secondary_option}</Text></View>
      </View>
      {hc.recommendations?.map((r: string, i: number) => (
        <View key={i} style={hcS.recItem}><View style={hcS.recDot} /><Text style={hcS.recText}>{r}</Text></View>
      ))}
      {hc.warnings?.map((w: string, i: number) => (
        <View key={i} style={[hcS.warnRow, { borderLeftColor: riskColor }]}>
          <Ionicons name="alert-circle" size={14} color={riskColor} />
          <Text style={hcS.warnText}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

const hcS = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 2, backgroundColor: '#FFF' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, alignSelf: 'flex-start', marginBottom: 10 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  region: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 8 },
  regionText: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  options: { marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  optionLabel: { fontSize: 12, fontWeight: '700', color: '#455A64', width: 80 },
  optionValue: { fontSize: 13, color: '#37474F', flex: 1 },
  recItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, paddingLeft: 4 },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1565C0' },
  recText: { fontSize: 13, color: '#455A64' },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF8E1', borderRadius: 6, padding: 8, marginTop: 4, borderLeftWidth: 3 },
  warnText: { flex: 1, fontSize: 11, color: '#37474F', lineHeight: 16 },
});

// ── Narrow Ridge Treatment Protocol Display ────────────────
function NarrowRidgeProtocol({ evaluation }: { evaluation: any }) {
  if (!evaluation || evaluation.classification === 'adequate') return null;
  const sevColor = evaluation.severity === 'critical' ? '#B71C1C' : evaluation.severity === 'warning' ? '#E65100' : '#1565C0';
  const sevBg = evaluation.severity === 'critical' ? '#FFEBEE' : evaluation.severity === 'warning' ? '#FFF3E0' : '#E3F2FD';
  const sevBorder = evaluation.severity === 'critical' ? '#EF9A9A' : evaluation.severity === 'warning' ? '#FFB74D' : '#64B5F6';
  const sevIcon = (evaluation.severity === 'critical' ? 'close-circle' : evaluation.severity === 'warning' ? 'alert-circle' : 'information-circle') as any;
  return (
    <View style={[nrS.card, { borderColor: sevBorder }]} data-testid="treatment-protocol-display">
      <View style={nrS.header}>
        <View style={[nrS.badge, { backgroundColor: sevColor }]}>
          <Ionicons name="medical" size={14} color="#FFF" />
          <Text style={nrS.badgeText}>Narrow Ridge Assessment</Text>
        </View>
      </View>
      <View style={[nrS.classRow, { backgroundColor: sevBg }]}>
        <Ionicons name={sevIcon} size={20} color={sevColor} />
        <View style={{ flex: 1 }}>
          <Text style={[nrS.classLabel, { color: sevColor }]}>{evaluation.classification_label}</Text>
          <Text style={nrS.classSub}>Ridge Width: {evaluation.ridge_width_mm}mm</Text>
        </View>
      </View>
      {evaluation.recommendation?.implant_type && (
        <View style={nrS.row}>
          <Ionicons name="fitness" size={16} color="#37474F" />
          <Text style={nrS.rowLabel}>Implant Type: </Text>
          <Text style={nrS.rowValue}>{String(evaluation.recommendation.implant_type).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</Text>
        </View>
      )}
      {evaluation.recommendation?.protocols?.length > 0 && (
        <View style={nrS.section}>
          <Text style={nrS.sectionTitle}>Treatment Protocols</Text>
          {evaluation.recommendation.protocols.map((p: string, i: number) => (
            <View key={i} style={nrS.protocolItem}>
              <View style={nrS.protocolDot} />
              <Text style={nrS.protocolItemText}>{p.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</Text>
            </View>
          ))}
        </View>
      )}
      {evaluation.recommendation?.drilling_protocol_label && (
        <View style={nrS.row}>
          <Ionicons name="construct" size={16} color="#37474F" />
          <Text style={nrS.rowLabel}>Drilling: </Text>
          <Text style={nrS.rowValue}>{evaluation.recommendation.drilling_protocol_label}</Text>
        </View>
      )}
      {evaluation.recommendation?.label && (
        <View style={nrS.recommendBox}>
          <Ionicons name="bulb" size={16} color="#1565C0" />
          <Text style={nrS.recommendText}>{evaluation.recommendation.label}</Text>
        </View>
      )}
      {evaluation.warnings?.length > 0 && (
        <View style={nrS.warnings}>
          {evaluation.warnings.map((w: any, i: number) => (
            <View key={i} style={[nrS.warningRow, { borderLeftColor: w.severity === 'critical' ? '#B71C1C' : w.severity === 'high' ? '#E65100' : '#FF9800' }]}>
              <Ionicons name={w.severity === 'critical' ? 'close-circle' as any : 'alert-circle' as any} size={14}
                color={w.severity === 'critical' ? '#B71C1C' : w.severity === 'high' ? '#E65100' : '#FF9800'} />
              <Text style={nrS.warningText}>{w.message}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function RidgeClassIndicator({ width }: { width: string }) {
  const w = parseFloat(width);
  if (!w || w <= 0) return null;
  const cls = w >= 6
    ? { label: 'Adequate Ridge Width', icon: 'checkmark-circle' as any, color: '#2E7D32', bgColor: '#E8F5E9', borderColor: '#66BB6A' }
    : w >= 4.5
    ? { label: 'Mildly Narrow Ridge', icon: 'information-circle' as any, color: '#1565C0', bgColor: '#E3F2FD', borderColor: '#64B5F6' }
    : w >= 3
    ? { label: 'Moderately Narrow Ridge', icon: 'alert-circle' as any, color: '#E65100', bgColor: '#FFF3E0', borderColor: '#FFB74D' }
    : { label: 'Severely Narrow Ridge — Augmentation Required', icon: 'close-circle' as any, color: '#B71C1C', bgColor: '#FFEBEE', borderColor: '#EF9A9A' };
  return (
    <View style={[nrS.ridgeBanner, { backgroundColor: cls.bgColor, borderColor: cls.borderColor }]} data-testid="ridge-classification-indicator">
      <Ionicons name={cls.icon} size={18} color={cls.color} />
      <View style={{ flex: 1 }}>
        <Text style={[nrS.ridgeLabel, { color: cls.color }]}>{cls.label}</Text>
        <Text style={nrS.ridgeSubtext}>Ridge Width = Bone Width ({width}mm)</Text>
      </View>
    </View>
  );
}

const nrS = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1.5, backgroundColor: '#FFF' },
  header: { marginBottom: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, padding: 10, marginBottom: 10 },
  classLabel: { fontSize: 14, fontWeight: '700' },
  classSub: { fontSize: 12, color: '#666', marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#37474F' },
  rowValue: { fontSize: 13, color: '#455A64', flex: 1 },
  section: { marginTop: 6, paddingLeft: 4, marginBottom: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 6 },
  protocolItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  protocolDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1565C0' },
  protocolItemText: { fontSize: 13, color: '#455A64' },
  recommendBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10, marginTop: 8 },
  recommendText: { flex: 1, fontSize: 12, color: '#1565C0', fontWeight: '600', lineHeight: 17 },
  warnings: { marginTop: 8 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF8E1', borderRadius: 6, padding: 8, marginBottom: 4, borderLeftWidth: 3 },
  warningText: { flex: 1, fontSize: 11, color: '#37474F', lineHeight: 16 },
  blockedCard: { alignItems: 'center', justifyContent: 'center' as const, backgroundColor: '#FFEBEE', borderRadius: 16, padding: 30, marginVertical: 20, borderWidth: 1.5, borderColor: '#EF9A9A', gap: 12 },
  blockedTitle: { fontSize: 18, fontWeight: '700', color: '#B71C1C' },
  blockedText: { fontSize: 14, color: '#5D4037', textAlign: 'center' as const, lineHeight: 20 },
  ridgeBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1 },
  ridgeLabel: { fontSize: 13, fontWeight: '700' },
  ridgeSubtext: { fontSize: 11, color: '#666', marginTop: 2 },
  noNarrowWarning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFB74D' },
  noNarrowWarningText: { flex: 1, fontSize: 12, color: '#E65100', fontWeight: '600', lineHeight: 17 },
});

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5FAFF' },
  scroll: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  centerText: { fontSize: 15, color: '#546E7A' },
  errText: { fontSize: 14, color: '#D32F2F', textAlign: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#263238' },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#ECEFF1', borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#1E88E5' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#546E7A' },
  tabTextActive: { color: '#FFF' },

  // Cards
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardOff: { opacity: 0.45 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#263238', marginBottom: 12 },
  subLabel: { fontSize: 12, color: '#78909C', marginBottom: 8 },

  // FDI
  jawRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  quadrant: { alignItems: 'center' },
  teethRow: { flexDirection: 'row', alignItems: 'center' },
  midline: { width: 2, height: 40, backgroundColor: '#CFD8DC', marginHorizontal: 2, borderRadius: 1 },
  jawDivider: { height: 1, backgroundColor: '#ECEFF1', marginVertical: 8 },
  jawLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', marginBottom: 6, textAlign: 'center' },

  // Tooth rec
  toothRecBox: { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginTop: 10 },
  toothRecHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  toothRecTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  toothRecRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  toothRecLabel: { fontSize: 12, color: '#37474F' },
  toothRecVal: { fontSize: 12, fontWeight: '600', color: '#1565C0' },

  // Dropdown
  dropdown: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D7DE', borderRadius: 12, padding: 14, backgroundColor: '#FAFAFA', gap: 10 },
  ddText: { flex: 1, fontSize: 14, color: '#263238', fontWeight: '500' },
  ddPlaceholder: { flex: 1, fontSize: 14, color: '#90A4AE' },
  indBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, backgroundColor: '#E8EAF6', borderRadius: 8, padding: 10 },
  indText: { flex: 1, fontSize: 12, color: '#1A237E', fontStyle: 'italic', lineHeight: 16 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: 30, flex: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#263238' },
  modalDiv: { height: 1, backgroundColor: '#F0F0F0' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F5F5F5', borderRadius: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#263238' },
  modalScroll: { paddingHorizontal: 8, flexGrow: 1 },
  ddItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginHorizontal: 8, borderRadius: 8 },
  ddItemActive: { backgroundColor: '#E3F2FD' },
  ddItemRestricted: { backgroundColor: '#FAFAFA', opacity: 0.6 },
  ddItemTitle: { fontSize: 14, fontWeight: '600', color: '#263238' },
  ddItemInd: { fontSize: 11, color: '#1565C0', marginTop: 2, fontStyle: 'italic' },
  ddItemSizes: { fontSize: 11, color: '#78909C', marginTop: 2 },
  restrictBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: '#FFEBEE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  restrictText: { fontSize: 10, color: '#E53935', fontWeight: '600' },

  // Procedure chips (Suggest Me)
  procChip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, marginBottom: 8, backgroundColor: '#FAFAFA' },
  procChipActive: { borderColor: '#1E88E5', backgroundColor: '#E3F2FD' },
  procChipText: { fontSize: 14, color: '#546E7A', flex: 1 },
  procChipTextActive: { color: '#1565C0', fontWeight: '600' },

  // Bone type selector
  boneTypeRow: { flexDirection: 'row', gap: 10 },
  boneTypeBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#D0D7DE', alignItems: 'center', backgroundColor: '#FAFAFA' },
  boneTypeBtnActive: { borderColor: '#1E88E5', backgroundColor: '#E3F2FD' },
  boneTypeBtnText: { fontSize: 16, fontWeight: '700', color: '#90A4AE' },
  boneTypeBtnTextActive: { color: '#1E88E5' },

  // Inputs
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 6, marginTop: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D7DE', borderRadius: 12, padding: 12, backgroundColor: '#FAFAFA', gap: 8 },
  measureInput: { flex: 1, fontSize: 16, color: '#263238', fontWeight: '500' },
  unit: { fontSize: 14, color: '#90A4AE', fontWeight: '500' },

  // Buttons
  primaryBtn: { flexDirection: 'row', backgroundColor: '#1E88E5', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  suggestBtn: { flexDirection: 'row', backgroundColor: '#7B1FA2', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  btnOff: { opacity: 0.4 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Summary
  summaryBox: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, marginBottom: 14 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sumLabel: { fontSize: 13, color: '#546E7A' },
  sumVal: { fontSize: 13, fontWeight: '600', color: '#263238', flexShrink: 1, textAlign: 'right' },

  // Indication in result
  indResultBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#E8EAF6', borderRadius: 8, padding: 10, marginBottom: 14 },
  indResultText: { flex: 1, fontSize: 12, color: '#1A237E', fontStyle: 'italic', lineHeight: 16 },

  // Recommended
  recTitle: { fontSize: 15, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
  impCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F8E9', borderRadius: 10, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1.5, borderColor: 'transparent' },
  impCardSelected: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  impSys: { fontSize: 14, fontWeight: '600', color: '#263238', marginBottom: 6 },
  impSpecs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  specBadge: { backgroundColor: '#C8E6C9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  specText: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },
  noMatch: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF8E1', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 14 },
  noMatchText: { flex: 1, fontSize: 13, color: '#F57F17' },

  // Guidance
  guidanceBox: { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 14, marginBottom: 12 },
  guidanceTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 8 },
  guidRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  guidLabel: { fontSize: 13, color: '#37474F' },
  guidVal: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  safetyBox: { flexDirection: 'row', gap: 6, backgroundColor: '#FFF3E0', borderRadius: 8, padding: 8, marginTop: 8, alignItems: 'flex-start' },
  safetyText: { flex: 1, fontSize: 11, color: '#E65100', lineHeight: 16 },

  // Warnings
  warningBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 14, alignItems: 'flex-start' },
  warningText: { fontSize: 13, color: '#E65100', lineHeight: 18 },

  // All Options
  allOptTitle: { fontSize: 14, fontWeight: '700', color: '#263238', marginBottom: 8 },
  impRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  impRowMatch: { backgroundColor: '#F1F8E9' },
  impRowText: { fontSize: 14, color: '#37474F' },

  // Suggest Me result system cards
  sugSysCard: { backgroundColor: '#F1F8E9', borderRadius: 12, padding: 14, marginBottom: 10 },
  sugSysHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sugSysName: { fontSize: 14, fontWeight: '700', color: '#263238', flex: 1 },
  sugSysInd: { fontSize: 11, color: '#1565C0', fontStyle: 'italic', marginBottom: 6, marginLeft: 28 },
  sugSysSizes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 28 },
  sugSizeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#C8E6C9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1.5, borderColor: 'transparent' },
  sugSizeBadgeSelected: { borderColor: '#0D47A1', backgroundColor: '#BBDEFB' },
  sugSizeText: { fontSize: 11, fontWeight: '600', color: '#2E7D32' },

  // Actions
  actions: { marginTop: 16, gap: 10 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: '#43A047', borderRadius: 12 },
  copyBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderWidth: 1, borderColor: '#1E88E5', borderRadius: 10 },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },

  // Risk Calculator
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  riskHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#283593' },
  riskSubLabel: { fontSize: 12, color: '#78909C', marginBottom: 12, fontStyle: 'italic' },
  riskProcChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, marginBottom: 6, backgroundColor: '#FAFAFA' },
  riskProcChipActive: { borderColor: '#5C6BC0', backgroundColor: '#E8EAF6' },
  riskProcText: { fontSize: 13, color: '#546E7A', flex: 1 },
  riskProcTextActive: { color: '#283593', fontWeight: '600' },
  riskCalcBtn: { flexDirection: 'row', backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  riskLevelBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 14 },
  riskLevelText: { fontSize: 18, fontWeight: '800' },
  riskScoreText: { fontSize: 13, color: '#546E7A', marginTop: 2 },
  riskMeter: { marginBottom: 16 },
  riskMeterTrack: { height: 10, backgroundColor: '#ECEFF1', borderRadius: 5, overflow: 'hidden' },
  riskMeterFill: { height: '100%', borderRadius: 5 },
  riskMeterLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  riskMeterLabel: { fontSize: 10, fontWeight: '600' },
  riskTable: { backgroundColor: '#FAFAFA', borderRadius: 10, overflow: 'hidden', marginBottom: 14 },
  riskTableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECEFF1', paddingVertical: 8, paddingHorizontal: 12 },
  riskTableHCol: { flex: 1, fontSize: 12, fontWeight: '700', color: '#37474F' },
  riskTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  riskTableCell: { fontSize: 13, fontWeight: '600', color: '#263238' },
  riskTableDetail: { fontSize: 10, color: '#90A4AE', marginTop: 1 },
  riskBadge: { flex: 1, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6, alignItems: 'center' },
  riskBadgeText: { fontSize: 11, fontWeight: '700' },
  riskTableScore: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  riskActionsBox: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 12 },
  riskActionsTitle: { fontSize: 13, fontWeight: '700', color: '#E65100', marginBottom: 8 },
  riskActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  riskActionText: { fontSize: 12, color: '#BF360C', flex: 1 },

  // Selection & Drilling Protocol
  selectHint: { fontSize: 11, color: '#78909C', marginBottom: 8, fontStyle: 'italic' },
  bestBadge: { backgroundColor: '#FFF8E1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FFD54F' },
  bestBadgeText: { fontSize: 10, fontWeight: '700', color: '#F57F17' },
  safetyChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6, borderWidth: 1 },
  safetyChipBlocked: { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' },
  safetyChipWarn: { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' },
  safetyChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderColor: '#1E88E5', borderRadius: 10, borderStyle: 'dashed', marginTop: 4 },
  showMoreText: { fontSize: 13, fontWeight: '600', color: '#1E88E5' },
  drillProtocolBtn: { flexDirection: 'row', backgroundColor: '#00695C', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  drillProtocolBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  allOptionsNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF3E0', borderRadius: 8, padding: 10, marginBottom: 10 },
  allOptionsNoteText: { flex: 1, fontSize: 12, color: '#E65100', lineHeight: 16 },
});
