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

type ImplantSystem = { brand: string; system: string; diameter: number; length: number };
type Implant = { brand: string; system: string; diameter: number; length: number };
type ToothRec = { region: string; toothType: string; diameter: [number, number] };

// FDI Dental Chart Data
const UPPER_RIGHT = ['17', '16', '15', '14', '13', '12', '11'];
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27'];
const LOWER_RIGHT = ['47', '46', '45', '44', '43', '42', '41'];
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37'];

const TOOTH_TYPE: Record<string, string> = {};
['16', '17', '26', '27', '36', '37', '46', '47'].forEach((t) => (TOOTH_TYPE[t] = 'molar'));
['14', '15', '24', '25', '34', '35', '44', '45'].forEach((t) => (TOOTH_TYPE[t] = 'premolar'));
['13', '23', '33', '43'].forEach((t) => (TOOTH_TYPE[t] = 'canine'));
['11', '12', '21', '22', '31', '32', '41', '42'].forEach((t) => (TOOTH_TYPE[t] = 'incisor'));

function getToothWidth(tooth: string): number {
  const t = TOOTH_TYPE[tooth];
  if (t === 'molar') return 26;
  if (t === 'premolar') return 23;
  if (t === 'canine') return 22;
  return 20;
}

function getToothLabel(tooth: string): string {
  const t = TOOTH_TYPE[tooth];
  if (t === 'molar') return 'M';
  if (t === 'premolar') return 'P';
  if (t === 'canine') return 'C';
  return 'I';
}

// Tooth component for the FDI chart
function Tooth({
  tooth,
  isSelected,
  onPress,
  isUpper,
}: {
  tooth: string;
  isSelected: boolean;
  onPress: () => void;
  isUpper: boolean;
}) {
  const w = getToothWidth(tooth);
  const isMolar = TOOTH_TYPE[tooth] === 'molar';
  const isPremolar = TOOTH_TYPE[tooth] === 'premolar';
  const isCanine = TOOTH_TYPE[tooth] === 'canine';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      testID={`tooth-${tooth}`}
      style={[
        toothStyles.tooth,
        {
          width: w,
          height: isMolar ? 34 : isPremolar ? 32 : isCanine ? 30 : 28,
          borderRadius: isMolar ? 5 : isPremolar ? 7 : 9,
          borderTopLeftRadius: isUpper ? (isMolar ? 5 : 9) : (isMolar ? 3 : 5),
          borderTopRightRadius: isUpper ? (isMolar ? 5 : 9) : (isMolar ? 3 : 5),
          borderBottomLeftRadius: isUpper ? (isMolar ? 3 : 5) : (isMolar ? 5 : 9),
          borderBottomRightRadius: isUpper ? (isMolar ? 3 : 5) : (isMolar ? 5 : 9),
          backgroundColor: isSelected ? '#1E88E5' : '#E8EDF2',
          borderColor: isSelected ? '#1565C0' : '#C5CDD5',
        },
      ]}
    >
      <Text
        style={[
          toothStyles.toothNumber,
          { color: isSelected ? '#FFF' : '#37474F', fontSize: 10 },
        ]}
      >
        {tooth}
      </Text>
    </TouchableOpacity>
  );
}

const toothStyles = StyleSheet.create({
  tooth: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginHorizontal: 1,
  },
  toothNumber: { fontWeight: '700' },
});

