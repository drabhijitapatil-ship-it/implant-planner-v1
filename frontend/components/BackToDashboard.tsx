import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
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
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={handlePress}>
        <Ionicons name="home" size={18} color="#FFF" />
        <Text style={styles.backButtonText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    zIndex: 999,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#DC3545',
    borderRadius: 25,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  backButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
});
