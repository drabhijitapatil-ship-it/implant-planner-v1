import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHECKLIST_DATA } from '../constants/checklist';

interface ChecklistFormProps {
  checklist: any;
  onChecklistChange: (checklist: any) => void;
  phase?: 1 | 2;  // Optional: which phase to show (1=pre-surgical only, 2=surgical only)
}

export default function ChecklistForm({ checklist, onChecklistChange, phase }: ChecklistFormProps) {
  // For simple checkbox toggle (Phase 1)
  const handleCheckboxToggle = (section: string, itemId: string, itemLabel: string) => {
    const updatedChecklist = { ...checklist };
    if (!updatedChecklist[section]) {
      updatedChecklist[section] = { items: [] };
    }
    const itemIndex = updatedChecklist[section].items.findIndex(
      (item: any) => item.id === itemId
    );
    
    if (itemIndex >= 0) {
      updatedChecklist[section].items[itemIndex].value = 
        !updatedChecklist[section].items[itemIndex].value;
    } else {
      // Include label when adding new item
      updatedChecklist[section].items.push({ id: itemId, label: itemLabel, value: true });
    }
    
    onChecklistChange(updatedChecklist);
  };

  // For Yes/No toggle (Phase 2)
  const handleYesNoToggle = (section: string, itemId: string, itemLabel: string, yesOrNo: 'yes' | 'no') => {
    const updatedChecklist = { ...checklist };
    if (!updatedChecklist[section]) {
      updatedChecklist[section] = { items: [] };
    }
    const itemIndex = updatedChecklist[section].items.findIndex(
      (item: any) => item.id === itemId
    );
    
    const newValue = yesOrNo === 'yes';
    
    if (itemIndex >= 0) {
      updatedChecklist[section].items[itemIndex].value = newValue;
    } else {
      updatedChecklist[section].items.push({ id: itemId, label: itemLabel, value: newValue });
    }
    
    onChecklistChange(updatedChecklist);
  };

  const handleAdditionalFieldChange = (section: string, fieldId: string, value: string) => {
    const updatedChecklist = { ...checklist };
    if (!updatedChecklist[section]) {
      updatedChecklist[section] = { items: [], additional_fields: {} };
    }
    if (!updatedChecklist[section].additional_fields) {
      updatedChecklist[section].additional_fields = {};
    }
    updatedChecklist[section].additional_fields[fieldId] = value;
    onChecklistChange(updatedChecklist);
  };

  const getCheckboxValue = (section: string, itemId: string): boolean => {
    if (!checklist[section] || !checklist[section].items) return false;
    const item = checklist[section].items.find((i: any) => i.id === itemId);
    return item?.value || false;
  };

  const getYesNoValue = (section: string, itemId: string): 'yes' | 'no' | null => {
    if (!checklist[section] || !checklist[section].items) return null;
    const item = checklist[section].items.find((i: any) => i.id === itemId);
    if (item === undefined) return null;
    return item.value === true ? 'yes' : 'no';
  };

  const getAdditionalFieldValue = (section: string, fieldId: string): string => {
    if (!checklist[section] || !checklist[section].additional_fields) return '';
    return checklist[section].additional_fields[fieldId] || '';
  };

  // Render simple checkbox (for Phase 1)
  const renderCheckboxSection = (sectionKey: string, sectionData: any) => {
    return (
      <View key={sectionKey} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionData.title}</Text>
        
        {sectionData.items.map((item: any) => {
          const isChecked = getCheckboxValue(sectionKey, item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.checkboxRow}
              onPress={() => handleCheckboxToggle(sectionKey, item.id, item.label)}
            >
              <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                {isChecked && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
              <Text style={styles.checkboxLabel}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}

        {sectionData.additionalFields?.map((field: any) => (
          <View key={field.id} style={styles.additionalField}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <TextInput
              style={styles.textInput}
              value={getAdditionalFieldValue(sectionKey, field.id)}
              onChangeText={(value) => handleAdditionalFieldChange(sectionKey, field.id, value)}
              multiline
              placeholder={`Enter ${field.label.toLowerCase()}`}
            />
          </View>
        ))}
      </View>
    );
  };

  // Render Yes/No section (for Phase 2)
  const renderYesNoSection = (sectionKey: string, sectionData: any) => {
    return (
      <View key={sectionKey} style={styles.section}>
        <View style={styles.yesNoHeader}>
          <Text style={styles.sectionTitle}>{sectionData.title}</Text>
          <View style={styles.yesNoLabels}>
            <Text style={styles.yesNoLabelText}>Yes</Text>
            <Text style={styles.yesNoLabelText}>No</Text>
          </View>
        </View>
        
        {sectionData.items.map((item: any, index: number) => {
          const value = getYesNoValue(sectionKey, item.id);
          return (
            <View key={item.id} style={styles.yesNoRow}>
              <Text style={styles.yesNoItemLabel}>{index + 1}. {item.label}</Text>
              <View style={styles.yesNoButtons}>
                <TouchableOpacity
                  style={[
                    styles.yesNoButton,
                    value === 'yes' && styles.yesButtonActive,
                  ]}
                  onPress={() => handleYesNoToggle(sectionKey, item.id, item.label, 'yes')}
                >
                  <View style={[
                    styles.radioOuter,
                    value === 'yes' && styles.radioOuterActive,
                  ]}>
                    {value === 'yes' && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.yesNoButton,
                    value === 'no' && styles.noButtonActive,
                  ]}
                  onPress={() => handleYesNoToggle(sectionKey, item.id, item.label, 'no')}
                >
                  <View style={[
                    styles.radioOuter,
                    value === 'no' && styles.radioOuterNoActive,
                  ]}>
                    {value === 'no' && <View style={styles.radioInnerNo} />}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSection = (sectionKey: string, sectionData: any) => {
    if (sectionData.type === 'yes_no') {
      return renderYesNoSection(sectionKey, sectionData);
    }
    return renderCheckboxSection(sectionKey, sectionData);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.mainTitle}>Implant Standard Operating Protocol Checklist</Text>
      
      {(!phase || phase === 1) && renderSection('pre_surgical', CHECKLIST_DATA.pre_surgical)}
      {(!phase || phase === 2) && renderSection('surgical', CHECKLIST_DATA.surgical)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
    textDecorationLine: 'underline',
  },
  // Checkbox styles (Phase 1)
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#DDD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
  },
  // Yes/No styles (Phase 2)
  yesNoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  yesNoLabels: {
    flexDirection: 'row',
    gap: 24,
    paddingRight: 8,
  },
  yesNoLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    width: 32,
    textAlign: 'center',
  },
  yesNoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  yesNoItemLabel: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
    paddingRight: 8,
  },
  yesNoButtons: {
    flexDirection: 'row',
    gap: 24,
  },
  yesNoButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yesButtonActive: {
    // Optional: add background highlight
  },
  noButtonActive: {
    // Optional: add background highlight
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#DDD',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  radioOuterActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  radioOuterNoActive: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
  },
  radioInnerNo: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#F44336',
  },
  // Additional fields
  additionalField: {
    marginTop: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#F9F9F9',
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
