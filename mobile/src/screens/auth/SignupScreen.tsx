import { useState,useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppTextInput } from '../../components/AppTextInput';
import axios from 'axios';
import {signupUser} from '../../api/client';

const fields = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'username', label: 'Username' },
  { key: 'email', label: 'Email' },
  { key: 'password', label: 'Password' },
] as const;

type SignupScreenProps = {
  onBackToLogin: () => void;
};

export function SignupScreen({ onBackToLogin }: SignupScreenProps) {
  const { colors } = useTheme();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);//updates the UI
  const signupInFlight = useRef(false);//when in flight it stops retyping

  async function handleSignup() {
    //Validate and send the form to your backend signup endpoint.
    if (signupInFlight.current) return; // Prevent multiple submissions

    if(!form.firstName.trim() || !form.lastName.trim() || !form.username.trim() || !form.email.trim() || !form.password) {
      Alert.alert('Missing details', 'Please fill in all fields.');
      return;
    } // Basic validation to ensure all fields are filled

    const passwordLength = Array.from(form.password).length;
    if(passwordLength < 15 || passwordLength > 128){
      Alert.alert('Password', 'Password must be between 15 and 128 characters.');
      return;
    }// Password length validation, matches backend validation 

    signupInFlight.current = true;
    setIsSubmitting(true);
    
    try{ //sends form to backend 
      const result = await signupUser(form);
      Alert.alert(
        'Account created',
        result.message,
        [{text: 'Back to Login', onPress: onBackToLogin}],
        {cancelable: false},
      );
    } catch (error){ //catches account creation errors  
      let message = 'Unable to create account. Please try again.';
      if(axios.isAxiosError<{message?: string}>(error)){
        const serverMessage = error.response?.data?.message; 
        if(typeof serverMessage === 'string'){
          message = serverMessage;
        } else if (!error.response){
          message = 'No response from server. Check connection.';
        }
      }
      Alert.alert('Signup failed', message); 
    } finally{ //reset state after submission attempt
      signupInFlight.current = false;
      setIsSubmitting(false);
    }

  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Sign up" subtitle="Create your account." />

      {fields.map(({ key, label }) => (//renders input fields for each field in the form
        <AppTextInput
          key={key}
          label={label}
          value={form[key]}
          editable={!isSubmitting}
          onChangeText={value =>
            setForm(current => ({ ...current, [key]: value }))
          }
          autoCapitalize={
            key === 'firstName' || key === 'lastName'
              ? 'words'
              : 'none'
          }
          keyboardType={key === 'email' ? 'email-address' : 'default'}
          autoComplete={key === 'password' ? 'new-password' : undefined}
          isPassword={key === 'password'}
        />
      ))}

      <AppButton
        title={isSubmitting ? 'Creating account...' : 'Sign up'}
        onPress={handleSignup}
        disabled={
          isSubmitting ||
          !form.firstName.trim() ||
          !form.lastName.trim() ||
          !form.username.trim() ||
          !form.email.trim() ||
          !form.password
        }
      />

      <Pressable
        onPress={onBackToLogin}
        accessibilityRole="link"
        style={styles.link}
        disabled={isSubmitting}
      >
        <Text style={[styles.linkText, { color: colors.primary }]}>
          Already have an account? Log in
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