import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import ScrollView from "@/components/KeyboardAwareScrollView";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import api from "../../utils/api";

// "Request access" — replaces self-service registration on iOS (see
// utils/storePolicy). Sends the details to the Implanr team, who contact the
// institution and set up its workspace. No account, trial or pricing here.

type Kind = "college" | "clinic";

const SIZES: Record<Kind, string[]> = {
  college: ["Up to 9 PGs", "10–12 PGs", "13–18 PGs", "19–24 PGs", "More than 24"],
  clinic: ["1–3 users", "4–10 users", "11–25 users", "26–50 users", "More than 50"],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RequestAccessScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("college");
  const [institution, setInstitution] = useState("");
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (institution.trim().length < 2) return setError(`Please enter the ${kind === "college" ? "college" : "clinic"} name.`);
    if (city.trim().length < 2) return setError("Please enter the city.");
    if (name.trim().length < 2) return setError("Please enter your full name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Please enter a valid phone number.");
    setSubmitting(true);
    try {
      await api.post("/access-requests", {
        institution_type: kind,
        institution_name: institution.trim(),
        city: city.trim(),
        name: name.trim(),
        designation: designation.trim() || null,
        email: email.trim(),
        phone: phone.trim(),
        team_size: size,
        message: message.trim() || null,
        platform: Platform.OS,
      });
      setDone(true);
    } catch (e: any) {
      const status = e?.response?.status;
      setError(
        status === 429
          ? "Too many requests from this device. Please try again later."
          : e?.response?.data?.detail && typeof e.response.data.detail === "string"
            ? e.response.data.detail
            : "Could not send your request. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <LinearGradient colors={["#F4F9FD", "#EBF4FC", "#D6E9FA"]} style={styles.container}>
        <SafeAreaView style={[styles.container, styles.doneWrap]}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={40} color="#FFF" />
          </View>
          <Text style={styles.title}>Request received</Text>
          <Text style={[styles.subtitle, { textAlign: "center" }]}>
            Thank you, {name.trim().split(" ")[0]}. Our team will contact you at {email.trim()} to set up{" "}
            {institution.trim()} on Implanr. Once your workspace is ready, you and your team can sign in here.
          </Text>
          <TouchableOpacity style={styles.submitBtn} onPress={() => router.replace("/auth/login")} testID="request-access-done">
            <Text style={styles.submitText}>Back to Sign In</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#F4F9FD", "#EBF4FC", "#D6E9FA"]} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1565C0" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Request Access</Text>
            <Text style={styles.subtitle}>
              Implanr is set up for each dental college and clinic by our team. Share your details and we'll get in touch.
            </Text>
          </View>

          <Text style={styles.label}>I am requesting for a</Text>
          <View style={styles.kindRow}>
            {(["college", "clinic"] as Kind[]).map((k) => {
              const active = kind === k;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.kindBtn, active && styles.kindBtnActive]}
                  onPress={() => { setKind(k); setSize(null); }}
                  testID={`request-access-kind-${k}`}
                >
                  <Ionicons name={k === "college" ? "school-outline" : "medkit-outline"} size={18} color={active ? "#FFF" : "#1565C0"} />
                  <Text style={[styles.kindText, active && { color: "#FFF" }]}>
                    {k === "college" ? "Dental College" : "Dental Clinic"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Field label={kind === "college" ? "College name" : "Clinic name"} value={institution} onChangeText={setInstitution}
            placeholder={kind === "college" ? "e.g. ABC Dental College & Hospital" : "e.g. Smile Dental Clinic"} />
          <Field label="City" value={city} onChangeText={setCity} placeholder="e.g. Pune" />
          <Field label="Your full name" value={name} onChangeText={setName} placeholder="e.g. Dr. Priya Sharma" autoCapitalize="words" />
          <Field label="Designation (optional)" value={designation} onChangeText={setDesignation}
            placeholder={kind === "college" ? "e.g. HOD, Prosthodontics" : "e.g. Clinic owner"} />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com"
            keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Field label="Phone / WhatsApp" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210"
            keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />

          <Text style={styles.label}>{kind === "college" ? "PG students in the department (optional)" : "Team size (optional)"}</Text>
          <View style={styles.chips}>
            {SIZES[kind].map((opt) => (
              <TouchableOpacity key={opt} style={[styles.chip, size === opt && styles.chipActive]} onPress={() => setSize(size === opt ? null : opt)}>
                <Text style={[styles.chipText, size === opt && { color: "#FFF" }]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="Anything else? (optional)" value={message} onChangeText={setMessage}
            placeholder="Departments, number of chairs, preferred time to call…" multiline />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.7 }]} onPress={submit} disabled={submitting} testID="request-access-submit">
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Send Request</Text>}
          </TouchableOpacity>

          <Text style={styles.footNote}>Already have an account from your institution? Go back and sign in.</Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 84, textAlignVertical: "top" }, style]}
        placeholderTextColor="#90A4AE"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "800", color: "#0D2B4E", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#546E7A", lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "600", color: "#37474F", marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#CFD8DC", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1A1A1A" },
  kindRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  kindBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: "#BBDEFB", backgroundColor: "#FFF" },
  kindBtnActive: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  kindText: { fontSize: 14, fontWeight: "700", color: "#1565C0" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: "#BBDEFB", backgroundColor: "#FFF" },
  chipActive: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  chipText: { fontSize: 13, color: "#1565C0", fontWeight: "600" },
  error: { color: "#C62828", fontSize: 13, marginBottom: 10 },
  submitBtn: { backgroundColor: "#1565C0", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4, alignSelf: "stretch" },
  submitText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  footNote: { fontSize: 12, color: "#78909C", textAlign: "center", marginTop: 14 },
  doneWrap: { alignItems: "center", justifyContent: "center", padding: 24 },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#2E7D32", alignItems: "center", justifyContent: "center", marginBottom: 18 },
});
