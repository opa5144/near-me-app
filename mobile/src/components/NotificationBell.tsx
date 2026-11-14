import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationsContext';
import { useTheme } from '../context/ThemeContext';

export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useNotifications();
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open notifications, ${unreadCount} unread`}
    onPress={onPress} style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <Ionicons name="notifications-outline" size={22} color={colors.primary} />
    {unreadCount > 0 && <View style={[styles.badge, { backgroundColor: colors.primary }]}>
      <Text style={styles.count}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
    </View>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -5, minWidth: 19, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center' },
  count: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
