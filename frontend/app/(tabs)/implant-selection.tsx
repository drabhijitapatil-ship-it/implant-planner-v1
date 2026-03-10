import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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

  const PROCEDURES = [
    'Conventional Implant Placement',
    'Conventional Implant Placement with Bone Graft',
    'Immediate Implant Placement',
    'Immediate Implant Placement with Bone Graft',
    'Sinus Lift',
    'Restricted Bone Height',
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
              {cSystem?.indication ? (
                <View style={s.indBox}><Ionicons name="information-circle" size={14} color="#0D47A1" /><Text style={s.indText}>{cSystem.indication}</Text></View>
              ) : null}
            </View>

            {/* Step 3: Bone Measurements */}
            <View style={[s.card, !cSystem && s.cardOff]}>
              <Text style={s.cardTitle}>Enter Bone Measurements</Text>
              <BoneInputs width={cWidth} height={cHeight} setWidth={(v) => { setCWidth(v); setCResult(null); }} setHeight={(v) => { setCHeight(v); setCResult(null); }} enabled={!!cSystem} />
              <TouchableOpacity style={[s.primaryBtn, (!cSystem || !cWidth || !cHeight) && s.btnOff]} onPress={handleChooseSuggest}
                disabled={!cSystem || !cWidth || !cHeight || cSearching} data-testid="find-best-btn">
                {cSearching ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <><Ionicons name="search" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Find Best Implant</Text></>
                )}
              </TouchableOpacity>
            </View>

            {/* Result */}
            {cResult && <ChooseResult result={cResult} system={cSystem!} tooth={cTooth!} toothInfo={cToothInfo} boneWidth={cWidth} boneHeight={cHeight} onReset={resetChoose} />}
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
              <BoneInputs width={sWidth} height={sHeight} setWidth={(v) => { setSWidth(v); setSResult(null); }} setHeight={(v) => { setSHeight(v); setSResult(null); }} enabled={!!sBoneType} />
              <TouchableOpacity style={[s.suggestBtn, (!sBoneType || !sWidth || !sHeight || !sProcedures.length) && s.btnOff]}
                onPress={handleSuggestMe} disabled={!sBoneType || !sWidth || !sHeight || !sProcedures.length || sSearching}
                data-testid="suggest-me-btn">
                {sSearching ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <><Ionicons name="bulb" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Suggest Me</Text></>
                )}
              </TouchableOpacity>
            </View>

            {/* Result */}
            {sResult && <SuggestResult result={sResult} tooth={sTooth} toothInfo={sToothInfo} onReset={resetSuggest} />}
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
              <ScrollView style={s.modalScroll} showsVerticalScrollIndicator bounces nestedScrollEnabled>
                {systems.filter((it) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return it.brand.toLowerCase().includes(q) || it.system.toLowerCase().includes(q) || (it.indication || '').toLowerCase().includes(q);
                }).map((item, i) => {
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
                })}
                <View style={{ height: 30 }} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared: Bone Measurement Inputs ────────────────────────
function BoneInputs({ width, height, setWidth, setHeight, enabled }: {
  width: string; height: string; setWidth: (v: string) => void; setHeight: (v: string) => void; enabled: boolean;
}) {
  return (
    <>
      <Text style={s.inputLabel}>Bone Width (mm)</Text>
      <View style={s.inputRow}>
        <Ionicons name="resize-outline" size={18} color="#1E88E5" />
        <TextInput style={s.measureInput} value={width} onChangeText={setWidth} placeholder="e.g. 7"
          placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" editable={enabled} data-testid="bone-width-input" />
        <Text style={s.unit}>mm</Text>
      </View>
      <Text style={s.inputLabel}>Bone Height (mm)</Text>
      <View style={s.inputRow}>
        <Ionicons name="arrow-up-outline" size={18} color="#1E88E5" />
        <TextInput style={s.measureInput} value={height} onChangeText={setHeight} placeholder="e.g. 12"
          placeholderTextColor="#B0BEC5" keyboardType="decimal-pad" editable={enabled} data-testid="bone-height-input" />
        <Text style={s.unit}>mm</Text>
      </View>
    </>
  );
}

