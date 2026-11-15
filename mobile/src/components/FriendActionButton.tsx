import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';
import { useTheme } from '../context/ThemeContext';
import { fetchFriendsNetwork, friendshipFromNetwork, sendFriendRequest, respondToFriendRequest } from '../api/friends';
import type { FriendshipStatus } from '../api/friends';
import { settingsErrorMessage } from '../api/settings';

export type { FriendshipStatus } from '../api/friends';

interface FriendActionButtonProps {
  targetUserId: string;
  initialStatus: FriendshipStatus;
  requestId?: string;
  disabled?: boolean;
  onStatusChange?: (newStatus: FriendshipStatus, requestId?: string) => void;
}

export function FriendActionButton({ targetUserId, initialStatus, requestId, disabled = false, onStatusChange }: FriendActionButtonProps) {
  const { colors } = useTheme();
  const [status, setStatus] = useState(initialStatus);
  const [activeRequestId, setActiveRequestId] = useState(requestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    ++version.current;
    setStatus(initialStatus); setActiveRequestId(requestId); setError(null);
    return () => { ++version.current; };
  }, [targetUserId, initialStatus, requestId]);

  function applyStatus(next: { status: FriendshipStatus; requestId?: string }) {
    setStatus(next.status); setActiveRequestId(next.requestId); onStatusChange?.(next.status, next.requestId);
  }

  async function refreshStatus() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    const current = version.current;
    setBusy(true); setError(null);
    try {
      const network = await fetchFriendsNetwork();
      if (version.current === current) applyStatus(friendshipFromNetwork(network, targetUserId));
    } catch (reason: unknown) {
      if (version.current === current) setError(settingsErrorMessage(reason, 'Unable to refresh friendship status. Please try again.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function handlePress() {
    if (inFlight.current || disabled || (status !== 'none' && status !== 'pending_received')) return;
    if (!/^[a-f0-9]{24}$/i.test(targetUserId)) { setError('This user is unavailable.'); return; }
    if (status === 'pending_received' && !activeRequestId) {
      setError('Refresh this friendship before accepting the request.'); return;
    }
    inFlight.current = true;
    const current = version.current;
    setBusy(true); setError(null);
    try {
      const response = status === 'none'
        ? await sendFriendRequest(targetUserId)
        : await respondToFriendRequest(activeRequestId!, 'accept');
      if (version.current !== current) return;
      // Sending can accept an existing incoming request; trust the saved result.
      if (response.friendship.status === 'accepted') applyStatus({ status: 'accepted' });
      else if (response.friendship.status === 'pending') applyStatus({ status: 'pending_sent' });
      else setError('The friendship changed. Refresh its status to continue.');
    } catch (reason: unknown) {
      if (version.current !== current) return;
      setError(settingsErrorMessage(reason, 'Unable to update this friendship. Please try again.'));
      // A timeout or conflict may follow a committed write. Re-read real state;
      // never infer the relationship by searching an error message's wording.
      try {
        const network = await fetchFriendsNetwork();
        if (version.current === current) applyStatus(friendshipFromNetwork(network, targetUserId));
      } catch { /* Keep the visible action error and the explicit refresh control. */ }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const isPressable = status === 'none' || status === 'pending_received';
  const label = { none: 'Add Friend', pending_sent: 'Requested', pending_received: 'Accept Request', accepted: 'Friends' }[status];
  const icon = ({ none: 'person-add-outline', pending_sent: 'time-outline', pending_received: 'checkmark-circle-outline', accepted: 'people' } as const)[status];
  const activeColor = isPressable ? '#FFFFFF' : status === 'accepted' ? colors.text : colors.muted;
  return <View style={styles.container}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || !isPressable || busy, busy }}
      disabled={disabled || !isPressable || busy} onPress={() => void handlePress()} activeOpacity={0.8}
      style={[styles.button, { backgroundColor: isPressable ? colors.primary : colors.surface,
        borderColor: isPressable ? colors.primary : colors.border }, (busy || disabled) && styles.disabled]}>
      {busy ? <ActivityIndicator size="small" color={activeColor} /> : <>
        <Ionicons name={icon} size={14} color={activeColor} />
        <AppText style={[styles.text, { color: activeColor }]}>{label}</AppText>
      </>}
    </TouchableOpacity>
    <FieldError message={error} />
    {error && <AppButton title="Refresh friendship status" variant="quiet" minHeight={36}
      disabled={busy || disabled} onPress={() => void refreshStatus()} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, minHeight: 40, borderRadius: 12, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.6 },
});
