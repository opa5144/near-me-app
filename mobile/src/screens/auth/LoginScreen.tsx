import { useState, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Alert} from 'react-native';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppTextInput } from '../../components/AppTextInput';
import axios from 'axios';
import { loginUser } from '../../api/client';

const fields = [
  { key: 'email', label: 'Email' },
  { key: 'password', label: 'Password' },
] as const;

type LoginScreenProps = {
  onLogin: () => void;
  onNavigateToSignup: () => void;
};

export function LoginScreen({ onLogin, onNavigateToSignup }: LoginScreenProps) {
  const { colors } = useTheme();
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [isLoggingIn, setIsLoggingIn] = useState(false);//updates the UI
  const loginInFlight = useRef(false);//when in flight it stops retyping

  async function handleLogin() {
    // Send credentials to auth endpoint.
    if(loginInFlight.current) return; // Prevent multiple submissions
    if(!form.email.trim() || !form.password) {
      Alert.alert('Missing details', 'Please fill in all fields.');
      return;
    } // Basic validation to ensure all fields are filled

    loginInFlight.current = true;
    setIsLoggingIn(true);

    try{
      await loginUser(form); //sends form to backend
    } catch (error){
      let message = 'Unable to login. Please try again later.';
      if(axios.isAxiosError<{message?: string}>(error)){
        const serverMessage = error.response?.data?.message;
        if(typeof serverMessage === 'string'){
          message = serverMessage;
        } else if (!error.response){
          message = 'no response from server. Please check your internet connection.';
        }
      }

      Alert.alert('Login Failed', message);
      return; 
    } finally { // Reset the in-flight state regardless of success or failure
      loginInFlight.current = false;
      setIsLoggingIn(false);
    }
    onLogin(); //opens app after successful login
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Login" subtitle="Login to your account." />

      {fields.map(({ key, label }) => (//renders input fields for each field in the form
        <AppTextInput
          key={key}
          label={label}
          value={form[key]}
          onChangeText={value =>
            setForm(current => ({ ...current, [key]: value }))
          }
          autoCapitalize="none"
          keyboardType={key === 'email' ? 'email-address' : 'default'}
          isPassword={key === 'password'}
          editable={!isLoggingIn}
          autoComplete={key === 'password' ? 'current-password': 'email'}
        />
      ))}

      <AppButton
        title={isLoggingIn ? 'Logging in...' : 'Login'}
        onPress={handleLogin}
        disabled={isLoggingIn || !form.email.trim() || !form.password}
      />

      {/* Link to switch to Signup Screen */}
      <Pressable
        onPress={onNavigateToSignup}
        accessibilityRole="link"
        style={styles.link}
        disabled={isLoggingIn}
      >
        <Text style={[styles.linkText, { color: colors.primary }]}>
          Don't have an account? Sign up
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  field: { marginBottom: 16 },
  link: { alignItems: 'center', paddingVertical: 16 },
  linkText: { textDecorationLine: 'underline', fontSize: 14 },
});