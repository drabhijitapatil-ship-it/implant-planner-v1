import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

// ── FDI Tooth Chart Data ───────────────────────────────────
const UPPER_RIGHT = ['17','16','15','14','13','12','11'];
const UPPER_LEFT  = ['21','22','23','24','25','26','27'];
const LOWER_RIGHT = ['47','46','45','44','43','42','41'];
const LOWER_LEFT  = ['31','32','33','34','35','36','37'];
const TOOTH_TYPE: Record<string,string> = {};
['16','17','26','27','36','37','46','47'].forEach(t => TOOTH_TYPE[t] = 'molar');
['14','15','24','25','34','35','44','45'].forEach(t => TOOTH_TYPE[t] = 'premolar');
['13','23','33','43'].forEach(t => TOOTH_TYPE[t] = 'canine');
['11','12','21','22','31','32','41','42'].forEach(t => TOOTH_TYPE[t] = 'incisor');

interface ImplantSystem {
  brand: string; system: string; diameters: number[]; lengths: number[]; count: number;
  indication?: string; restricted_teeth?: string[];
}
interface ImplantPlanItem {
  position: string; brand: string; system: string; diameter: number; length: number;
  bone_width?: number; bone_height?: number; bone_type?: string;
  risk_level?: string; risk_score?: number;
}
interface Props {
  procedureId: string;
  isOwner: boolean;
  userRole: string;
}

