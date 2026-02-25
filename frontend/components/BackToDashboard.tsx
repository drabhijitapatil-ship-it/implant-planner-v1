import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
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
      <Ionicons name="arrow-back-circle" size={28} color="#FFF" />
      <Text style={styles.backButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: '#DC3545',
    borderBottomWidth: 0,
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '700',
  },
});
