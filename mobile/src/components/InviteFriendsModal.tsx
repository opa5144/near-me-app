import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { fetchFriendsNetwork, FriendItem } from '../api/friends';
import { sendEventInvite } from '../api/eventInvites';
import { settingsErrorMessage } from '../api/settings';
import { FieldError } from './FieldError';
import { AppButton } from './AppButton';

interface InviteFriendsModalProps {
  visible: boolean;
  eventTitle: string;
  eventId: string;
  onClose: () => void;
}

export function InviteFriendsModal({ visible, eventId, eventTitle, onClose }: InviteFriendsModalProps) {
  const { colors } = useTheme();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  const sending = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const current = ++version.current;
    const controller = new AbortController();
    setLoading(true); setFriends([]); setLoadError(null); setSendError(null); setSendingId(null);
    fetchFriendsNetwork(controller.signal)
      .then(res => { if (version.current === current) setFriends(res.friends); })
      .catch((error: unknown) => { if (version.current === current && !controller.signal.aborted) setLoadError(settingsErrorMessage(error, 'Unable to load your friends. Please try again.')); })
      .finally(() => { if (version.current === current) setLoading(false); });
    return () => { ++version.current; controller.abort(); };
  }, [visible, eventId, attempt]);
  useEffect(() => { setInvitedIds(new Set()); }, [eventId]);

  const handleInvite = async (friend: FriendItem) => {
    if (invitedIds.has(friend.id) || sending.current) return;
    const current = version.current;
    sending.current = true; setSendingId(friend.id); setSendError(null);
    try {
      await sendEventInvite(eventId, friend.id);
      if (version.current === current) setInvitedIds(prev => new Set(prev).add(friend.id));
    } catch (error: unknown) {
      if (version.current === current) setSendError(settingsErrorMessage(error, 'Unable to send this invitation. Please try again.'));
    } finally {
      sending.current = false;
      if (version.current === current) setSendingId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText style={[styles.title, { color: colors.text }]}>Invite Friends</AppText>
            <AppText style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
              To {eventTitle}
            </AppText>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close-circle" size={26} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <FieldError message={sendError} />
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : loadError ? <View><FieldError message={loadError} /><AppButton title="Retry friends" variant="quiet" onPress={() => setAttempt(value => value + 1)} /></View> : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <AppText style={{ textAlign: 'center', color: colors.muted, marginTop: 24 }}>
                Add friends from your profile to invite them directly.
              </AppText>
            }
            renderItem={({ item }) => {
              const isInvited = invitedIds.has(item.id);
              return (
                <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Image source={{ uri: item.avatar }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: '800', color: colors.text }}>{item.name}</AppText>
                    <AppText style={{ fontSize: 11, color: colors.muted }}>@{item.username}</AppText>
                  </View>
                  <TouchableOpacity
                    disabled={isInvited || sendingId !== null}
                    onPress={() => handleInvite(item)}
                    style={[
                      styles.inviteBtn,
                      {
                        backgroundColor: isInvited ? colors.surface : colors.primary,
                        borderColor: colors.border,
                        borderWidth: isInvited ? 1 : 0,
                      },
                    ]}
                  >
                    <AppText style={{ fontSize: 11, fontWeight: '800', color: isInvited ? colors.muted : '#FFFFFF' }}>
                      {isInvited ? 'Invited ✓' : sendingId === item.id ? 'Sending...' : 'Invite'}
                    </AppText>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  inviteBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
});
