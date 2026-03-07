import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

type ImplantSystem = { brand: string; system: string };
type Implant = { brand: string; system: string; diameter: number; length: number };

export default function ImplantSelectionScreen() {
  const [systems, setSystems] = useState<ImplantSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSystem, setSelectedSystem] = useState<ImplantSystem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [boneWidth, setBoneWidth] = useState('');
  const [boneHeight, setBoneHeight] = useState('');
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.get('/implant-library/systems')
      .then((res) => setSystems(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSuggest = async () => {
    if (!selectedSystem || !boneWidth || !boneHeight) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await api.get('/implant-library/suggest', {
        params: {
          brand: selectedSystem.brand,
          system: selectedSystem.system,
          bone_width: parseFloat(boneWidth),
          bone_height: parseFloat(boneHeight),
        },
      });
      setResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setSelectedSystem(null);
    setBoneWidth('');
    setBoneHeight('');
    setResults(null);
  };

  const currentStep = !selectedSystem ? 1 : (!boneWidth || !boneHeight) ? 2 : 3;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="medical" size={28} color="#1E88E5" />
          <Text style={styles.headerTitle}>Implant Selection</Text>
        </View>

        {/* Steps Indicator */}
        <View style={styles.stepsRow}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepCircle, currentStep >= s && styles.stepCircleActive]}>
                <Text style={[styles.stepNum, currentStep >= s && styles.stepNumActive]}>{s}</Text>
              </View>
              <Text style={[styles.stepLabel, currentStep >= s && styles.stepLabelActive]}>
                {s === 1 ? 'System' : s === 2 ? 'Bone' : 'Result'}
              </Text>
            </View>
          ))}
        </View>

        {/* STEP 1 — Select Implant System */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Step 1: Select Implant System</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowDropdown(!showDropdown)}
            data-testid="system-dropdown"
          >
            <Ionicons name="medical" size={18} color="#1E88E5" />
            <Text style={selectedSystem ? styles.dropdownText : styles.dropdownPlaceholder}>
              {selectedSystem ? `${selectedSystem.brand} – ${selectedSystem.system}` : 'Select Implant System'}
            </Text>
            <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#8E8E93" />
          </TouchableOpacity>

          {showDropdown && (
            <View style={styles.dropdownList}>
              <FlatList
                data={systems}
                keyExtractor={(item, i) => `${item.brand}-${item.system}-${i}`}
                style={{ maxHeight: 250 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.dropdownItem,
                      selectedSystem?.brand === item.brand && selectedSystem?.system === item.system && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setSelectedSystem(item);
                      setShowDropdown(false);
                      setResults(null);
                    }}
                    data-testid={`system-${item.brand}-${item.system}`}
                  >
                    <Text style={styles.dropdownItemBrand}>{item.brand}</Text>
                    <Text style={styles.dropdownItemSystem}>{item.system}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        {/* STEP 2 — Bone Measurements */}
        <View style={[styles.card, !selectedSystem && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>Step 2: Enter Bone Measurements</Text>

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
              data-testid="bone-width-input"
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
              placeholder="e.g. 13"
              placeholderTextColor="#B0BEC5"
              keyboardType="decimal-pad"
              editable={!!selectedSystem}
              data-testid="bone-height-input"
            />
            <Text style={styles.unitText}>mm</Text>
          </View>

          <TouchableOpacity
            style={[styles.suggestBtn, (!selectedSystem || !boneWidth || !boneHeight) && styles.btnDisabled]}
            onPress={handleSuggest}
            disabled={!selectedSystem || !boneWidth || !boneHeight || searching}
            data-testid="suggest-btn"
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

        {/* STEP 3 — Results */}
        {results && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Step 3: Recommended Implants</Text>

            {/* Clinical Guidance */}
            <View style={styles.guidanceBox}>
              <Text style={styles.guidanceTitle}>Clinical Guidance</Text>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Bone Width:</Text>
                <Text style={styles.guidanceValue}>{results.clinical_guidance.bone_width} mm</Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Diameter Range:</Text>
                <Text style={styles.guidanceValue}>{results.clinical_guidance.recommended_diameter_range}</Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Bone Height:</Text>
                <Text style={styles.guidanceValue}>{results.clinical_guidance.bone_height} mm</Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Length Range:</Text>
                <Text style={styles.guidanceValue}>{results.clinical_guidance.recommended_length_range}</Text>
              </View>
              <View style={styles.guidanceRow}>
                <Text style={styles.guidanceLabel}>Category:</Text>
                <Text style={styles.guidanceValue}>{results.clinical_guidance.length_category}</Text>
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
                  <View key={`rec-${i}`} style={styles.implantCard} data-testid={`result-${i}`}>
                    <View style={styles.implantIcon}>
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                    </View>
                    <View style={styles.implantInfo}>
                      <Text style={styles.implantSystem}>{imp.brand} – {imp.system}</Text>
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
                  No exact matches found for the given bone measurements with this system.
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
                    <View key={`all-${i}`} style={[styles.implantRow, isMatch && styles.implantRowMatch]}>
                      <Text style={styles.implantRowText}>
                        {imp.diameter} mm x {imp.length} mm
                      </Text>
                      {isMatch && (
                        <Ionicons name="checkmark" size={16} color="#4CAF50" />
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {/* Reset Button */}
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset} data-testid="reset-btn">
              <Ionicons name="refresh" size={18} color="#1E88E5" />
              <Text style={styles.resetBtnText}>New Selection</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5FAFF' },
  scroll: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#263238' },
  stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginBottom: 20 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0E0E0',
    justifyContent: 'center', alignItems: 'center',
  },
  stepCircleActive: { backgroundColor: '#1E88E5' },
  stepNum: { fontSize: 14, fontWeight: '700', color: '#999' },
  stepNumActive: { color: '#FFF' },
  stepLabel: { fontSize: 10, color: '#999', fontWeight: '500' },
  stepLabelActive: { color: '#1E88E5' },
  card: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 18, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#263238', marginBottom: 12 },
  dropdown: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D7DE',
    borderRadius: 12, padding: 14, backgroundColor: '#FAFAFA', gap: 10,
  },
  dropdownText: { flex: 1, fontSize: 14, color: '#263238', fontWeight: '500' },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: '#90A4AE' },
  dropdownList: {
    marginTop: 8, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    backgroundColor: '#FFF', overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: { backgroundColor: '#E3F2FD' },
  dropdownItemBrand: { fontSize: 14, fontWeight: '600', color: '#263238' },
  dropdownItemSystem: { fontSize: 13, color: '#546E7A' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 6, marginTop: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D7DE',
    borderRadius: 12, padding: 12, backgroundColor: '#FAFAFA', gap: 8,
  },
  measureInput: { flex: 1, fontSize: 16, color: '#263238', fontWeight: '500' },
  unitText: { fontSize: 14, color: '#90A4AE', fontWeight: '500' },
  suggestBtn: {
    flexDirection: 'row', backgroundColor: '#1E88E5', borderRadius: 12,
    padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16,
  },
  btnDisabled: { opacity: 0.4 },
  suggestBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  guidanceBox: {
    backgroundColor: '#E3F2FD', borderRadius: 10, padding: 14, marginBottom: 12,
  },
  guidanceTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 8 },
  guidanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  guidanceLabel: { fontSize: 13, color: '#37474F' },
  guidanceValue: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  safetyBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#FFF3E0', borderRadius: 8,
    padding: 10, marginBottom: 14, alignItems: 'flex-start',
  },
  safetyText: { flex: 1, fontSize: 11, color: '#E65100', lineHeight: 16 },
  resultSectionTitle: { fontSize: 14, fontWeight: '700', color: '#263238', marginTop: 8, marginBottom: 8 },
  implantCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F8E9',
    borderRadius: 10, padding: 12, marginBottom: 8, gap: 10,
  },
  implantIcon: {},
  implantInfo: { flex: 1 },
  implantSystem: { fontSize: 14, fontWeight: '600', color: '#263238', marginBottom: 4 },
  implantSpecs: { flexDirection: 'row', gap: 8 },
  specBadge: {
    backgroundColor: '#C8E6C9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  specBadgeText: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },
  noMatchBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#FFF8E1', borderRadius: 10,
    padding: 14, alignItems: 'center', marginBottom: 8,
  },
  noMatchText: { flex: 1, fontSize: 13, color: '#F57F17' },
  implantRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  implantRowMatch: { backgroundColor: '#F1F8E9' },
  implantRowText: { fontSize: 14, color: '#37474F' },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 16, padding: 12, borderWidth: 1, borderColor: '#1E88E5',
    borderRadius: 10,
  },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },
});
