// components/AcceptRequestCard.tsx
import { useEffect, useRef, useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { FieldError } from './FieldError';
import { settingsErrorMessage } from '../api/settings';
import type { PendingRequest } from '../api/friends';

interface AcceptRequestCardProps {
  item: PendingRequest;
  colors: any;
  onAccept: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
}

export function AcceptRequestCard({ item, colors, onAccept, onReject }: AcceptRequestCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function respond(action: 'accept' | 'reject') {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      // Use the Friendship record ID; item.id is the requesting account's ID.
      await (action === 'accept' ? onAccept(item.requestId) : onReject(item.requestId));
    } catch (reason: unknown) {
      if (mounted.current) setError(settingsErrorMessage(reason, 'Unable to update this request. Please try again.'));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.modalItem}>
      <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{item.name}</AppText>
        <AppText style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>@{item.username}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => void respond('accept')} disabled={busy} accessibilityRole="button"
          style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <AppText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{busy ? 'Saving...' : 'Accept'}</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void respond('reject')} disabled={busy} accessibilityRole="button"
          style={[styles.modalActionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <AppText style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>Decline</AppText>
        </TouchableOpacity>
      </View>
      </View>
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  friendAvatar: { width: 42, height: 42, borderRadius: 21 },
  modalActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
});
