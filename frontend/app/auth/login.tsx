import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ONBOARDING_VERSION } from "../../components/onboarding/content/onboardingContent";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const { login, refreshUser } = useAuth();
  const router = useRouter();

  const logoAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(logoAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handleLogin = async () => {
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    let hasError = false;

    if (!email) {
      setEmailError("Email address is required");
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setEmailError("Please enter a valid email address");
        hasError = true;
      }
    }

    if (!password) {
      setPasswordError("Password is required");
      hasError = true;
    }

    if (hasError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      await login(email.trim(), password.trim());
      const me = await refreshUser();
      const seenVersion = (me as any)?.workflow_seen_version || 0;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      if (!me?.workflow_seen_at || seenVersion < ONBOARDING_VERSION) {
        router.replace("/onboarding");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        error.message ||
        "Authentication failed. Please try again.";
      setGeneralError(
        typeof detail === "string" ? detail : JSON.stringify(detail),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#F4F9FD", "#EBF4FC", "#D6E9FA"]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.innerContainer}>
              <View style={styles.bgWaveBottom} />

              <Image
                source={require("../../assets/images/icon_2.png")}
                style={styles.logo}
                resizeMode="contain"
                data-testid="hero-image"
              />

              <Text style={styles.appName} data-testid="app-title">
                Implanr
              </Text>
              <Text style={styles.tagline}>Implant Planning Assistant</Text>

              <View style={styles.features}>
                <Text style={styles.feature}>Plan</Text>
                <Text style={styles.featureDot}>&bull;</Text>
                <Text style={styles.feature}>Visualize</Text>
                <Text style={styles.featureDot}>&bull;</Text>
                <Text style={styles.feature}>Restore</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.welcomeText}>Welcome Back</Text>
                <Text style={styles.welcomeSubtext}>
                  Sign in to continue planning with confidence.
                </Text>

                {generalError && (
                  <View style={styles.errorBanner}>
                    <Ionicons
                      name="alert-circle"
                      size={20}
                      color="#FF3B30"
                      style={styles.errorBannerIcon}
                    />
                    <Text style={styles.errorBannerText}>{generalError}</Text>
                  </View>
                )}

                {/* Email */}
                <Pressable
                  onPress={() => emailInputRef.current?.focus()}
                  style={[
                    styles.inputContainer,
                    emailFocus && styles.inputContainerActive,
                    emailError ? styles.inputContainerError : null,
                  ]}
                >
                  <View style={styles.iconBox} pointerEvents="none">
                    <Ionicons
                      name="person-outline"
                      size={22}
                      color={
                        emailFocus
                          ? "#007AFF"
                          : emailError
                            ? "#FF3B30"
                            : "#4A5568"
                      }
                    />
                  </View>
                  <View style={styles.textInputWrapper}>
                    <Text
                      pointerEvents="none"
                      style={[
                        styles.inputLabel,
                        emailFocus && styles.inputLabelActive,
                        emailError ? styles.inputLabelError : null,
                      ]}
                    >
                      Login ID
                    </Text>
                    <TextInput
                      ref={emailInputRef}
                      placeholder="e.g. Name.surname@dental.edu"
                      placeholderTextColor="#94A3B8"
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        if (emailError) setEmailError(null);
                        if (generalError) setGeneralError(null);
                      }}
                      style={styles.inputField}
                      onFocus={() => {
                        setEmailFocus(true);
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light,
                        ).catch(() => {});
                      }}
                      onBlur={() => setEmailFocus(false)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      data-testid="login-email-input"
                    />
                  </View>
                </Pressable>
                {emailError && (
                  <Text style={styles.fieldErrorText}>{emailError}</Text>
                )}

                {/* Password */}
                <Pressable
                  onPress={() => passwordInputRef.current?.focus()}
                  style={[
                    styles.inputContainer,
                    styles.passwordSpacing,
                    passwordFocus && styles.inputContainerActive,
                    passwordError ? styles.inputContainerError : null,
                  ]}
                >
                  <View style={styles.iconBox} pointerEvents="none">
                    <Ionicons
                      name="lock-closed-outline"
                      size={22}
                      color={
                        passwordFocus
                          ? "#007AFF"
                          : passwordError
                            ? "#FF3B30"
                            : "#4A5568"
                      }
                    />
                  </View>
                  <View style={styles.textInputWrapper}>
                    <Text
                      pointerEvents="none"
                      style={[
                        styles.inputLabel,
                        passwordFocus && styles.inputLabelActive,
                        passwordError ? styles.inputLabelError : null,
                      ]}
                    >
                      Password
                    </Text>
                    <TextInput
                      ref={passwordInputRef}
                      placeholder="Enter password"
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#94A3B8"
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        if (passwordError) setPasswordError(null);
                        if (generalError) setGeneralError(null);
                      }}
                      style={styles.inputField}
                      onFocus={() => {
                        setPasswordFocus(true);
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light,
                        ).catch(() => {});
                      }}
                      onBlur={() => setPasswordFocus(false)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="password"
                      data-testid="login-password-input"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPassword(!showPassword);
                      Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                    }}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </Pressable>
                {passwordError && (
                  <Text style={styles.fieldErrorText}>{passwordError}</Text>
                )}
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={() => router.push('/auth/forgot-password')}
                  data-testid="forgot-password-link"
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>

                <Animated.View
                  style={{ transform: [{ scale: buttonScale }], marginTop: 12 }}
                >
                  <Pressable
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onPress={handleLogin}
                    disabled={loading}
                    style={[
                      styles.loginButton,
                      loading && styles.buttonDisabled,
                    ]}
                    testID="login-submit-btn"
                    data-testid="login-submit-btn"
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <View style={styles.buttonContent}>
                        <Text style={styles.loginText}>Log In</Text>
                        <Ionicons
                          name="arrow-forward"
                          size={18}
                          color="#FFF"
                          style={styles.arrowIcon}
                        />
                      </View>
                    )}
                  </Pressable>
                </Animated.View>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  onPress={() => router.push("/auth/register")}
                  disabled={loading}
                  style={styles.registerButton}
                  data-testid="register-link"
                >
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color="#007AFF"
                    style={styles.registerIcon}
                  />
                  <Text style={styles.registerText}>Create Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  innerContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    width: "100%",
  },
  bgWaveBottom: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255, 255, 255, 0.52)",
    top: 220,
    left: -140,
  },
  logoBadge: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  logo: { width: 120, height: 120 },
  appName: {
    fontSize: 42,
    fontWeight: "700",
    color: "#0A2540",
    letterSpacing: 0.5,
    textAlign: "center",
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "500",
    color: "#7d8ca6ff",
    marginBottom: 8,
    textAlign: "center",
  },
  features: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 28,
  },
  feature: { color: "#0053a6ff", fontSize: 14, fontWeight: "700" },
  featureDot: { color: "rgba(0, 122, 255, 0.4)", fontSize: 14 },
  card: {
    width: "100%",
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0A2540",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.03)",
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0A2540",
    marginBottom: 4,
  },
  welcomeSubtext: { fontSize: 14, color: "#64748B", marginBottom: 20 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FF8A8A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerIcon: { marginRight: 8 },
  errorBannerText: {
    flex: 1,
    color: "#D32F2F",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 66,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
  },
  passwordSpacing: { marginTop: 16 },
  inputContainerActive: {
    borderColor: "#007AFF",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  inputContainerError: { borderColor: "#FF3B30" },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#EDF5FD",
    justifyContent: "center",
    alignItems: "center",
  },
  textInputWrapper: { flex: 1, paddingLeft: 12, justifyContent: "center" },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#718096",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  inputLabelActive: { color: "#007AFF" },
  inputLabelError: { color: "#FF3B30" },
  inputField: {
    fontSize: 15,
    color: "#0A2540",
    fontWeight: "500",
    height: 30,
    padding: 0,
  },
  eyeButton: { padding: 8 },
  fieldErrorText: {
    color: "#FF3B30",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    marginLeft: 12,
  },
  forgotBtn: { alignSelf: "flex-end", marginTop: 10, marginBottom: 18 },
  forgotText: { fontSize: 13, color: "#007AFF", fontWeight: "600" },
  loginButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 20,
  },
  arrowIcon: { position: "absolute", right: 20 },
  buttonDisabled: { opacity: 0.5 },
  loginText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#E2E8F0" },
  dividerText: { color: "#718096", fontSize: 12, fontWeight: "700" },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#007AFF",
    backgroundColor: "transparent",
  },
  registerIcon: { marginRight: 8 },
  registerText: { color: "#007AFF", fontSize: 16, fontWeight: "700" },
});
