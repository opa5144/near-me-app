import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyEventInvites } from '../api/eventInvites';
import type { EventInvite } from '../api/eventInvites';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { EventInviteCard } from './EventInviteCard';
import { FieldError } from './FieldError';
import { AppButton } from './AppButton';

// Invitations remain accessible even if the recipient switches off in-app notifications.
export function EventInvitesPanel({ notificationInviteIds, refreshGeneration, onUpdated, onOpenEvent }: {
  notificationInviteIds: Set<string>; refreshGeneration: number;
  onUpdated: () => void; onOpenEvent: (eventId: string) => void;
}) {
  const { colors } = useTheme();
  const [invites, setInvites] = useState<EventInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void fetchMyEventInvites(controller.signal).then(rows => { if (active) setInvites(rows); })
      .catch((reason: unknown) => { if (active && !controller.signal.aborted) setError(settingsErrorMessage(reason, 'Unable to load event invitations.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt, refreshGeneration]));
  const pending = invites.filter(invite => invite.status === 'pending' && !notificationInviteIds.has(invite.id));
  if (!loading && !error && pending.length === 0) return null;
  return <View style={styles.section}>
    <Text style={[styles.heading, { color: colors.text }]}>Pending invitations</Text>
    {loading && <ActivityIndicator color={colors.primary} />}
    {/* Keep existing cards mounted while refreshing so their pending-save guards survive. */}
    {pending.map(invite => <EventInviteCard key={invite.id} inviteId={invite.id}
      refreshGeneration={refreshGeneration} onOpenEvent={onOpenEvent} onUpdated={onUpdated} />)}
    <FieldError message={error} />
    {error && <AppButton title="Retry invitations" variant="quiet" onPress={() => setAttempt(value => value + 1)} />}
  </View>;
}
const styles = StyleSheet.create({ section: { marginVertical: 12, gap: 10 }, heading: { fontSize: 15, fontWeight: '800' } });
