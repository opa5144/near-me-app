import { StyleSheet, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { FriendRequestCard } from '../../components/FriendRequestCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useNotifications } from '../../context/NotificationsContext';
import { useUserData } from '../../context/UserDataContext';
import { useTheme } from '../../context/ThemeContext';

export function FriendRequestScreen({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { colors } = useTheme();
  const { refresh } = useNotifications();
  const { refreshFriends } = useUserData();
  return <View style={[styles.content, { backgroundColor: colors.background }]}>
    <AppButton title="Back" variant="quiet" alignment="left" onPress={onBack} />
    <ScreenHeader title="Friend request" subtitle="Review the request and choose whether to connect." />
    <FriendRequestCard requestId={requestId} onUpdated={() => { void refresh(); void refreshFriends(true); }} />
  </View>;
}
const styles = StyleSheet.create({ content: { flex: 1, padding: 16 } });
