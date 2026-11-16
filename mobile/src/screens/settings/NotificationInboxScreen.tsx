import { StyleSheet, View } from 'react-native';
import type { NotificationAction } from '../../api/notifications';
import { AppButton } from '../../components/AppButton';
import { NotificationInbox } from '../../components/NotificationInbox';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function NotificationInboxScreen({ onBack, onOpenAction }: { onBack: () => void; onOpenAction: (action: NotificationAction) => void }) {
  const { colors } = useTheme();
  return <View style={[styles.content, { backgroundColor: colors.background }]}>
    <AppButton title="Back" variant="quiet" alignment="left" onPress={onBack} />
    <ScreenHeader title="Notifications" subtitle="Your events, invitations, and friend requests." />
    <NotificationInbox onOpenAction={onOpenAction} />
  </View>;
}
const styles = StyleSheet.create({ content: { flex: 1, padding: 16 } });
