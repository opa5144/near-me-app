import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppTextInput } from '../../components/AppTextInput';

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

  function handleSignup() {
    //Validate and send the form to your backend signup endpoint.
    Alert.alert('Sign up', 'Account creation is not implemented yet.');
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Sign up" subtitle="Create your account." />

      {fields.map(({ key, label }) => (
        <AppTextInput
          key={key}
          label={label}
          value={form[key]}
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
        title="Sign up"
        onPress={handleSignup}
        disabled={Object.values(form).some(value => value.length === 0)}
      />

      <Pressable
        onPress={onBackToLogin}
        accessibilityRole="link"
        style={styles.link}
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