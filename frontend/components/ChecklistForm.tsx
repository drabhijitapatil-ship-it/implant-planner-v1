import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHECKLIST_DATA } from '../constants/checklist';

interface ChecklistFormProps {
  checklist: any;
  onChecklistChange: (checklist: any) => void;
  phase?: 1 | 2;  // Optional: which phase to show (1=pre-surgical only, 2=surgical only)
}

export default function ChecklistForm({ checklist, onChecklistChange, phase }: ChecklistFormProps) {
  const handleCheckboxToggle = (section: string, itemId: string) => {
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
      updatedChecklist[section].items.push({ id: itemId, value: true });
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

  const getAdditionalFieldValue = (section: string, fieldId: string): string => {
    if (!checklist[section] || !checklist[section].additional_fields) return '';
    return checklist[section].additional_fields[fieldId] || '';
  };

  const renderChecklistSection = (sectionKey: string, sectionData: any) => {
    return (
      <View key={sectionKey} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionData.title}</Text>
        
        {sectionData.items.map((item: any) => {
          const isChecked = getCheckboxValue(sectionKey, item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.checkboxRow}
              onPress={() => handleCheckboxToggle(sectionKey, item.id)}
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

  return (
    <View style={styles.container}>
      <Text style={styles.mainTitle}>Implant Standard Operating Protocol Checklist</Text>
      
      {(!phase || phase === 1) && renderChecklistSection('pre_surgical', CHECKLIST_DATA.pre_surgical)}
      {(!phase || phase === 2) && renderChecklistSection('surgical', CHECKLIST_DATA.surgical)}
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
  },
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
