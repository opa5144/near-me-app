import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { colors } from '../data/theme';

type LoginScreenProps = {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="Login" subtitle="Login to your account." />
      <Text style={styles.note}>Login functionality is not yet implemented.</Text>
    <AppButton
        title="Login"
        onPress={onLogin}
      />
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
});