// ── "Let Me Choose" Result ─────────────────────────────────
function ChooseResult({ result, system, tooth, toothInfo, boneWidth, boneHeight, onReset }: {
  result: any; system: ImplantSystem; tooth: string; toothInfo: ToothRec | null;
  boneWidth: string; boneHeight: string; onReset: () => void;
}) {
  const [riskBoneType, setRiskBoneType] = useState('');
  const [riskProcedure, setRiskProcedure] = useState('');
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const BONE_TYPES_R = ['D1', 'D2', 'D3', 'D4'];
  const PROCEDURES_R = [
    'Conventional Implant Placement',
    'Immediate Implant Placement',
    'Immediate Implant Placement with Bone Graft',
    'Sinus Lift',
    'Restricted Bone Height',
  ];

  const bestImplant = result.recommended?.[0];

  const handleCalcRisk = async () => {
    if (!bestImplant || !riskBoneType || !riskProcedure) return;
    setRiskLoading(true);
    try {
      const res = await api.post('/implant-library/calculate-risk', {
        bone_width: parseFloat(boneWidth),
        bone_height: parseFloat(boneHeight),
        implant_diameter: bestImplant.diameter,
        implant_length: bestImplant.length,
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
    if (!bestImplant) return;
    const lines = ['Implant Recommendation', `Tooth: ${tooth}${toothInfo ? ` (${toothInfo.region})` : ''}`,
      `System: ${bestImplant.brand} – ${bestImplant.system}`, `Diameter: ${bestImplant.diameter} mm`, `Length: ${bestImplant.length} mm`,
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
        {result.recommended?.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.recTitle}>Recommended Implant</Text>
            {result.recommended.map((imp: Implant, i: number) => (
              <View key={`r-${i}`} style={s.impCard} data-testid={`recommended-implant-${i}`}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <View style={{ flex: 1 }}>
                  <Text style={s.impSys}>{imp.brand} – {imp.system}</Text>
                  <View style={s.impSpecs}>
                    <View style={s.specBadge}><Text style={s.specText}>Diameter: {imp.diameter} mm</Text></View>
                    <View style={s.specBadge}><Text style={s.specText}>Length: {imp.length} mm</Text></View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.noMatch}><Ionicons name="information-circle" size={22} color="#FF9800" /><Text style={s.noMatchText}>No exact matches found for the given measurements in this system.</Text></View>
        )}
        <GuidanceBox guidance={result.clinical_guidance} />
      </View>

      {/* ── Risk Calculator Card ── */}
      {bestImplant && (
        <View style={s.card} data-testid="risk-calculator-card">
          <View style={s.riskHeader}>
            <Ionicons name="shield-checkmark" size={22} color="#5C6BC0" />
            <Text style={s.riskHeaderTitle}>Implant Risk Calculator</Text>
          </View>

          <Text style={s.riskSubLabel}>
            Using: {bestImplant.brand} – {bestImplant.system} (D: {bestImplant.diameter} mm, L: {bestImplant.length} mm)
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
function SuggestResult({ result, tooth, toothInfo, onReset }: {
  result: any; tooth: string | null; toothInfo: ToothRec | null; onReset: () => void;
}) {
  const cg = result.clinical_guidance || {};
  const systems: SuggestSystem[] = result.recommended_systems || [];
  const warnings: string[] = result.validation_warnings || [];

  // Risk Calculator state
  const [riskProcedure, setRiskProcedure] = useState(cg.procedures?.length === 1 ? cg.procedures[0] : '');
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const bestSystem = systems[0];
  const bestImplant = bestSystem?.implants?.[0];

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
    if (!bestSystem || !bestImplant) return;
    const lines = ['Implant Suggestion',
      tooth ? `Tooth: ${tooth}${toothInfo ? ` (${toothInfo.region})` : ''}` : '',
      `System: ${bestSystem.brand} – ${bestSystem.system}`,
      `Diameter: ${bestImplant.diameter} mm`, `Length: ${bestImplant.length} mm`,
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

        {systems.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.recTitle}>Matching Systems ({systems.length})</Text>
            {systems.map((sys, i) => (
              <View key={`sys-${i}`} style={s.sugSysCard} data-testid={`suggest-system-${i}`}>
                <View style={s.sugSysHeader}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={s.sugSysName}>{sys.brand} – {sys.system}</Text>
                </View>
                {sys.indication ? <Text style={s.sugSysInd}>{sys.indication}</Text> : null}
                <View style={s.sugSysSizes}>
                  {sys.implants.map((imp, j) => (
                    <View key={`imp-${j}`} style={s.sugSizeBadge}>
                      <Text style={s.sugSizeText}>D: {imp.diameter} mm  L: {imp.length} mm</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.noMatch}><Ionicons name="information-circle" size={22} color="#FF9800" /><Text style={s.noMatchText}>No implants found matching these clinical conditions.</Text></View>
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
            Using: {bestSystem.brand} – {bestSystem.system} (D: {bestImplant.diameter} mm, L: {bestImplant.length} mm) | Bone: {cg.bone_type}
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
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#263238' },
  modalDiv: { height: 1, backgroundColor: '#F0F0F0' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F5F5F5', borderRadius: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#263238' },
  modalScroll: { paddingHorizontal: 8 },
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
  impCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F8E9', borderRadius: 10, padding: 12, marginBottom: 8, gap: 10 },
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
  sugSizeBadge: { backgroundColor: '#C8E6C9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
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
});
