import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';
import { useRef, useState } from 'react';
import { logoutUser } from '../../api/client';
import { useNotifications } from '../../context/NotificationsContext';
import { Ionicons } from '@expo/vector-icons';

const settingSections: {
  title: string;
  items: { id: string; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }[];
}[] = [
  {
    title: 'Account',
    items: [
      { id: 'Account', icon: 'person-outline', title: 'Account Information', subtitle: 'Profile, username, email, phone & bio' },
      { id: 'Security', icon: 'lock-closed-outline', title: 'Security & Login', subtitle: 'Password changes, MFA, and account deletion' },
      { id: 'BookingHistory', icon: 'calendar-outline', title: 'Booking History', subtitle: 'Past interested or attending events' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { id: 'Preferences', icon: 'sparkles-outline', title: 'My Preferences', subtitle: 'Preferred categories and subscribed cities' },
    ],
  },
  {
    title: 'App Settings',
    items: [
      { id: 'NotificationInbox', icon: 'mail-unread-outline', title: 'Notification Inbox', subtitle: 'Event updates, reminders, and unread alerts' },
      { id: 'Notifications', icon: 'notifications-outline', title: 'Notification Settings', subtitle: 'Channels and event notification preferences' },
      { id: 'Display', icon: 'color-palette-outline', title: 'Display & Theme', subtitle: 'System default, light, or dark mode' },
    ],
  },
  {
    title: 'About',
    items: [
      { id: 'About', icon: 'information-circle-outline', title: 'About Near Me', subtitle: 'Prototype version, terms, and legal info' },
    ],
  },
];

export function SettingsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { unreadCount } = useNotifications();
  const [loggingOut, setLoggingOut] = useState(false);
  const pendingLogout = useRef(false);

  async function handleLogout() {
    if (pendingLogout.current) return;
    pendingLogout.current = true;
    setLoggingOut(true);

    // logoutUser always clears local authentication, which unmounts notification state.
    try {
      await logoutUser();
    } catch {
      /* Local sign-out still completed. */
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <AppButton title="‹ Back" variant="quiet" alignment="left" minHeight={44} onPress={() => navigation.goBack()} style={styles.backButton} textStyle={styles.backText} />
      <ScreenHeader title="Settings" subtitle="Make Near Me work for you." />
      {settingSections.map((section) => (
        <View key={section.title} style={styles.sectionContainer}>
          <Text style={[styles.sectionHeader, { color: colors.muted }]}>{section.title}</Text>
          {section.items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.7}
              disabled={loggingOut}
              onPress={() => navigation.navigate(item.id)}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.text}>
                <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{item.subtitle}</Text>
              </View>
              {item.id === 'NotificationInbox' && unreadCount > 0 && (
                <Text accessibilityLabel={`${unreadCount} unread notifications`} style={[styles.unread, { backgroundColor: colors.primary }]}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              )}
              <Text style={[styles.arrow, { color: colors.muted }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <TouchableOpacity style={styles.logoutButton} activeOpacity={0.8} accessibilityRole="button" disabled={loggingOut} onPress={() => void handleLogout()}>
        <Text style={styles.logoutText}>{loggingOut ? 'Signing out...' : 'Log Out'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, flexGrow: 1 },
  backButton: { paddingHorizontal: 8, marginLeft: -8, marginBottom: 8 },
  backText: { fontWeight: '800', fontSize: 14 },
  sectionContainer: { marginBottom: 16 },
  sectionHeader: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 13, marginBottom: 10, gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 13, fontWeight: '800' },
  subtitle: { fontSize: 10, marginTop: 3, lineHeight: 14 },
  arrow: { fontSize: 22, fontWeight: '300' },
  unread: { color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11, fontWeight: '800' },
  logoutButton: { padding: 14, alignItems: 'center', borderRadius: 14, backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#FFD7D7', marginTop: 8, marginBottom: 16 },
  logoutText: { color: '#D93025', fontWeight: '800', fontSize: 13 },
});
