import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface BackToDashboardProps {
  label?: string;
}

export default function BackToDashboard({ label = 'Dashboard' }: BackToDashboardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push('/(tabs)/dashboard');
  };

  return (
    <TouchableOpacity style={styles.backButton} onPress={handlePress} data-testid="back-to-dashboard-btn">
      <Ionicons name="home" size={18} color="#FFF" />
      <Text style={styles.backButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#007AFF',
    borderRadius: 25,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  backButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
});
