import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface BackToDashboardProps {
  label?: string;
  floating?: boolean;
}

export default function BackToDashboard({ label = 'Dashboard', floating = true }: BackToDashboardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push('/(tabs)/dashboard');
  };

  const button = (
    <TouchableOpacity style={styles.backButton} onPress={handlePress} data-testid="back-to-dashboard-btn">
      <Ionicons name="home" size={18} color="#FFF" />
      <Text style={styles.backButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  if (floating) {
    return <View style={styles.floatingContainer}>{button}</View>;
  }

  return button;
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    zIndex: 999,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  backButtonText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
});
