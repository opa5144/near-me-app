import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors } from '../../data/theme';

const settings = [
  ['♡', 'My preferences', 'Choose categories you enjoy'],
  ['⌖', 'Location', 'Manage nearby activity distance'],
  ['♧', 'Notifications', 'Event reminders and updates'],
  ['ⓘ', 'About Near Me', 'Prototype version'],
];

export function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="Settings" subtitle="Make Near Me work for you." />
      {settings.map(([icon, title, subtitle]) => (
        <View key={title} style={styles.item}>
          <View style={styles.iconBox}><Text style={styles.icon}>{icon}</Text></View>
          <View style={styles.text}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
          <Text style={styles.arrow}>›</Text>
        </View>
      ))}
      <Text style={styles.note}>These settings are visual placeholders for the first UI prototype.</Text>
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
