import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function AboutScreen({ navigation }: any) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="About Near Me" subtitle="Prototype version and legal information." />

      <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.appName, { color: colors.text }]}>Near Me Mobile</Text>
        <Text style={[styles.version, { color: colors.muted }]}>Version 1.0.0 (Prototype)</Text>
      </View>

      <TouchableOpacity style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.linkText, { color: colors.text }]}>Terms of Service</Text>
        <Text style={[styles.arrow, { color: colors.muted }]}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.linkText, { color: colors.text }]}>Privacy Policy</Text>
        <Text style={[styles.arrow, { color: colors.muted }]}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  infoCard: { alignItems: 'center', padding: 24, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  appName: { fontSize: 16, fontWeight: '800' },
  version: { fontSize: 12, marginTop: 4 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  linkText: { fontSize: 12, fontWeight: '600' },
  arrow: { fontSize: 18 },
});