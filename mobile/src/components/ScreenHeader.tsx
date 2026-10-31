import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function ScreenHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 5 },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 5 },
});