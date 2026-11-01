import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';

const settingSections = [
  {
    title: 'Account',
    items: [
      { id: 'Account', icon: '👤', title: 'Account Information', subtitle: 'Profile, username, email, phone & bio' },
      { id: 'Security', icon: '🔒', title: 'Security & Login', subtitle: 'Password changes, MFA, and account deletion' },
      { id: 'BookingHistory', icon: '📅', title: 'Booking History', subtitle: 'View previously booked events' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { id: 'Preferences', icon: '✨', title: 'My Preferences', subtitle: 'Preferred categories and subscribed cities' },
      { id: 'Location', icon: '📍', title: 'Location', subtitle: 'Nearby activity distance search radius' },
    ],
  },
  {
    title: 'App Settings',
    items: [
      { id: 'Notifications', icon: '🔔', title: 'Notifications', subtitle: 'Push alerts, email options, calendar sync' },
      { id: 'Display', icon: '🎨', title: 'Display & Theme', subtitle: 'System default, light, or dark mode' },
    ],
  },
  {
    title: 'About',
    items: [
      { id: 'About', icon: 'ⓘ', title: 'About Near Me', subtitle: 'Prototype version, terms, and legal info' },
    ],
  },
];

export function SettingsScreen({ navigation }: any) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <AppButton title="‹  Back" variant="quiet" alignment="left" minHeight={44} onPress={() => navigation.goBack()} style={styles.backButton} textStyle={styles.backText} />
      <ScreenHeader title="Settings" subtitle="Make Near Me work for you." />

      {settingSections.map((section) => (
        <View key={section.title} style={styles.sectionContainer}>
          <Text style={[styles.sectionHeader, { color: colors.muted }]}>{section.title}</Text>
          {section.items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.id)}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}><Text style={styles.icon}>{item.icon}</Text></View>
              <View style={styles.text}>
                <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{item.subtitle}</Text>
              </View>
              <Text style={[styles.arrow, { color: colors.muted }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity style={styles.logoutButton} activeOpacity={0.8}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, flexGrow: 1 },
  backButton: { paddingHorizontal: 8, marginLeft: -8, marginBottom: 8 },
  backText: { fontWeight: '800', fontSize: 14 },
  sectionContainer: { marginBottom: 16 },
  sectionHeader: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 13, marginBottom: 10, gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 20 },
  text: { flex: 1 },
  title: { fontSize: 13, fontWeight: '800' },
  subtitle: { fontSize: 10, marginTop: 3, lineHeight: 14 },
  arrow: { fontSize: 22, fontWeight: '300' },
  logoutButton: { padding: 14, alignItems: 'center', borderRadius: 14, backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#FFD7D7', marginTop: 8, marginBottom: 16 },
  logoutText: { color: '#D93025', fontWeight: '800', fontSize: 13 },
});
