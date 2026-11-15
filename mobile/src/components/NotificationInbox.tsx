import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { notificationAction } from '../api/notifications';
import type { AppNotification, NotificationAction } from '../api/notifications';
import { useNotifications } from '../context/NotificationsContext';
import { useTheme } from '../context/ThemeContext';
import { formatEventDate } from '../utils/dateFormat';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';
import { EventInviteCard } from './EventInviteCard';
import { EventInvitesPanel } from './EventInvitesPanel';
import { useEvents } from '../context/EventsContext';

export function NotificationInbox({ onOpenAction }: { onOpenAction: (action: NotificationAction) => void }) {
  const { colors } = useTheme();
  const { refreshSelections, refreshEvents } = useEvents();
  const { notifications, unreadCount, isLoading, refreshing, loadingMore, hasMore, error, actionError,
    saving, refresh, loadMore, setRead, readAll } = useNotifications();
  const [inviteRefreshGeneration, setInviteRefreshGeneration] = useState(0);
  // Inbox refreshes include invitations even when their notification channel is off.
  const refreshInbox = useCallback(() => {
    setInviteRefreshGeneration(value => value + 1);
    void refresh();
  }, [refresh]);
  useFocusEffect(useCallback(() => { refreshInbox(); }, [refreshInbox]));
  const inviteIdFor = (item: AppNotification) => item.type === 'EVENT_INVITE' && typeof item.data.inviteId === 'string' &&
    /^[a-f0-9]{24}$/i.test(item.data.inviteId) ? item.data.inviteId : undefined;
  const notificationInviteIds = new Set(notifications.map(inviteIdFor).filter((value): value is string => Boolean(value)));
  const invitationUpdated = () => { refreshInbox(); void refreshSelections(); void refreshEvents(); };
  const openInvitedEvent = (eventId: string) => onOpenAction({ type: 'OPEN_EVENT', eventId });

  async function open(item: AppNotification) {
    const action = notificationAction(item);
    if (!action || saving) return;
    if (!item.isRead && !(await setRead(item.id, true))) return;
    onOpenAction(action);
  }

  return <View style={styles.fill}>
    <View style={styles.toolbar}>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{unreadCount} unread</Text>
      <AppButton title={saving ? 'Saving...' : 'Mark all read'} variant="quiet" minHeight={40}
        disabled={saving || unreadCount === 0 || isLoading} onPress={() => { void readAll(); }} />
    </View>
    <FieldError message={actionError} />
    {isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <FlatList
      data={notifications} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<EventInvitesPanel notificationInviteIds={notificationInviteIds} refreshGeneration={inviteRefreshGeneration}
        onUpdated={invitationUpdated} onOpenEvent={openInvitedEvent} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshInbox} tintColor={colors.primary} colors={[colors.primary]} />}
      ListEmptyComponent={!error ? <Text style={[styles.empty, { color: colors.muted }]}>No notifications yet. Your event updates will appear here.</Text> : undefined}
      renderItem={({ item }) => {
        const action = notificationAction(item);
        const created = new Date(item.createdAt);
        const timestamp = Number.isFinite(created.getTime()) ? `${formatEventDate(item.createdAt)} · ${created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
        return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: item.isRead ? colors.border : colors.primary }]}>
          <View style={styles.headingRow}>
            <Ionicons name={item.type === 'RATE_ATTENDED_EVENT' ? 'happy-outline' : 'notifications-outline'} size={21} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text, fontWeight: item.isRead ? '600' : '800' }]}>{item.title}</Text>
            {!item.isRead && <View accessibilityLabel="Unread" style={[styles.dot, { backgroundColor: colors.primary }]} />}
          </View>
          <Text style={[styles.message, { color: colors.text }]}>{item.message}</Text>
          <Text style={[styles.time, { color: colors.muted }]}>{timestamp}</Text>
          {inviteIdFor(item) && <EventInviteCard inviteId={inviteIdFor(item)!} refreshGeneration={inviteRefreshGeneration} onUpdated={invitationUpdated} />}
          <View style={styles.actions}>
            {action && <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void open(item); }} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.primary }]}>{action.type === 'RATE_EVENT' ? 'Rate event' : 'View event'}</Text>
            </Pressable>}
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void setRead(item.id, !item.isRead); }} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.primary }]}>{item.isRead ? 'Mark unread' : 'Mark read'}</Text>
            </Pressable>
          </View>
        </View>;
      }}
      ListFooterComponent={<>
        <FieldError message={error} />
        {error && <AppButton title="Retry notifications" variant="quiet" onPress={refreshInbox} />}
        {hasMore && <AppButton title={loadingMore ? 'Loading...' : 'Load more'} variant="quiet"
          disabled={loadingMore || refreshing || saving} onPress={() => { void loadMore(); }} />}
      </>} />}
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  list: { paddingBottom: 20 }, loading: { paddingVertical: 28 }, empty: { paddingVertical: 24, fontSize: 13, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginVertical: 6, gap: 9 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 }, message: { fontSize: 13, lineHeight: 20 }, time: { fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  action: { paddingVertical: 9, minHeight: 40, justifyContent: 'center' }, actionText: { fontSize: 12, fontWeight: '700' },
});
