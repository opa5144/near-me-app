import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { colors } from '../data/theme';
import {AppTextInput} from '../components/AppTextInput';
import { useState } from 'react';
type LoginScreenProps = {
  onLogin: () => void;
  onSignup: () => void;
};

export function LoginScreen({ onLogin, onSignup }: LoginScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="Login" subtitle="Login to your account." />
      <Text style={styles.note}>Login functionality is not yet implemented.</Text>
      <AppTextInput
        label="Username or email"
        value={identifier}
        onChangeText={setIdentifier}
        autoComplete="username"
      />

      <AppTextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        isPassword
      />
      {/* Local storage not implemented yet, both checkboxes have no functionality*/}
      <View style={styles.rememberOptions}>
        {['Remember email', 'Remember me'].map(label =>(
          <Pressable 
            key={label}
            disabled
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{checked: false, disabled: true}}
            style={styles.checkboxRow}
          >
            <View style={styles.checkbox}/>
            <Text style={styles.checkboxLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <AppButton
        title="Login"
        onPress={onLogin}
        disabled={!identifier.trim() || !password} 
      />
      <Pressable
        onPress={onSignup}
        accessibilityRole="link"
        style={styles.link}
      >
        <Text style={styles.linkText}>No account? Sign up</Text>
      </Pressable>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 13, marginBottom: 10, gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.primary, fontSize: 20 },
  text: { flex: 1 },
  title: { color: colors.text, fontSize: 12, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 4 },
  arrow: { color: colors.muted, fontSize: 24 },
  note: { color: colors.muted, fontSize: 10, marginTop: 12, lineHeight: 16 },
  rememberOptions: {marginBottom:16},
  checkboxRow:{flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, opacity: 0.6},
  checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.muted, borderRadius: 4 },
  checkboxLabel: { color: colors.text, fontSize: 14 },
  link:{alignItems: 'center', marginTop: 16},
  linkText:{color: colors.primary, textDecorationLine: 'underline', fontSize: 14},
});
