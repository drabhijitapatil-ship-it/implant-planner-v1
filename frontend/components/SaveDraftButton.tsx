/**
 * Manual "Save Draft" pill for Phase 2/3/4 submission screens — pairs with
 * the autosave in utils/draftAutosave.ts so users have an explicit action
 * before navigating away, not just the periodic/background autosave.
 */
import React, { useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SaveDraftButton({ onSave }: { onSave: () => Promise<void> | void }) {
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const handlePress = async () => {
    setSaving(true);
    try {
      await onSave();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.row}>
      <TouchableOpacity
        style={s.btn}
        onPress={handlePress}
        disabled={saving}
        testID="save-draft-btn"
        // @ts-ignore RN-Web passthrough
        data-testid="save-draft-btn"
      >
        {saving ? (
          <ActivityIndicator size="small" color="#1565C0" />
        ) : (
          <Ionicons name="save-outline" size={15} color="#1565C0" />
        )}
        <Text style={s.btnText}>{saving ? 'Saving…' : 'Save Draft'}</Text>
      </TouchableOpacity>
      {justSaved && <Text style={s.savedText}>Draft saved</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E3F2FD', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: '#90CAF9',
  },
  btnText: { color: '#1565C0', fontWeight: '700', fontSize: 12 },
  savedText: { color: '#2E7D32', fontWeight: '700', fontSize: 12 },
});
