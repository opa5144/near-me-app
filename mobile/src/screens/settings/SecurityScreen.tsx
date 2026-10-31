import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function SecurityScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [mfaEnabled, setMfaEnabled] = useState(false);

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="Security & Login" subtitle="Manage passwords, MFA, and account removal." />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Password</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="Current Password" placeholderTextColor={colors.muted} secureTextEntry />
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="New Password" placeholderTextColor={colors.muted} secureTextEntry />
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="Confirm New Password" placeholderTextColor={colors.muted} secureTextEntry />

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
        <Text style={styles.saveBtnText}>Update Password</Text>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Two-Factor Authentication (MFA)</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Require OTP verification during sign in.</Text>
        </View>
        <Switch value={mfaEnabled} onValueChange={setMfaEnabled} trackColor={{ true: colors.primary }} />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <TouchableOpacity style={styles.deleteBtn}>
        <Text style={styles.deleteBtnText}>Delete Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 10 },
  saveBtn: { padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  divider: { height: 1, marginVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontSize: 13, fontWeight: '600' },
  rowSubtitle: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#D93025', alignItems: 'center' },
  deleteBtnText: { color: '#D93025', fontWeight: '700', fontSize: 13 },
});