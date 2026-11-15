import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchEventInvite, markEventInviteRead, respondToEventInvite } from '../api/eventInvites';
import type { EventInvite } from '../api/eventInvites';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';

export function EventInviteCard({ inviteId, refreshGeneration = 0, onUpdated, onOpenEvent }: {
  inviteId: string; refreshGeneration?: number; onUpdated: () => void; onOpenEvent?: (eventId: string) => void;
}) {
  const { colors } = useTheme();
  const [invite, setInvite] = useState<EventInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  const pending = useRef<Promise<EventInvite> | null>(null);
  useFocusEffect(useCallback(() => {
    const current = ++version.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    async function load() {
      try {
        await pending.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const row = await fetchEventInvite(inviteId, controller.signal);
        if (version.current === current) setInvite(row);
      } catch (reason: unknown) {
        if (version.current === current && !controller.signal.aborted) setError(settingsErrorMessage(reason, 'Unable to load this invitation.'));
      } finally { if (version.current === current) { setLoading(false); setSaving(false); } }
    }
    void load();
    return () => { ++version.current; controller.abort(); };
  }, [inviteId, attempt, refreshGeneration]));
  async function respond(status: 'accepted' | 'declined') {
    if (pending.current || !invite || saving) return;
    const current = version.current;
    setSaving(true); setError(null);
    const request = respondToEventInvite(inviteId, status);
    pending.current = request;
    try {
      const row = await request;
      if (version.current === current) { setInvite(row); onUpdated(); }
    } catch (reason: unknown) {
      if (version.current === current) setError(settingsErrorMessage(reason, 'Unable to respond. Please try again.'));
    } finally { if (pending.current === request) pending.current = null; if (version.current === current) setSaving(false); }
  }
  async function openEvent() {
    if (!invite || !onOpenEvent || pending.current || saving) return;
    const current = version.current;
    setSaving(true); setError(null);
    const request = markEventInviteRead(inviteId);
    pending.current = request;
    try {
      const row = await request;
      if (version.current === current) { setInvite(row); onUpdated(); onOpenEvent(row.eventId); }
    } catch (reason: unknown) {
      if (version.current === current) setError(settingsErrorMessage(reason, 'Unable to open this invitation. Please try again.'));
    } finally { if (pending.current === request) pending.current = null; if (version.current === current) setSaving(false); }
  }
  return <View style={[styles.card, { borderColor: colors.border }]}>
    {loading ? <ActivityIndicator color={colors.primary} /> : invite ? <>
      <Text style={[styles.title, { color: colors.text }]}>{invite.event.title}</Text>
      <Text style={{ color: colors.muted }}>Invited by @{invite.sender.username}</Text>
      {onOpenEvent && <AppButton title="View event" variant="quiet" alignment="left" disabled={saving} onPress={() => { void openEvent(); }} />}
      {invite.status === 'pending' ? <>
        {!invite.canRespond && <Text style={{ color: colors.muted }}>Registration has closed. You can dismiss this invitation.</Text>}
        <View style={styles.actions}>
          <AppButton title={saving ? 'Saving...' : 'Accept & Attend'} disabled={saving || !invite.canRespond} onPress={() => { void respond('accepted'); }} style={styles.button} />
          <AppButton title="Decline" variant="secondary" disabled={saving} onPress={() => { void respond('declined'); }} style={styles.button} />
        </View>
      </> : <Text style={{ color: colors.primary }}>{invite.status === 'accepted' ? 'Invitation accepted' : 'Invitation declined'}</Text>}
    </> : null}
    <FieldError message={error} />
    {error && <AppButton title="Refresh invitation" variant="quiet" disabled={saving} onPress={() => setAttempt(value => value + 1)} />}
  </View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 }, title: { fontWeight: '800', fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { flexGrow: 1 } });
