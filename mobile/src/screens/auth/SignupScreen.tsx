import { useEffect, useState, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppTextInput } from '../../components/AppTextInput';
import axios from 'axios';
import { signupUser, checkUsernameAvailability } from '../../api/client';
import type { SignupErrorResponse, SignupRequest } from '../../api/client';

const fields = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'username', label: 'Username' },
  { key: 'email', label: 'Email' },
  { key: 'password', label: 'Password' },
] as const;

type SignupField = keyof SignupRequest;
type FieldErrors = Partial<Record<SignupField, string>>;

function validateField(field: SignupField, value: string): string | undefined {
  if (field === 'password') {
    if (!value) return 'Password is required.';
    const length = Array.from(value).length;
    return length < 15 || length > 128 ? 'Use 15 to 128 characters.' : undefined;
  }
  if (!value.trim()) return fields.find(item => item.key === field)!.label + ' is required.';
  if (field === 'username' && !/^[A-Za-z0-9]{1,25}$/.test(value)) return 'Use letters and numbers only, up to 25 characters.';
  if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address.';
  return undefined;
}

type SignupScreenProps = {
  onBackToLogin: () => void;
};

export function SignupScreen({ onBackToLogin }: SignupScreenProps) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);//updates the UI
  const signupInFlight = useRef(false);//when in flight it stops retyping
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'unavailable'>('idle');
  const checkedUsername = useRef('');
  const usernameRevision = useRef(0);
  const currentUsername = useRef(form.username);
  const usernameRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++usernameRevision.current;
      usernameRequest.current?.abort();
    };
  }, []);

  // Availability is checked only when leaving Username. The final insert still
  // checks its unique index, and an old response cannot replace a newer edit.
  function checkUsernameOnBlur(username: string) {
    const revision = ++usernameRevision.current;
    usernameRequest.current?.abort();
    if (signupInFlight.current || accountCreated || validateField('username', username)) {
      setUsernameStatus('idle');
      return;
    }
    const controller = new AbortController();
    usernameRequest.current = controller;
    const isCurrent = () => mounted.current && !controller.signal.aborted && revision === usernameRevision.current &&
      currentUsername.current === username && !signupInFlight.current;
    setUsernameStatus('checking');
    void checkUsernameAvailability(username, controller.signal).then(available => {
      if (!isCurrent()) return;
      checkedUsername.current = username;
      setUsernameStatus(available ? 'available' : 'taken');
      setErrors(current => {
        if (!isCurrent()) return current;
        if (!available) return { ...current, username: 'Username already exists.' };
        if (current.username !== 'Username already exists.') return current;
        const next = { ...current };
        delete next.username;
        return next;
      });
    }).catch(() => {
      if (isCurrent() && !controller.signal.aborted) setUsernameStatus('unavailable');
    });
  }

  function showFieldError(field: SignupField, value: string) {
    setErrors(current => {
      const next = { ...current };
      const message = validateField(field, value);
      if (message) next[field] = message;
      return next;
    });
    if (field === 'username') checkUsernameOnBlur(value);
  }

  function editField(field: SignupField, value: string) {
    if (field === 'username') {
      // Editing invalidates the old lookup without validating the new value.
      ++usernameRevision.current;
      usernameRequest.current?.abort();
      currentUsername.current = value;
      checkedUsername.current = '';
      setUsernameStatus('idle');
    }
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  async function handleSignup() {
    //Validate and send the form to your backend signup endpoint.
    if (signupInFlight.current || accountCreated) return;
    const invalid: FieldErrors = {};
    for (const { key } of fields) {
      const message = validateField(key, form[key]);
      if (message) invalid[key] = message;
    }
    if (usernameStatus === 'taken' && checkedUsername.current === form.username) invalid.username = 'Username already exists.';
    setErrors(invalid);
    setFormError(null);
    if (Object.keys(invalid).length) return;

    ++usernameRevision.current;
    usernameRequest.current?.abort();
    setUsernameStatus('idle');
    signupInFlight.current = true;
    setIsSubmitting(true);
    
    try{ //sends form to backend 
      const result = await signupUser({
        ...form,
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        username: form.username.trim(), email: form.email.trim().toLowerCase(),
      });
      setAccountCreated(true);
      setForm(current => ({ ...current, password: '' }));
      Alert.alert(
        'Account created',
        result.message,
        [{text: 'Back to Login', onPress: onBackToLogin}],
        {cancelable: false},
      );
    } catch (error){ //catches account creation errors  
      let message = 'Unable to create account. Please try again.';
      const fieldErrors: FieldErrors = {};
      if(axios.isAxiosError<SignupErrorResponse>(error)){
        for (const { key } of fields) {
          const text = error.response?.data?.errors?.[key];
          if (typeof text === 'string' && text) fieldErrors[key] = text;
        }
        const serverMessage = error.response?.data?.message; 
        if(typeof serverMessage === 'string'){
          message = serverMessage;
        } else if (!error.response){
          message = 'No response from server. Check connection.';
        }
      }
      setErrors(fieldErrors);
      setFormError(Object.keys(fieldErrors).length ? null : message);
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
      {formError && <Text accessibilityRole="alert" style={[styles.feedback, { color: errorColor }]}>{formError}</Text>}

      {fields.map(({ key, label }) => (//renders input fields for each field in the form
        <View key={key}>
          <AppTextInput
            label={label}
            error={errors[key]}
            value={form[key]}
            editable={!isSubmitting && !accountCreated}
            onChangeText={value => editField(key, value)}
            onBlur={() => showFieldError(key, form[key])}
            maxLength={key === 'username' ? 25 : undefined}
            autoCapitalize={
              key === 'firstName' || key === 'lastName'
                ? 'words'
                : 'none'
            }
            keyboardType={key === 'email' ? 'email-address' : 'default'}
            autoComplete={key === 'password' ? 'new-password' : undefined}
            isPassword={key === 'password'}
          />
          {key === 'username' && usernameStatus === 'checking' && <Text style={[styles.feedback, { color: colors.muted }]}>Checking username...</Text>}
          {key === 'username' && usernameStatus === 'unavailable' && <Text style={[styles.feedback, { color: colors.muted }]}>Could not check availability. You can still try signing up.</Text>}
        </View>
      ))}

      <AppButton
        title={isSubmitting ? 'Creating account...' : 'Sign up'}
        onPress={handleSignup}
        disabled={
          isSubmitting || accountCreated
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
  feedback: { fontSize: 13, marginBottom: 16 },
  link: { alignItems: 'center', paddingVertical: 16 },
  linkText: { textDecorationLine: 'underline', fontSize: 14 },
});
