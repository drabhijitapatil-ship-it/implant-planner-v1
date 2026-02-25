import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface BackToDashboardProps {
  label?: string;
}

export default function BackToDashboard({ label = 'Back to Dashboard' }: BackToDashboardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push('/(tabs)/dashboard');
  };

  return (
    <TouchableOpacity style={styles.backButton} onPress={handlePress}>
      <Ionicons name="arrow-back" size={24} color="#007AFF" />
      <Text style={styles.backButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
});
