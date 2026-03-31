import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
  Pressable,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  // Animations
  const logoAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(logoAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const logoScale = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const logoOpacity = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  const handlePressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password.trim());
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      const detail = error.message || 'Unknown error';
      const status = error.response?.status || 'no status';
      const respData = JSON.stringify(error.response?.data || {});
      Alert.alert('Login Failed', `${detail}\n\nStatus: ${status}\nIdentifier: "${email.trim()}" (len=${email.trim().length})\nResp: ${respData.substring(0, 100)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#0A84FF', '#3BA4FF', '#A7D8FF']} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Glow Layer */}
            <View style={styles.glow} />

            {/* Logo Badge */}
            <View style={styles.logoBadge}>
              <Animated.Image
                source={require('../../assets/images/app-logo.jpg')}
                style={[styles.logo, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}
                resizeMode="contain"
                data-testid="hero-image"
              />
            </View>

            {/* Branding */}
            <Text style={styles.appName} data-testid="app-title">Implanr</Text>
            <Text style={styles.tagline}>Implant Planning Assistant</Text>

            <View style={styles.features}>
              <Text style={styles.feature}>Plan</Text>
              <Text style={styles.featureDot}>&bull;</Text>
              <Text style={styles.feature}>Visualize</Text>
              <Text style={styles.featureDot}>&bull;</Text>
              <Text style={styles.feature}>Restore</Text>
            </View>

            {/* Glass Card */}
            <BlurView intensity={60} tint="light" style={styles.card}>
              {/* Email */}
              <TextInput
                placeholder="Login ID (e.g. Name.surname@dental.edu)"
                placeholderTextColor="#888"
                value={email}
                onChangeText={setEmail}
                style={[styles.input, emailFocus && styles.inputActive]}
                onFocus={() => setEmailFocus(true)}
                onBlur={() => setEmailFocus(false)}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                data-testid="login-email-input"
              />

              {/* Password */}
              <TextInput
                placeholder="Password"
                secureTextEntry
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                style={[styles.input, passwordFocus && styles.inputActive]}
                onFocus={() => setPasswordFocus(true)}
                onBlur={() => setPasswordFocus(false)}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="password"
                data-testid="login-password-input"
              />

              {/* Forgot Password */}
              <TouchableOpacity style={styles.forgotBtn} data-testid="forgot-password-link">
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Login Button */}
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <Pressable
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  onPress={handleLogin}
                  disabled={loading}
                  style={[styles.loginButton, loading && styles.buttonDisabled]}
                  data-testid="login-submit-btn"
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.loginText}>Login</Text>
                  )}
                </Pressable>
              </Animated.View>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Sign Up */}
              <TouchableOpacity
                onPress={() => router.push('/auth/register')}
                disabled={loading}
                data-testid="register-link"
              >
                <Text style={styles.signup}>
                  Don't have an account? <Text style={styles.signupLink}>Sign Up</Text>
                </Text>
              </TouchableOpacity>
            </BlurView>



          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    backgroundColor: '#5AC8FA',
    borderRadius: 150,
    opacity: 0.2,
    top: 60,
  },
  logoBadge: {
    width: 150,
    height: 150,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: {
    width: 110,
    height: 110,
  },
  appName: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: '#EAF6FF',
    marginBottom: 8,
    textAlign: 'center',
  },
  features: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  feature: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  featureDot: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  card: {
    width: '100%',
    borderRadius: 25,
    padding: 22,
    overflow: 'hidden',
  },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 15,
    color: '#263238',
  },
  inputActive: {
    borderWidth: 1.5,
    borderColor: '#0A84FF',
    backgroundColor: '#fff',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotText: {
    fontSize: 13,
    color: '#0A84FF',
    fontWeight: '500',
  },
  loginButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A84FF',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  dividerText: {
    color: '#777',
    fontSize: 12,
    fontWeight: '600',
  },
  signup: {
    textAlign: 'center',
    color: '#555',
    fontSize: 14,
  },
  signupLink: {
    color: '#0A84FF',
    fontWeight: '700',
  },
});