// Main Screen
export default function ImplantSelectionScreen() {
  const [systems, setSystems] = useState<ImplantSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toothRecs, setToothRecs] = useState<Record<string, ToothRec>>({});

  // Step states
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<ImplantSystem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [boneWidth, setBoneWidth] = useState('');
  const [boneHeight, setBoneHeight] = useState('');
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/implant-library/systems'),
      api.get('/implant-library/tooth-recommendations'),
    ])
      .then(([sysRes, toothRes]) => {
        setSystems(sysRes.data || []);
        setToothRecs(toothRes.data || {});
      })
      .catch((err) => {
        setLoadError(err?.response?.data?.detail || err?.message || 'Failed to load data');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSuggest = async () => {
    if (!selectedTooth || !selectedSystem || !boneWidth || !boneHeight) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await api.get('/implant-library/suggest', {
        params: {
          brand: selectedSystem.brand,
          system: selectedSystem.system,
          bone_width: parseFloat(boneWidth),
          bone_height: parseFloat(boneHeight),
          tooth: selectedTooth,
        },
      });
      setResults(res.data);
    } catch (err) {
      Alert.alert('Error', 'Failed to get implant suggestions.');
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setSelectedTooth(null);
    setSelectedSystem(null);
    setBoneWidth('');
    setBoneHeight('');
    setResults(null);
  };

  const handleCopyRecommendation = async () => {
    if (!results || !results.recommended || results.recommended.length === 0) return;
    const rec = results.recommended[0];
    const toothInfo = toothRecs[selectedTooth!];
    const text = [
      `Implant Recommendation`,
      `Tooth: ${selectedTooth} (${toothInfo?.region || ''})`,
      `System: ${rec.brand} ${rec.system}`,
      `Diameter: ${rec.diameter} mm`,
      `Length: ${rec.length} mm`,
      `Bone Width: ${boneWidth} mm`,
      `Bone Height: ${boneHeight} mm`,
    ].join('\n');
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Implant recommendation copied to clipboard.');
  };

  const currentStep = !selectedTooth ? 1 : !selectedSystem ? 2 : (!boneWidth || !boneHeight) ? 3 : 4;
  const toothInfo = selectedTooth ? toothRecs[selectedTooth] : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#1E88E5" />
          <Text style={styles.loadingCenterText}>Loading implant data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingCenter}>
          <Ionicons name="alert-circle" size={48} color="#D32F2F" />
          <Text style={styles.errorCenterText}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="medical" size={26} color="#1E88E5" />
          <Text style={styles.headerTitle}>Implant Selection</Text>
        </View>

        {/* Steps Indicator */}
        <View style={styles.stepsRow}>
          {[
            { n: 1, label: 'Tooth' },
            { n: 2, label: 'System' },
            { n: 3, label: 'Bone' },
            { n: 4, label: 'Result' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && (
                <View style={[styles.stepLine, currentStep > s.n - 1 && styles.stepLineActive]} />
              )}
              <View style={styles.stepItem}>
                <View style={[styles.stepCircle, currentStep >= s.n && styles.stepCircleActive]}>
                  {currentStep > s.n ? (
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  ) : (
                    <Text style={[styles.stepNum, currentStep >= s.n && styles.stepNumActive]}>
                      {s.n}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, currentStep >= s.n && styles.stepLabelActive]}>
                  {s.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* STEP 1 — FDI Tooth Selection */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Step 1: Select Tooth (FDI Chart)</Text>

          {/* Upper Jaw */}
          <View style={styles.jawSection}>
            <Text style={styles.jawLabel}>Upper Jaw (Maxillary)</Text>
            <View style={styles.jawRow}>
              <View style={styles.quadrant}>
                <View style={styles.teethRow}>
                  {UPPER_RIGHT.map((t) => (
                    <Tooth
                      key={t}
                      tooth={t}
                      isSelected={selectedTooth === t}
                      isUpper={true}
                      onPress={() => {
                        setSelectedTooth(t);
                        setResults(null);
                      }}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.midline} />
              <View style={styles.quadrant}>
                <View style={styles.teethRow}>
                  {UPPER_LEFT.map((t) => (
                    <Tooth
                      key={t}
                      tooth={t}
                      isSelected={selectedTooth === t}
                      isUpper={true}
                      onPress={() => {
                        setSelectedTooth(t);
                        setResults(null);
                      }}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.jawDivider} />

          {/* Lower Jaw */}
          <View style={styles.jawSection}>
            <Text style={styles.jawLabel}>Lower Jaw (Mandibular)</Text>
            <View style={styles.jawRow}>
              <View style={styles.quadrant}>
                <View style={styles.teethRow}>
                  {LOWER_RIGHT.map((t) => (
                    <Tooth
                      key={t}
                      tooth={t}
                      isSelected={selectedTooth === t}
                      isUpper={false}
                      onPress={() => {
                        setSelectedTooth(t);
                        setResults(null);
                      }}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.midline} />
              <View style={styles.quadrant}>
                <View style={styles.teethRow}>
                  {LOWER_LEFT.map((t) => (
                    <Tooth
                      key={t}
                      tooth={t}
                      isSelected={selectedTooth === t}
                      isUpper={false}
                      onPress={() => {
                        setSelectedTooth(t);
                        setResults(null);
                      }}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Tooth Recommendation */}
          {selectedTooth && toothInfo && (
            <View style={styles.toothRecBox}>
              <View style={styles.toothRecHeader}>
                <Ionicons name="information-circle" size={18} color="#1565C0" />
                <Text style={styles.toothRecTitle}>
                  Tooth {selectedTooth}: {toothInfo.region}
                </Text>
              </View>
              <View style={styles.toothRecRow}>
                <Text style={styles.toothRecLabel}>Type:</Text>
                <Text style={styles.toothRecValue}>{toothInfo.toothType}</Text>
              </View>
              <View style={styles.toothRecRow}>
                <Text style={styles.toothRecLabel}>Diameter Guide:</Text>
                <Text style={styles.toothRecValue}>
                  {toothInfo.diameter[0]} - {toothInfo.diameter[1]} mm
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* STEP 2 — Select Implant System */}
        <View style={[styles.card, !selectedTooth && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>Step 2: Select Implant System</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              if (!selectedTooth) return;
              setShowDropdown(true);
              setSearchQuery('');
            }}
            activeOpacity={selectedTooth ? 0.7 : 1}
            testID="system-dropdown"
          >
            <Ionicons name="medical" size={18} color={selectedTooth ? '#1E88E5' : '#B0BEC5'} />
            <Text style={selectedSystem ? styles.dropdownText : styles.dropdownPlaceholder}>
              {selectedSystem
                ? `${selectedSystem.brand} - ${selectedSystem.system} (${selectedSystem.diameter}mm x ${selectedSystem.length}mm)`
                : `Select Implant (${systems.length} entries)`}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Dropdown Modal */}
        <Modal
          visible={showDropdown}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowDropdown(false)}
          statusBarTranslucent={Platform.OS === 'android'}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowDropdown(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Implant System</Text>
                <TouchableOpacity
                  onPress={() => setShowDropdown(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  testID="close-dropdown"
                >
                  <Ionicons name="close-circle" size={28} color="#666" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.searchBarContainer}>
                <Ionicons name="search" size={18} color="#90A4AE" />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search brand or system..."
                  placeholderTextColor="#B0BEC5"
                  autoFocus={true}
                  testID="system-search-input"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color="#B0BEC5" />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={true}
                bounces={true}
                nestedScrollEnabled={true}
              >
                {systems
                  .filter((item) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return item.brand.toLowerCase().includes(q) || item.system.toLowerCase().includes(q);
                  })
                  .map((item, i) => {
                  const isSelected =
                    selectedSystem?.brand === item.brand &&
                    selectedSystem?.system === item.system &&
                    selectedSystem?.diameter === item.diameter &&
                    selectedSystem?.length === item.length;
                  return (
                    <TouchableOpacity
                      key={`${item.brand}-${item.system}-${item.diameter}-${item.length}-${i}`}
                      style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                      onPress={() => {
                        setSelectedSystem(item);
                        setShowDropdown(false);
                        setResults(null);
                      }}
                      activeOpacity={0.6}
                      testID={`system-option-${i}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownItemBrand}>{item.brand}</Text>
                        <Text style={styles.dropdownItemSystem}>{item.system}</Text>
                        <Text style={styles.dropdownItemSizes}>
                          Diameter: {item.diameter} mm  |  Length: {item.length} mm
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={22} color="#1E88E5" />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 30 }} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* STEP 3 — Bone Measurements */}
        <View style={[styles.card, !selectedSystem && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>Step 3: Enter Bone Measurements</Text>

          <Text style={styles.inputLabel}>Bone Width (mm)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="resize-outline" size={18} color="#1E88E5" />
            <TextInput
              style={styles.measureInput}
              value={boneWidth}
              onChangeText={setBoneWidth}
              placeholder="e.g. 7"
              placeholderTextColor="#B0BEC5"
              keyboardType="decimal-pad"
              editable={!!selectedSystem}
              testID="bone-width-input"
            />
            <Text style={styles.unitText}>mm</Text>
          </View>

          <Text style={styles.inputLabel}>Bone Height (mm)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="arrow-up-outline" size={18} color="#1E88E5" />
            <TextInput
              style={styles.measureInput}
              value={boneHeight}
              onChangeText={setBoneHeight}
              placeholder="e.g. 12"
              placeholderTextColor="#B0BEC5"
              keyboardType="decimal-pad"
              editable={!!selectedSystem}
              testID="bone-height-input"
            />
            <Text style={styles.unitText}>mm</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.suggestBtn,
              (!selectedSystem || !boneWidth || !boneHeight) && styles.btnDisabled,
            ]}
            onPress={handleSuggest}
            disabled={!selectedSystem || !boneWidth || !boneHeight || searching}
            testID="suggest-btn"
          >
            {searching ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#FFF" />
                <Text style={styles.suggestBtnText}>Find Implant</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* STEP 4 — Results */}
        {results && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recommended Implants</Text>

            {/* Tooth Info */}
            {results.tooth_recommendation && (
              <View style={styles.toothResultBox}>
                <Text style={styles.toothResultTitle}>
                  Tooth {results.tooth_recommendation.tooth}:{' '}
                  {results.tooth_recommendation.region}
                </Text>
                <Text style={styles.toothResultSub}>
                  Type: {results.tooth_recommendation.toothType} | Rec. Diameter:{' '}
                  {results.tooth_recommendation.recommended_diameter}
                </Text>
              </View>
            )}

            {/* Clinical Guidance */}
            <View style={styles.guidanceBox}>
              <Text style={styles.guidanceTitle}>Clinical Guidance</Text>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Bone Width:</Text>
                <Text style={styles.guidanceValue}>{results.clinical_guidance.bone_width} mm</Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Max Implant Diameter:</Text>
                <Text style={styles.guidanceValue}>
                  {results.clinical_guidance.max_implant_diameter} mm
                </Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Bone Height:</Text>
                <Text style={styles.guidanceValue}>
                  {results.clinical_guidance.bone_height} mm
                </Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Max Implant Length:</Text>
                <Text style={styles.guidanceValue}>
                  {results.clinical_guidance.max_implant_length} mm
                </Text>
              </View>
            </View>

            {/* Safety Note */}
            <View style={styles.safetyBox}>
              <Ionicons name="alert-circle" size={16} color="#E65100" />
              <Text style={styles.safetyText}>{results.clinical_guidance.safety_note}</Text>
            </View>

            {/* Recommended Implants */}
            {results.recommended.length > 0 ? (
              <>
                <Text style={styles.resultSectionTitle}>Best Matches</Text>
                {results.recommended.map((imp: Implant, i: number) => (
                  <View key={`rec-${i}`} style={styles.implantCard} testID={`result-${i}`}>
                    <View style={styles.implantIcon}>
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                    </View>
                    <View style={styles.implantInfo}>
                      <Text style={styles.implantSystem}>
                        {imp.brand} - {imp.system}
                      </Text>
                      <View style={styles.implantSpecs}>
                        <View style={styles.specBadge}>
                          <Text style={styles.specBadgeText}>{imp.diameter} mm dia</Text>
                        </View>
                        <View style={styles.specBadge}>
                          <Text style={styles.specBadgeText}>{imp.length} mm length</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.noMatchBox}>
                <Ionicons name="information-circle" size={22} color="#FF9800" />
                <Text style={styles.noMatchText}>
                  No exact matches found for the given parameters.
                </Text>
              </View>
            )}

            {/* All Options */}
            {results.all_options.length > 0 && (
              <>
                <Text style={styles.resultSectionTitle}>All Available Sizes</Text>
                {results.all_options.map((imp: Implant, i: number) => {
                  const isMatch = results.recommended.some(
                    (r: Implant) => r.diameter === imp.diameter && r.length === imp.length
                  );
                  return (
                    <View
                      key={`all-${i}`}
                      style={[styles.implantRow, isMatch && styles.implantRowMatch]}
                    >
                      <Text style={styles.implantRowText}>
                        {imp.diameter} mm x {imp.length} mm
                      </Text>
                      {isMatch && <Ionicons name="checkmark" size={16} color="#4CAF50" />}
                    </View>
                  );
                })}
              </>
            )}

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopyRecommendation}
                testID="copy-recommendation-btn"
              >
                <Ionicons name="copy-outline" size={18} color="#FFF" />
                <Text style={styles.copyBtnText}>Add Implant to Case</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetBtn} onPress={handleReset} testID="reset-btn">
                <Ionicons name="refresh" size={18} color="#1E88E5" />
                <Text style={styles.resetBtnText}>New Selection</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5FAFF' },
  scroll: { padding: 16, paddingBottom: 40 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingCenterText: { fontSize: 15, color: '#546E7A' },
  errorCenterText: { fontSize: 14, color: '#D32F2F', textAlign: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#263238' },

  // Steps
  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stepItem: { alignItems: 'center', gap: 3 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: { backgroundColor: '#1E88E5' },
  stepNum: { fontSize: 12, fontWeight: '700', color: '#999' },
  stepNumActive: { color: '#FFF' },
  stepLabel: { fontSize: 9, color: '#999', fontWeight: '500' },
  stepLabelActive: { color: '#1E88E5' },
  stepLine: { height: 2, flex: 1, backgroundColor: '#E0E0E0', marginHorizontal: 4, marginBottom: 14 },
  stepLineActive: { backgroundColor: '#1E88E5' },

  // Cards
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardDisabled: { opacity: 0.45 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#263238', marginBottom: 12 },

  // FDI Chart
  jawSection: { marginBottom: 6 },
  jawLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', marginBottom: 6, textAlign: 'center' },
  jawRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  quadrant: { alignItems: 'center' },
  quadrantLabel: { fontSize: 9, color: '#90A4AE', fontWeight: '500', marginBottom: 3 },
  teethRow: { flexDirection: 'row', alignItems: 'center' },
  midline: { width: 2, height: 40, backgroundColor: '#CFD8DC', marginHorizontal: 2, borderRadius: 1 },
  jawDivider: { height: 1, backgroundColor: '#ECEFF1', marginVertical: 8 },

  // Tooth Recommendation
  toothRecBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  toothRecHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  toothRecTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  toothRecRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  toothRecLabel: { fontSize: 12, color: '#37474F' },
  toothRecValue: { fontSize: 12, fontWeight: '600', color: '#1565C0' },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D7DE',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#FAFAFA',
    gap: 10,
  },
  dropdownText: { flex: 1, fontSize: 14, color: '#263238', fontWeight: '500' },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: '#90A4AE' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#263238' },
  modalDivider: { height: 1, backgroundColor: '#F0F0F0' },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#263238' },
  modalScroll: { paddingHorizontal: 8 },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginHorizontal: 8,
    borderRadius: 8,
    minHeight: 56,
  },
  dropdownItemActive: { backgroundColor: '#E3F2FD' },
  dropdownItemBrand: { fontSize: 15, fontWeight: '600', color: '#263238' },
  dropdownItemSystem: { fontSize: 14, color: '#546E7A' },
  dropdownItemSizes: { fontSize: 11, color: '#78909C', marginTop: 2 },

  // Inputs
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 6, marginTop: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D7DE',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FAFAFA',
    gap: 8,
  },
  measureInput: { flex: 1, fontSize: 16, color: '#263238', fontWeight: '500' },
  unitText: { fontSize: 14, color: '#90A4AE', fontWeight: '500' },
  suggestBtn: {
    flexDirection: 'row',
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.4 },
  suggestBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Results
  toothResultBox: { backgroundColor: '#F3E5F5', borderRadius: 10, padding: 12, marginBottom: 10 },
  toothResultTitle: { fontSize: 14, fontWeight: '700', color: '#6A1B9A' },
  toothResultSub: { fontSize: 12, color: '#7B1FA2', marginTop: 4 },
  guidanceBox: { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 14, marginBottom: 12 },
  guidanceTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 8 },
  guidanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  guidanceLabel: { fontSize: 13, color: '#37474F' },
  guidanceValue: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  safetyBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  safetyText: { flex: 1, fontSize: 11, color: '#E65100', lineHeight: 16 },
  resultSectionTitle: { fontSize: 14, fontWeight: '700', color: '#263238', marginTop: 8, marginBottom: 8 },
  implantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  implantIcon: {},
  implantInfo: { flex: 1 },
  implantSystem: { fontSize: 14, fontWeight: '600', color: '#263238', marginBottom: 4 },
  implantSpecs: { flexDirection: 'row', gap: 8 },
  specBadge: {
    backgroundColor: '#C8E6C9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specBadgeText: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },
  noMatchBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  noMatchText: { flex: 1, fontSize: 13, color: '#F57F17' },
  implantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  implantRowMatch: { backgroundColor: '#F1F8E9' },
  implantRowText: { fontSize: 14, color: '#37474F' },

  // Action buttons
  actionRow: { marginTop: 16, gap: 10 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: '#43A047',
    borderRadius: 12,
  },
  copyBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E88E5',
    borderRadius: 10,
  },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },
});
