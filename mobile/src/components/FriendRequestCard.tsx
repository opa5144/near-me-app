import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchFriendRequest, respondToFriendRequest } from '../api/friends';
import type { FriendMutationResponse, FriendRequestDetail } from '../api/friends';
import { settingsErrorMessage } from '../api/settings';
import { formatEventDate } from '../utils/dateFormat';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';

// Inline inbox and dedicated details use the same recipient-owned request state.
export function FriendRequestCard({ requestId, refreshGeneration = 0, onUpdated }: {
  requestId: string; refreshGeneration?: number; onUpdated: () => void;
}) {
  const { colors } = useTheme();
  const [request, setRequest] = useState<FriendRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  const pending = useRef<Promise<FriendMutationResponse> | null>(null);

  useFocusEffect(useCallback(() => {
    const current = ++version.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    async function load() {
      try {
        await pending.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const row = await fetchFriendRequest(requestId, controller.signal);
        if (version.current === current) setRequest(row);
      } catch (reason: unknown) {
        if (version.current === current && !controller.signal.aborted) {
          setError(settingsErrorMessage(reason, 'Unable to load this friend request.'));
        }
      } finally {
        if (version.current === current) { setLoading(false); setSaving(false); }
      }
    }
    void load();
    return () => { ++version.current; controller.abort(); };
  }, [requestId, refreshGeneration, attempt]));

  async function respond(action: 'accept' | 'reject') {
    if (pending.current || !request?.canRespond || saving || loading) return;
    const current = version.current;
    setSaving(true); setError(null);
    // A rejected request may later be sent again using the same Friendship ID.
    // The generation prevents an old card from answering that newer occurrence.
    const operation = respondToFriendRequest(requestId, action, request.requestVersion);
    pending.current = operation;
    try {
      const response = await operation;
      // A committed response refreshes shared counts even if the card lost focus.
      onUpdated();
      if (version.current !== current) return;
      setRequest(row => row ? { ...row, status: response.friendship.status, canRespond: false } : row);
      setAttempt(value => value + 1);
    } catch (reason: unknown) {
      if (version.current === current) setError(settingsErrorMessage(reason, 'Unable to respond to this friend request. Refresh it and try again.'));
    } finally {
      if (pending.current === operation) pending.current = null;
      if (version.current === current) setSaving(false);
    }
  }

  const requested = request?.requestedAt ? new Date(request.requestedAt) : null;
  const statuses = { accepted: 'You are now friends.', rejected: 'Friend request declined.', blocked: 'This friend request is unavailable.' } as const;
  return <View style={[styles.card, { borderColor: colors.border }]}>
    {loading ? <ActivityIndicator color={colors.primary} /> : request ? <>
      <View style={styles.person}>
        {Boolean(request.requester.avatar) && <Image source={{ uri: request.requester.avatar }} style={styles.avatar} />}
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.text }]}>{request.requester.name || request.requester.username}</Text>
          <Text style={{ color: colors.muted }}>@{request.requester.username}</Text>
        </View>
      </View>
      {requested && Number.isFinite(requested.getTime()) && <Text style={[styles.date, { color: colors.muted }]}>Requested {formatEventDate(request.requestedAt)}</Text>}
      {request.status === 'pending' ? request.canRespond ? <View style={styles.actions}>
        <AppButton title={saving ? 'Saving...' : 'Accept'} disabled={saving} onPress={() => { void respond('accept'); }} style={styles.button} />
        <AppButton title="Decline" variant="secondary" disabled={saving} onPress={() => { void respond('reject'); }} style={styles.button} />
      </View> : <Text style={{ color: colors.muted }}>This friend request is no longer available.</Text>
        : <Text style={{ color: colors.primary }}>{statuses[request.status]}</Text>}
    </> : null}
    <FieldError message={error} />
    {error && <AppButton title="Refresh friend request" variant="quiet" disabled={saving} onPress={() => setAttempt(value => value + 1)} />}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 }, copy: { flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21 }, name: { fontWeight: '800', fontSize: 14 },
  date: { fontSize: 11 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { flexGrow: 1 },
});
