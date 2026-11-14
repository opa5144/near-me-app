import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { fetchFriendsNetwork, FriendItem } from '../api/friends';

interface InviteFriendsModalProps {
  visible: boolean;
  eventTitle: string;
  onClose: () => void;
  onSendInvite: (friend: FriendItem) => Promise<void> | void;
}

export function InviteFriendsModal({ visible, eventTitle, onClose, onSendInvite }: InviteFriendsModalProps) {
  const { colors } = useTheme();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchFriendsNetwork()
      .then((res) => setFriends(res.friends || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  const handleInvite = async (friend: FriendItem) => {
    if (invitedIds.has(friend.id)) return;
    setInvitedIds((prev) => new Set(prev).add(friend.id));
    await onSendInvite(friend);
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

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
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
                    disabled={isInvited}
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
                      {isInvited ? 'Invited ✓' : 'Invite'}
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