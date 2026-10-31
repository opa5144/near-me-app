import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text,} from 'react-native';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppTextInput } from '../../components/AppTextInput';

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

  function handleLogin() {
    // Send credentials to auth endpoint.
    onLogin();
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="Login" subtitle="Login to your account." />

      {fields.map(({ key, label }) => (
        <AppTextInput
          key={key}
          label={label}
          value={form[key]}
          onChangeText={value =>
            setForm(current => ({ ...current, [key]: value }))
          }
          autoCapitalize="none"
          keyboardType={key === 'email' ? 'email-address' : 'default'}
          autoComplete={key === 'password' ? 'password' : undefined}
          isPassword={key === 'password'}
        />
      ))}

      <AppButton
        title="Login"
        onPress={handleLogin}
        disabled={Object.values(form).some(value => value.length === 0)}
      />

      {/* Link to switch to Signup Screen */}
      <Pressable
        onPress={onNavigateToSignup}
        accessibilityRole="link"
        style={styles.link}
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