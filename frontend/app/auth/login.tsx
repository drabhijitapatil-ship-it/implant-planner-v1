import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = Math.min(SCREEN_WIDTH * 0.55, 220);

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  // Animations
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Soft glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: false }),
      ])
    ).start();

    // Gentle scale breathing
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.02, duration: 3000, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.98, duration: 3000, useNativeDriver: true }),
      ])
    ).start();

    // Slow subtle rotation
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 1, duration: 6000, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 6000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-2deg', '2deg'],
  });

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#E3F2FD', '#F5FAFF', '#FFFFFF']} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              {/* Hero Image with Animations */}
              <View style={styles.imageContainer} data-testid="hero-image">
                <Animated.View style={[styles.glowOuter, { opacity: glowAnim }]} />
                <Animated.View
                  style={[
                    styles.imageWrapper,
                    { transform: [{ scale: scaleAnim }, { rotate: rotateInterpolate }] },
                  ]}
                >
                  <Image
                    source={require('../../assets/images/implant-hero.png')}
                    style={styles.heroImage}
                    resizeMode="contain"
                  />
                </Animated.View>
              </View>

              {/* App Title */}
              <Text style={styles.title} data-testid="app-title">My Implant Planner</Text>
              <Text style={styles.subtitle}>Digital Implant Planning Assistant</Text>

              {/* Tagline */}
              <Text style={styles.tagline}>Plan  &bull;  Visualize  &bull;  Restore</Text>

              {/* Login Form */}
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <View style={styles.inputIconBox}>
                    <Ionicons name="mail-outline" size={20} color="#1E88E5" />
                  </View>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email / Username"
                    placeholderTextColor="#90A4AE"
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    data-testid="login-email-input"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <View style={styles.inputIconBox}>
                    <Ionicons name="lock-closed-outline" size={20} color="#1E88E5" />
                  </View>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#90A4AE"
                    secureTextEntry
                    autoCapitalize="none"
                    data-testid="login-password-input"
                  />
                </View>

                <TouchableOpacity
                  style={styles.forgotBtn}
                  data-testid="forgot-password-link"
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.loginBtnWrap, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                  data-testid="login-submit-btn"
                >
                  <LinearGradient
                    colors={['#1E88E5', '#42A5F5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.loginBtn}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.loginBtnText}>LOGIN</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.createAccountBtn}
                  onPress={() => router.push('/auth/register')}
                  disabled={loading}
                  data-testid="register-link"
                >
                  <Text style={styles.createAccountText}>
                    Don't have an account? <Text style={styles.createAccountLink}>Create Account</Text>
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerPowered}>Powered by</Text>
                <Text style={styles.footerCollege}>Bharati Vidyapeeth Dental College</Text>
                <Text style={styles.footerDept}>Department of Prosthodontics</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  // --- Image ---
  imageContainer: {
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  glowOuter: {
    position: 'absolute',
    width: IMAGE_SIZE * 1.1,
    height: IMAGE_SIZE * 1.1,
    borderRadius: IMAGE_SIZE * 0.55,
    backgroundColor: '#42A5F5',
    top: -(IMAGE_SIZE * 0.05),
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    backgroundColor: '#FFFFFF',
    borderRadius: IMAGE_SIZE / 2,
    padding: 10,
    shadowColor: '#1E88E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImage: {
    width: '95%',
    height: '95%',
  },
  // --- Title / Subtitle ---
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1E88E5',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  subtitle: {
    fontSize: 16,
    color: '#42A5F5',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '400',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    color: '#546E7A',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
  // --- Form ---
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D7DE',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
    overflow: 'hidden',
  },
  inputIconBox: {
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 14,
    fontSize: 15,
    color: '#263238',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  forgotText: {
    fontSize: 13,
    color: '#1E88E5',
    fontWeight: '500',
  },
  // --- Login Button ---
  loginBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  loginBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  // --- Create Account ---
  createAccountBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  createAccountText: {
    fontSize: 13,
    color: '#546E7A',
  },
  createAccountLink: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  // --- Footer ---
  footer: {
    marginTop: 28,
    alignItems: 'center',
  },
  footerPowered: {
    fontSize: 11,
    color: '#90A4AE',
    marginBottom: 2,
  },
  footerCollege: {
    fontSize: 12,
    color: '#546E7A',
    fontWeight: '500',
  },
  footerDept: {
    fontSize: 11,
    color: '#78909C',
  },
});