export default function CaseImplantPlanning({ procedureId, isOwner, userRole }: Props) {
  const [plans, setPlans] = useState<ImplantPlanItem[]>([]);
  const [systems, setSystems] = useState<ImplantSystem[]>([]);
  const [toothRecs, setToothRecs] = useState<Record<string,any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const canEdit = isOwner && userRole === 'student';

  const loadData = useCallback(async () => {
    try {
      const [planRes, sysRes, toothRes] = await Promise.allSettled([
        api.get(`/procedures/${procedureId}/implant-plan`),
        api.get('/implant-library/systems'),
        api.get('/implant-library/tooth-recommendations'),
      ]);
      if (planRes.status === 'fulfilled') setPlans(planRes.value.data.implant_plans || []);
      if (sysRes.status === 'fulfilled') setSystems(sysRes.value.data || []);
      if (toothRes.status === 'fulfilled') setToothRecs(toothRes.value.data || {});
    } catch (err) {
      console.error('Failed to load implant planning data:', err);
    } finally {
      setLoading(false);
    }
  }, [procedureId]);

  useEffect(() => { loadData(); }, [loadData]);

  const savePlans = async (newPlans: ImplantPlanItem[]) => {
    setSaving(true);
    try {
      await api.post(`/procedures/${procedureId}/implant-plan`, { implants: newPlans });
      setPlans(newPlans);
      Alert.alert('Saved', `Implant plan saved (${newPlans.length} implant${newPlans.length > 1 ? 's' : ''}).`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to save implant plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddImplant = (item: ImplantPlanItem) => {
    if (editingIdx !== null) {
      const updated = [...plans];
      updated[editingIdx] = item;
      savePlans(updated);
      setEditingIdx(null);
    } else {
      savePlans([...plans, item]);
    }
    setShowAddModal(false);
  };

  const handleDeleteImplant = (idx: number) => {
    Alert.alert('Remove Implant', `Remove implant at position ${plans[idx].position}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        const updated = plans.filter((_, i) => i !== idx);
        savePlans(updated);
      }},
    ]);
  };

  const handleEditImplant = (idx: number) => {
    setEditingIdx(idx);
    setShowAddModal(true);
  };

  const usedPositions = plans.map(p => p.position);

  if (loading) {
    return (
      <View style={st.loadingBox}>
        <ActivityIndicator size="small" color="#1E88E5" />
        <Text style={st.loadingText}>Loading implant plans...</Text>
      </View>
    );
  }

  return (
    <View style={st.container} data-testid="case-implant-planning">
      <View style={st.header}>
        <View style={st.headerLeft}>
          <Ionicons name="medical" size={22} color="#1E88E5" />
          <Text style={st.headerTitle}>Implant Planning</Text>
        </View>
        <View style={st.badge}>
          <Text style={st.badgeText}>{plans.length}/6</Text>
        </View>
      </View>

      {/* Saved Implant Cards */}
      {plans.map((plan, idx) => {
        const rec = toothRecs[plan.position];
        return (
          <View key={`${plan.position}-${idx}`} style={st.implantCard} data-testid={`implant-plan-${idx}`}>
            <View style={st.implantCardHeader}>
              <View style={st.positionBadge}>
                <Text style={st.positionText}>{plan.position}</Text>
              </View>
              <View style={st.implantInfo}>
                <Text style={st.implantTitle}>{plan.brand} - {plan.system}</Text>
                <Text style={st.implantSpecs}>
                  D: {plan.diameter}mm | L: {plan.length}mm
                  {rec ? ` | ${rec.region}` : ''}
                </Text>
              </View>
              {plan.risk_level && (
                <View style={[st.riskBadge, { backgroundColor: plan.risk_level === 'Low' ? '#E8F5E9' : plan.risk_level === 'Moderate' ? '#FFF3E0' : '#FFEBEE' }]}>
                  <Text style={[st.riskBadgeText, { color: plan.risk_level === 'Low' ? '#4CAF50' : plan.risk_level === 'Moderate' ? '#FF9800' : '#F44336' }]}>
                    {plan.risk_level}
                  </Text>
                </View>
              )}
            </View>
            <View style={st.implantDetails}>
              {plan.bone_width && <Text style={st.detailText}>Bone: {plan.bone_width}mm W x {plan.bone_height}mm H</Text>}
              {plan.bone_type && <Text style={st.detailText}>Bone Type: {plan.bone_type}</Text>}
              {plan.risk_score !== undefined && plan.risk_score !== null && <Text style={st.detailText}>Risk Score: {plan.risk_score}/15</Text>}
            </View>
            {canEdit && (
              <View style={st.implantActions}>
                <TouchableOpacity style={st.editBtn} onPress={() => handleEditImplant(idx)} data-testid={`edit-implant-${idx}`}>
                  <Ionicons name="pencil" size={16} color="#1E88E5" />
                  <Text style={st.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.deleteBtn} onPress={() => handleDeleteImplant(idx)} data-testid={`delete-implant-${idx}`}>
                  <Ionicons name="trash-outline" size={16} color="#F44336" />
                  <Text style={st.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {plans.length === 0 && (
        <View style={st.emptyState}>
          <Ionicons name="medical-outline" size={36} color="#CCC" />
          <Text style={st.emptyText}>No implants planned yet</Text>
          <Text style={st.emptySubtext}>Add up to 6 implant positions for this case</Text>
        </View>
      )}

      {canEdit && plans.length < 6 && (
        <TouchableOpacity
          style={st.addButton}
          onPress={() => { setEditingIdx(null); setShowAddModal(true); }}
          disabled={saving}
          data-testid="add-implant-btn"
        >
          {saving ? (
            <ActivityIndicator color="#1E88E5" size="small" />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="#1E88E5" />
              <Text style={st.addButtonText}>Add Implant Position ({plans.length}/6)</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal */}
      <ImplantPlanModal
        visible={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingIdx(null); }}
        onSave={handleAddImplant}
        systems={systems}
        toothRecs={toothRecs}
        usedPositions={editingIdx !== null ? usedPositions.filter((_, i) => i !== editingIdx) : usedPositions}
        editItem={editingIdx !== null ? plans[editingIdx] : undefined}
      />
    </View>
  );
}

// ── Add/Edit Implant Modal Component ───────────────────────
function ImplantPlanModal({ visible, onClose, onSave, systems, toothRecs, usedPositions, editItem }: {
  visible: boolean; onClose: () => void; onSave: (item: ImplantPlanItem) => void;
  systems: ImplantSystem[]; toothRecs: Record<string,any>; usedPositions: string[];
  editItem?: ImplantPlanItem;
}) {
  const [step, setStep] = useState(1);
  const [position, setPosition] = useState('');
  const [mode, setMode] = useState<'choose'|'suggest'>('choose');
  const [selectedSystem, setSelectedSystem] = useState<ImplantSystem | null>(null);
  const [boneWidth, setBoneWidth] = useState('');
  const [boneHeight, setBoneHeight] = useState('');
  const [boneType, setBoneType] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedImplant, setSelectedImplant] = useState<{diameter: number; length: number; brand: string; system: string} | null>(null);
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showSystemDD, setShowSystemDD] = useState(false);
  const [systemSearch, setSystemSearch] = useState('');

  // Suggest Me states
  const [sProcedures, setSProcedures] = useState<string[]>([]);
  const PROCEDURES = ['Conventional Implant Placement','Conventional Implant Placement with Bone Graft','Immediate Implant Placement','Immediate Implant Placement with Bone Graft','Sinus Lift','Restricted Bone Height'];
  const BONE_TYPES = ['D1','D2','D3','D4'];

  useEffect(() => {
    if (visible) {
      if (editItem) {
        setPosition(editItem.position);
        setBoneWidth(editItem.bone_width?.toString() || '');
        setBoneHeight(editItem.bone_height?.toString() || '');
        setBoneType(editItem.bone_type || '');
        setSelectedImplant({ diameter: editItem.diameter, length: editItem.length, brand: editItem.brand, system: editItem.system });
        if (editItem.risk_level) {
          setRiskResult({ risk_level: editItem.risk_level, total_score: editItem.risk_score });
        }
        setStep(4); // Skip to review
      } else {
        resetForm();
      }
    }
  }, [visible, editItem]);

  const resetForm = () => {
    setStep(1); setPosition(''); setMode('choose'); setSelectedSystem(null);
    setBoneWidth(''); setBoneHeight(''); setBoneType(''); setResult(null);
    setSelectedImplant(null); setRiskResult(null); setSProcedures([]);
  };

  const handleSearch = async () => {
    setSearching(true); setResult(null);
    try {
      if (mode === 'choose') {
        const res = await api.get('/implant-library/suggest', {
          params: { brand: selectedSystem!.brand, system: selectedSystem!.system,
            bone_width: parseFloat(boneWidth), bone_height: parseFloat(boneHeight), tooth: position },
        });
        setResult(res.data);
      } else {
        const res = await api.post('/implant-library/suggest-auto', {
          tooth: position, procedures: sProcedures, bone_type: boneType,
          bone_width: parseFloat(boneWidth), bone_height: parseFloat(boneHeight),
        });
        setResult(res.data);
      }
      setStep(3);
    } catch { Alert.alert('Error', 'Failed to get suggestions.'); }
    finally { setSearching(false); }
  };

  const handleCalcRisk = async () => {
    if (!selectedImplant || !boneType) return;
    setRiskLoading(true);
    try {
      const res = await api.post('/implant-library/calculate-risk', {
        bone_width: parseFloat(boneWidth), bone_height: parseFloat(boneHeight),
        implant_diameter: selectedImplant.diameter, implant_length: selectedImplant.length,
        bone_type: boneType, procedure: sProcedures[0] || 'Conventional Implant Placement', tooth: position,
      });
      setRiskResult(res.data);
    } catch { Alert.alert('Error', 'Failed to calculate risk.'); }
    finally { setRiskLoading(false); }
  };

  const handleConfirm = () => {
    if (!selectedImplant || !position) return;
    onSave({
      position, brand: selectedImplant.brand, system: selectedImplant.system,
      diameter: selectedImplant.diameter, length: selectedImplant.length,
      bone_width: parseFloat(boneWidth) || undefined, bone_height: parseFloat(boneHeight) || undefined,
      bone_type: boneType || undefined, risk_level: riskResult?.risk_level,
      risk_score: riskResult?.total_score,
    });
  };

  const toothInfo = position ? toothRecs[position] : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ms.container}>
        {/* Header */}
        <View style={ms.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={ms.headerTitle}>{editItem ? 'Edit' : 'Add'} Implant Position</Text>
          <Text style={ms.stepIndicator}>Step {step}/4</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={ms.scroll}>
          {/* STEP 1: Select Tooth */}
          {step === 1 && (
            <View>
              <Text style={ms.stepTitle}>Select Tooth Position</Text>
              <MiniDentalChart
                selected={position}
                disabled={usedPositions}
                onSelect={(t) => setPosition(t)}
              />
              {position && toothInfo && (
                <View style={ms.recBox}>
                  <Text style={ms.recTitle}>Tooth {position}: {toothInfo.region}</Text>
                  <Text style={ms.recText}>Diameter: {toothInfo.diameter[0]}-{toothInfo.diameter[1]}mm | Length: {toothInfo.length[0]}-{toothInfo.length[1]}mm</Text>
                </View>
              )}
              <TouchableOpacity
                style={[ms.nextBtn, !position && ms.btnDisabled]}
                disabled={!position}
                onPress={() => setStep(2)}
                data-testid="step1-next"
              >
                <Text style={ms.nextBtnText}>Next: Select Implant</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: Select Mode & System */}
          {step === 2 && (
            <View>
              <Text style={ms.stepTitle}>Select Implant System</Text>
              {/* Mode Tabs */}
              <View style={ms.modeRow}>
                <TouchableOpacity style={[ms.modeBtn, mode === 'choose' && ms.modeBtnActive]} onPress={() => setMode('choose')}>
                  <Ionicons name="hand-left-outline" size={16} color={mode === 'choose' ? '#FFF' : '#666'} />
                  <Text style={[ms.modeBtnText, mode === 'choose' && ms.modeBtnTextActive]}>Let Me Choose</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ms.modeBtn, mode === 'suggest' && ms.modeBtnActive]} onPress={() => setMode('suggest')}>
                  <Ionicons name="bulb-outline" size={16} color={mode === 'suggest' ? '#FFF' : '#666'} />
                  <Text style={[ms.modeBtnText, mode === 'suggest' && ms.modeBtnTextActive]}>Suggest Me</Text>
                </TouchableOpacity>
              </View>

              {mode === 'choose' ? (
                <>
                  <TouchableOpacity style={ms.dropdown} onPress={() => setShowSystemDD(true)} data-testid="modal-system-dropdown">
                    <Text style={selectedSystem ? ms.ddText : ms.ddPlaceholder}>
                      {selectedSystem ? `${selectedSystem.brand} - ${selectedSystem.system}` : `Select System (${systems.length})`}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                  </TouchableOpacity>
                  <Text style={ms.inputLabel}>Bone Width (mm)</Text>
                  <TextInput style={ms.input} value={boneWidth} onChangeText={setBoneWidth} keyboardType="decimal-pad" placeholder="e.g. 7" data-testid="modal-bone-width" />
                  <Text style={ms.inputLabel}>Bone Height (mm)</Text>
                  <TextInput style={ms.input} value={boneHeight} onChangeText={setBoneHeight} keyboardType="decimal-pad" placeholder="e.g. 12" data-testid="modal-bone-height" />
                </>
              ) : (
                <>
                  <Text style={ms.inputLabel}>Procedure Type</Text>
                  {PROCEDURES.map(proc => {
                    const sel = sProcedures.includes(proc);
                    return (
                      <TouchableOpacity key={proc} style={[ms.procChip, sel && ms.procChipActive]}
                        onPress={() => setSProcedures(prev => sel ? prev.filter(p=>p!==proc) : [...prev, proc])}>
                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18} color={sel ? '#1E88E5' : '#999'} />
                        <Text style={[ms.procChipText, sel && ms.procChipTextActive]}>{proc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={ms.inputLabel}>Bone Type</Text>
                  <View style={ms.boneTypeRow}>
                    {BONE_TYPES.map(bt => (
                      <TouchableOpacity key={bt} style={[ms.boneTypeBtn, boneType === bt && ms.boneTypeBtnActive]} onPress={() => setBoneType(bt)}>
                        <Text style={[ms.boneTypeBtnText, boneType === bt && ms.boneTypeBtnTextActive]}>{bt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={ms.inputLabel}>Bone Width (mm)</Text>
                  <TextInput style={ms.input} value={boneWidth} onChangeText={setBoneWidth} keyboardType="decimal-pad" placeholder="e.g. 7" />
                  <Text style={ms.inputLabel}>Bone Height (mm)</Text>
                  <TextInput style={ms.input} value={boneHeight} onChangeText={setBoneHeight} keyboardType="decimal-pad" placeholder="e.g. 12" />
                </>
              )}

              <View style={ms.navRow}>
                <TouchableOpacity style={ms.backBtn} onPress={() => setStep(1)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={ms.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ms.nextBtn, ms.nextBtnFlex,
                    (mode === 'choose' ? (!selectedSystem || !boneWidth || !boneHeight) : (!sProcedures.length || !boneType || !boneWidth || !boneHeight)) && ms.btnDisabled]}
                  disabled={mode === 'choose' ? (!selectedSystem || !boneWidth || !boneHeight || searching) : (!sProcedures.length || !boneType || !boneWidth || !boneHeight || searching)}
                  onPress={handleSearch}
                  data-testid="step2-search"
                >
                  {searching ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <>
                      <Text style={ms.nextBtnText}>Find Implant</Text>
                      <Ionicons name="search" size={20} color="#FFF" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 3: Select from Results */}
          {step === 3 && result && (
            <View>
              <Text style={ms.stepTitle}>Select Implant</Text>
              {(() => {
                const implants = mode === 'choose'
                  ? (result.recommended?.length ? result.recommended : result.all_options || [])
                  : (result.suggestions || []).flatMap((s: any) => (s.implants || []).map((imp: any) => ({ ...imp, brand: s.brand, system: s.system })));
                if (implants.length === 0) return <Text style={ms.noResults}>No implants found for these measurements.</Text>;
                return implants.slice(0, 10).map((imp: any, i: number) => {
                  const isSelected = selectedImplant?.diameter === imp.diameter && selectedImplant?.length === imp.length && selectedImplant?.brand === imp.brand;
                  return (
                    <TouchableOpacity key={i} style={[ms.implantOption, isSelected && ms.implantOptionSelected]}
                      onPress={() => setSelectedImplant({ diameter: imp.diameter, length: imp.length, brand: imp.brand || selectedSystem?.brand || '', system: imp.system || selectedSystem?.system || '' })}
                      data-testid={`result-implant-${i}`}>
                      <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={22} color={isSelected ? '#1E88E5' : '#CCC'} />
                      <View style={{ flex: 1 }}>
                        <Text style={ms.implantName}>{imp.brand || selectedSystem?.brand} - {imp.system || selectedSystem?.system}</Text>
                        <Text style={ms.implantSpec}>D: {imp.diameter}mm | L: {imp.length}mm</Text>
                      </View>
                      {i === 0 && <View style={ms.bestBadge}><Text style={ms.bestBadgeText}>Best</Text></View>}
                    </TouchableOpacity>
                  );
                });
              })()}

              <View style={ms.navRow}>
                <TouchableOpacity style={ms.backBtn} onPress={() => setStep(2)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={ms.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ms.nextBtn, ms.nextBtnFlex, !selectedImplant && ms.btnDisabled]}
                  disabled={!selectedImplant}
                  onPress={() => setStep(4)}
                  data-testid="step3-next"
                >
                  <Text style={ms.nextBtnText}>Next: Risk Assessment</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 4: Risk Assessment & Confirm */}
          {step === 4 && selectedImplant && (
            <View>
              <Text style={ms.stepTitle}>Risk Assessment & Confirm</Text>
              <View style={ms.summaryCard}>
                <Text style={ms.summaryLabel}>Tooth Position</Text>
                <Text style={ms.summaryValue}>{position} {toothInfo ? `(${toothInfo.region})` : ''}</Text>
                <Text style={ms.summaryLabel}>Implant System</Text>
                <Text style={ms.summaryValue}>{selectedImplant.brand} - {selectedImplant.system}</Text>
                <Text style={ms.summaryLabel}>Dimensions</Text>
                <Text style={ms.summaryValue}>D: {selectedImplant.diameter}mm | L: {selectedImplant.length}mm</Text>
                {boneWidth && <><Text style={ms.summaryLabel}>Bone</Text><Text style={ms.summaryValue}>{boneWidth}mm W x {boneHeight}mm H</Text></>}
              </View>

              {!riskResult && (
                <>
                  {!boneType && (
                    <>
                      <Text style={ms.inputLabel}>Bone Type (for risk calculation)</Text>
                      <View style={ms.boneTypeRow}>
                        {BONE_TYPES.map(bt => (
                          <TouchableOpacity key={bt} style={[ms.boneTypeBtn, boneType === bt && ms.boneTypeBtnActive]} onPress={() => setBoneType(bt)}>
                            <Text style={[ms.boneTypeBtnText, boneType === bt && ms.boneTypeBtnTextActive]}>{bt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  <TouchableOpacity
                    style={[ms.riskBtn, !boneType && ms.btnDisabled]}
                    disabled={!boneType || riskLoading}
                    onPress={handleCalcRisk}
                    data-testid="calc-risk-btn"
                  >
                    {riskLoading ? <ActivityIndicator color="#FFF" size="small" /> : (
                      <>
                        <Ionicons name="shield-checkmark" size={18} color="#FFF" />
                        <Text style={ms.riskBtnText}>Calculate Risk</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {riskResult && (
                <View style={[ms.riskResultBox, {
                  backgroundColor: riskResult.risk_level === 'Low' ? '#E8F5E9' : riskResult.risk_level === 'Moderate' ? '#FFF3E0' : '#FFEBEE',
                  borderColor: riskResult.risk_level === 'Low' ? '#4CAF50' : riskResult.risk_level === 'Moderate' ? '#FF9800' : '#F44336',
                }]}>
                  <Ionicons name={riskResult.risk_level === 'Low' ? 'shield-checkmark' : 'alert-circle'} size={24}
                    color={riskResult.risk_level === 'Low' ? '#4CAF50' : riskResult.risk_level === 'Moderate' ? '#FF9800' : '#F44336'} />
                  <View style={{ flex: 1 }}>
                    <Text style={ms.riskLevel}>{riskResult.risk_level} Risk</Text>
                    <Text style={ms.riskScore}>Score: {riskResult.total_score}/15</Text>
                  </View>
                </View>
              )}

              <View style={ms.navRow}>
                <TouchableOpacity style={ms.backBtn} onPress={() => editItem ? onClose() : setStep(3)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={ms.backBtnText}>{editItem ? 'Cancel' : 'Back'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ms.confirmBtn, ms.nextBtnFlex]} onPress={handleConfirm} data-testid="confirm-implant-btn">
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={ms.confirmBtnText}>{editItem ? 'Update' : 'Add'} Implant</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* System Dropdown Modal */}
        <Modal visible={showSystemDD} animationType="slide" transparent onRequestClose={() => setShowSystemDD(false)}>
          <View style={ms.ddOverlay}>
            <View style={ms.ddModal}>
              <View style={ms.ddHeader}>
                <Text style={ms.ddHeaderTitle}>Select Implant System</Text>
                <TouchableOpacity onPress={() => setShowSystemDD(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <View style={ms.ddSearchRow}>
                <Ionicons name="search" size={18} color="#999" />
                <TextInput style={ms.ddSearchInput} value={systemSearch} onChangeText={setSystemSearch}
                  placeholder="Search brand or system..." autoFocus />
              </View>
              <FlatList
                data={systems.filter(s => {
                  if (!systemSearch.trim()) return true;
                  const q = systemSearch.toLowerCase();
                  return s.brand.toLowerCase().includes(q) || s.system.toLowerCase().includes(q);
                })}
                keyExtractor={(item, i) => `${item.brand}-${item.system}-${i}`}
                renderItem={({ item }) => {
                  const isSel = selectedSystem?.brand === item.brand && selectedSystem?.system === item.system;
                  const isRestricted = item.restricted_teeth && position && !item.restricted_teeth.includes(position);
                  return (
                    <TouchableOpacity style={[ms.ddItem, isSel && ms.ddItemSelected, isRestricted && ms.ddItemRestricted]}
                      onPress={() => {
                        if (isRestricted) { Alert.alert('Not Indicated', `This system is not indicated for tooth ${position}.`); return; }
                        setSelectedSystem(item); setShowSystemDD(false);
                      }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[ms.ddItemTitle, isRestricted && { color: '#999' }]}>{item.brand} - {item.system}</Text>
                        <Text style={ms.ddItemSub}>{item.count} sizes | D: {item.diameters[0]}-{item.diameters[item.diameters.length-1]}mm</Text>
                      </View>
                      {isSel && <Ionicons name="checkmark-circle" size={22} color="#1E88E5" />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

// ── Mini FDI Dental Chart (compact) ────────────────────────
function MiniDentalChart({ selected, disabled, onSelect }: {
  selected: string; disabled: string[]; onSelect: (t: string) => void;
}) {
  const renderRow = (left: string[], right: string[], label: string) => (
    <View style={dc.row}>
      <Text style={dc.label}>{label}</Text>
      <View style={dc.teeth}>
        {left.map(t => {
          const isSel = selected === t;
          const isDis = disabled.includes(t);
          return (
            <TouchableOpacity key={t} style={[dc.tooth, isSel && dc.toothSel, isDis && dc.toothDis]}
              onPress={() => !isDis && onSelect(t)} disabled={isDis}>
              <Text style={[dc.toothNum, isSel && dc.toothNumSel, isDis && dc.toothNumDis]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={dc.midline} />
        {right.map(t => {
          const isSel = selected === t;
          const isDis = disabled.includes(t);
          return (
            <TouchableOpacity key={t} style={[dc.tooth, isSel && dc.toothSel, isDis && dc.toothDis]}
              onPress={() => !isDis && onSelect(t)} disabled={isDis}>
              <Text style={[dc.toothNum, isSel && dc.toothNumSel, isDis && dc.toothNumDis]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
  return (
    <View style={dc.container}>
      {renderRow(UPPER_RIGHT, UPPER_LEFT, 'Upper')}
      <View style={dc.jawLine} />
      {renderRow(LOWER_RIGHT, LOWER_LEFT, 'Lower')}
    </View>
  );
}

const dc = StyleSheet.create({
  container: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginVertical: 8 },
  row: { marginVertical: 4 },
  label: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  teeth: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  midline: { width: 2, height: 24, backgroundColor: '#DDD', marginHorizontal: 4 },
  jawLine: { height: 2, backgroundColor: '#DDD', marginVertical: 4 },
  tooth: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#E8EDF2', alignItems: 'center', justifyContent: 'center', marginHorizontal: 1, borderWidth: 1, borderColor: '#C5CDD5' },
  toothSel: { backgroundColor: '#1E88E5', borderColor: '#1565C0' },
  toothDis: { backgroundColor: '#FFCDD2', borderColor: '#EF9A9A' },
  toothNum: { fontSize: 9, fontWeight: '700', color: '#37474F' },
  toothNumSel: { color: '#FFF' },
  toothNumDis: { color: '#E57373' },
});

// ── Styles ─────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { marginBottom: 12 },
  loadingBox: { backgroundColor: '#FFF', padding: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  loadingText: { fontSize: 14, color: '#666' },
  header: { backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  badge: { backgroundColor: '#1E88E5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  implantCard: { backgroundColor: '#FFF', marginTop: 1, padding: 14 },
  implantCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  positionBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  positionText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  implantInfo: { flex: 1 },
  implantTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  implantSpecs: { fontSize: 12, color: '#888', marginTop: 2 },
  riskBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  riskBadgeText: { fontSize: 11, fontWeight: '700' },
  implantDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 48 },
  detailText: { fontSize: 11, color: '#888', backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  implantActions: { flexDirection: 'row', gap: 12, marginTop: 10, paddingLeft: 48 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 12, color: '#1E88E5', fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtnText: { fontSize: 12, color: '#F44336', fontWeight: '600' },
  emptyState: { backgroundColor: '#FFF', padding: 30, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#999' },
  emptySubtext: { fontSize: 12, color: '#BBB' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#1E88E5', borderStyle: 'dashed' },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#1E88E5' },
});

const ms = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  stepIndicator: { fontSize: 14, color: '#888', fontWeight: '600' },
  scroll: { padding: 16, flexGrow: 1, justifyContent: 'center' },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  recBox: { backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginTop: 10 },
  recTitle: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  recText: { fontSize: 12, color: '#1976D2', marginTop: 4 },
  nextBtn: { backgroundColor: '#1E88E5', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  nextBtnFlex: { flex: 1 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, backgroundColor: '#F0F0F0' },
  modeBtnActive: { backgroundColor: '#1E88E5' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  modeBtnTextActive: { color: '#FFF' },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, backgroundColor: '#FFF', marginBottom: 12 },
  ddText: { fontSize: 15, color: '#333', flex: 1 },
  ddPlaceholder: { fontSize: 15, color: '#999', flex: 1 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#FFF' },
  procChip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, marginBottom: 4, backgroundColor: '#F8F8F8' },
  procChipActive: { backgroundColor: '#E3F2FD' },
  procChipText: { fontSize: 13, color: '#666' },
  procChipTextActive: { color: '#1565C0', fontWeight: '600' },
  boneTypeRow: { flexDirection: 'row', gap: 8 },
  boneTypeBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#DDD', backgroundColor: '#FFF' },
  boneTypeBtnActive: { borderColor: '#1E88E5', backgroundColor: '#E3F2FD' },
  boneTypeBtnText: { fontSize: 14, fontWeight: '700', color: '#666' },
  boneTypeBtnTextActive: { color: '#1E88E5' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12 },
  backBtnText: { fontSize: 14, color: '#666', fontWeight: '600' },
  noResults: { fontSize: 14, color: '#999', textAlign: 'center', padding: 20 },
  implantOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#FFF', marginBottom: 8 },
  implantOptionSelected: { borderColor: '#1E88E5', backgroundColor: '#F0F8FF' },
  implantName: { fontSize: 14, fontWeight: '600', color: '#333' },
  implantSpec: { fontSize: 12, color: '#888', marginTop: 2 },
  bestBadge: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bestBadgeText: { fontSize: 10, fontWeight: '700', color: '#4CAF50' },
  summaryCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginTop: 8 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  riskBtn: { backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  riskBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  riskResultBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1.5, padding: 14, marginTop: 12 },
  riskLevel: { fontSize: 16, fontWeight: '700' },
  riskScore: { fontSize: 12, color: '#666', marginTop: 2 },
  confirmBtn: { backgroundColor: '#4CAF50', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  ddModal: { backgroundColor: '#FFF', borderRadius: 16, maxHeight: '80%', overflow: 'hidden' },
  ddHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  ddHeaderTitle: { fontSize: 18, fontWeight: '600' },
  ddSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddSearchInput: { flex: 1, fontSize: 15, padding: 8 },
  ddItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddItemSelected: { backgroundColor: '#F0F8FF' },
  ddItemRestricted: { opacity: 0.4 },
  ddItemTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  ddItemSub: { fontSize: 11, color: '#888', marginTop: 2 },
});
