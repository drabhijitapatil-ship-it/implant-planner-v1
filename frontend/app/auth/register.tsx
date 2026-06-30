import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const OPTIONS = [
  {
    route: "/auth/register-college",
    icon: "school-outline" as const,
    title: "Dental College",
    description: "Set up a workspace for your institution. Manage supervisors, postgrad students, and cases under one roof.",
    tag: "For institutions",
    tagColor: "#1565C0",
    tagBg: "#E3F2FD",
    iconBg: "#EBF4FF",
    iconColor: "#1565C0",
    borderColor: "#BBDEFB",
  },
  {
    route: "/auth/register-clinic",
    icon: "medkit-outline" as const,
    title: "Dental Clinic",
    description: "Set up a workspace for your private practice. Plan implant cases and manage clinical workflows.",
    tag: "For practitioners",
    tagColor: "#2E7D32",
    tagBg: "#E8F5E9",
    iconBg: "#E8F5E9",
    iconColor: "#2E7D32",
    borderColor: "#C8E6C9",
  },
];

export default function RegisterScreen() {
  const router = useRouter();

  return (
    <LinearGradient colors={["#F4F9FD", "#EBF4FC", "#D6E9FA"]} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1565C0" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Choose your workspace type to get started with Implanr</Text>
          </View>

          <View style={styles.cards}>
            {OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.route}
                style={[styles.card, { borderColor: opt.borderColor }]}
                onPress={() => router.push(opt.route as any)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, { backgroundColor: opt.iconBg }]}>
                    <Ionicons name={opt.icon} size={32} color={opt.iconColor} />
                  </View>
                  <View style={[styles.tag, { backgroundColor: opt.tagBg }]}>
                    <Text style={[styles.tagText, { color: opt.tagColor }]}>{opt.tag}</Text>
                  </View>
                </View>

                <Text style={styles.cardTitle}>{opt.title}</Text>
                <Text style={styles.cardDesc}>{opt.description}</Text>

                <View style={styles.cardFooter}>
                  <Text style={[styles.selectText, { color: opt.iconColor }]}>Get started</Text>
                  <Ionicons name="arrow-forward" size={16} color={opt.iconColor} />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.loginRow} onPress={() => router.replace("/auth/login")}>
            <Text style={styles.loginText}>
              Already have an account?{" "}
              <Text style={styles.loginLink}>Sign In</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  backBtn: { marginBottom: 20 },
  header: { marginBottom: 28 },
  title: { fontSize: 28, fontWeight: "800", color: "#0A2540", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#64748B", lineHeight: 22 },
  cards: { gap: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1.5,
    shadowColor: "#0A2540",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  tag: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  tagText: { fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 19, fontWeight: "800", color: "#0A2540", marginBottom: 8 },
  cardDesc: { fontSize: 14, color: "#64748B", lineHeight: 21, marginBottom: 18 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectText: { fontSize: 14, fontWeight: "700" },
  loginRow: { alignItems: "center", marginTop: 36 },
  loginText: { fontSize: 14, color: "#64748B" },
  loginLink: { color: "#007AFF", fontWeight: "700" },
});
