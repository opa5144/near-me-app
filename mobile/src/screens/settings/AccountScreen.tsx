
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';

export function AccountScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [username, setUsername] = useState('johndoe');
  const [email, setEmail] = useState('john@example.com');
  const [phone, setPhone] = useState('+1 555-0199');
  const [bio, setBio] = useState('Outdoor enthusiast and local event organizer.');
  const [dob, setDob] = useState('1995-06-15');

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <AppButton title="‹  Back to Settings" variant="quiet" alignment="left" minHeight={44} onPress={() => navigation.goBack()} style={styles.backButton} textStyle={styles.backText} />
      <ScreenHeader title="Account Information" subtitle="View and update your personal details." />

      <View style={styles.avatarContainer}>
        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}><Text style={[styles.avatarText, { color: colors.primary }]}>JD</Text></View>
        <TouchableOpacity><Text style={[styles.changePhotoText, { color: colors.primary }]}>Change Profile Picture</Text></TouchableOpacity>
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Username</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={username} onChangeText={setUsername} />

      <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={email} onChangeText={setEmail} keyboardType="email-address" />

      <Text style={[styles.label, { color: colors.text }]}>Phone Number</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <Text style={[styles.label, { color: colors.text }]}>Date of Birth</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />

      <Text style={[styles.label, { color: colors.text }]}>Bio</Text>
      <TextInput style={[styles.input, styles.bioInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} value={bio} onChangeText={setBio} multiline numberOfLines={3} />

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
        <Text style={styles.saveBtnText}>Save Changes</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, flexGrow: 1 },
  backButton: { paddingHorizontal: 8, marginLeft: -8, marginBottom: 8 },
  backText: { fontWeight: '800', fontSize: 14 },
  avatarContainer: { alignItems: 'center', marginVertical: 16 },
  avatarPlaceholder: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontWeight: 'bold', fontSize: 22 },
  changePhotoText: { fontSize: 12, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13 },
  bioInput: { height: 70, textAlignVertical: 'top' },
  saveBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
