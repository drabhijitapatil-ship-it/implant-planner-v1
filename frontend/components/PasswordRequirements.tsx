import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  password: string;
  /** Full name (e.g. "chiefDentistName" / "inchargeName" / logged-in user's
   *  name) used for the "don't use first or last name" check. Omit on
   *  screens with no name context (e.g. forgot-password) — that requirement
   *  then shows as satisfied by default. */
  fullName?: string;
};

export function checkPasswordRequirements(password: string, fullName?: string) {
  const nameTokens = (fullName || '')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
  const lower = password.toLowerCase();

  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    noName: nameTokens.length === 0 || !nameTokens.some((t) => lower.includes(t)),
  };
}

export function isPasswordValid(password: string, fullName?: string) {
  const r = checkPasswordRequirements(password, fullName);
  return r.length && r.uppercase && r.lowercase && r.number && r.special && r.noName;
}

const TIERS = [
  { label: 'Weak Password', color: '#DC3545' },
  { label: 'Medium Password', color: '#F59E0B' },
  { label: 'Strong Password', color: '#059669' },
];

export default function PasswordRequirements({ password, fullName }: Props) {
  const r = checkPasswordRequirements(password, fullName);
  const metCount = Object.values(r).filter(Boolean).length;
  const tierIndex = metCount <= 2 ? 0 : metCount <= 4 ? 1 : 2;
  const tier = TIERS[tierIndex];

  const items: Array<[boolean, string]> = [
    [r.length, 'At least 8 characters'],
    [r.uppercase, 'At least 1 uppercase'],
    [r.lowercase, 'At least 1 lowercase'],
    [r.number, 'At least 1 number'],
    [r.noName, "Don't use First or Last Name"],
    [r.special, 'At least 1 special character'],
  ];

  if (!password) return null;

  return (
    <View style={s.wrap}>
      <View style={s.strengthRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[s.bar, { backgroundColor: i <= tierIndex ? tier.color : '#E2E8F0' }]}
          />
        ))}
        <Text style={[s.strengthLabel, { color: tier.color }]}>{tier.label}</Text>
      </View>

      <Text style={s.heading}>PASSWORD REQUIREMENTS</Text>
      <View style={s.grid}>
        {items.map(([met, label]) => (
          <View key={label} style={s.item}>
            <View style={[s.check, met && s.checkMet]}>
              {met ? <Ionicons name="checkmark" size={12} color="#FFF" /> : null}
            </View>
            <Text style={s.itemText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    marginBottom: 10,
    paddingRight: 6,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkMet: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  itemText: {
    fontSize: 12.5,
    color: '#334155',
    flexShrink: 1,
  },
});
