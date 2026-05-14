/**
 * iter-228: Shared radiograph thumbnail (extracted from ExistingImplantSection).
 *
 * Async-resolves an authenticated upload URL, then renders a 56×56 image
 * preview (or document icon for PDFs) + "Tap to view" affordance. Tapping
 * opens the file in a new browser tab on web, or hands off to React Native
 * Linking on native.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuthFileUrl } from '../utils/api';

type Props = {
  filename: string;
  testID?: string;
  /** Optional label shown above the filename row (e.g. "OPG / CBCT"). */
  label?: string;
};

export default function RadiographThumb({ filename, testID, label }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAuthFileUrl(filename).then(u => { if (!cancelled) setUri(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [filename]);
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const open = async () => {
    if (!uri) return;
    if (Platform.OS === 'web') window.open(uri, '_blank');
    else {
      try {
        const { Linking } = await import('react-native');
        await Linking.openURL(uri);
      } catch { /* noop */ }
    }
  };
  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 10, backgroundColor: '#F1F8E9', borderRadius: 10, borderWidth: 1, borderColor: '#C5E1A5' }}
      testID={testID}
      /* @ts-ignore */ data-testid={testID}
    >
      {isPdf || !uri ? (
        <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#A5D6A7', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isPdf ? 'document-text' : 'image-outline'} size={28} color="#2E7D32" />
        </View>
      ) : (
        <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF' }} />
      )}
      <View style={{ flex: 1 }}>
        {label ? <Text style={{ fontSize: 11, fontWeight: '800', color: '#33691E', letterSpacing: 0.3, marginBottom: 1 }} numberOfLines={1}>{label}</Text> : null}
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B5E20' }} numberOfLines={1}>✓ Uploaded</Text>
        <Text style={{ fontSize: 11, color: '#558B2F' }} numberOfLines={1}>{filename}</Text>
        <Text style={{ fontSize: 11, color: '#1565C0', fontWeight: '700', marginTop: 2 }}>Tap to view</Text>
      </View>
      <Ionicons name="open-outline" size={20} color="#1565C0" />
    </TouchableOpacity>
  );
}
