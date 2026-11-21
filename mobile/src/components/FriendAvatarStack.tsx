import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../context/ThemeContext';
import type { FriendItem } from '../api/friends';

interface FriendAvatarStackProps {
  friendsAttending: FriendItem[];
  onPress?: () => void;
  compact?: boolean;
}

const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

function getFriendAvatar(friend: FriendItem): string {
  // Friend API responses use the canonical avatar field; empty images get a fallback.
  return typeof friend.avatar === 'string' && friend.avatar.trim() ? friend.avatar.trim() : DEFAULT_AVATAR;
}

export function FriendAvatarStack({ friendsAttending, onPress, compact = false }: FriendAvatarStackProps) {
  const { colors } = useTheme();
  if (!friendsAttending || friendsAttending.length === 0) return null;

  const visibleFriends = friendsAttending.slice(0, 3);
  const remainingCount = friendsAttending.length - visibleFriends.length;
  const firstName = friendsAttending[0].name.split(' ')[0];

  const label =
    friendsAttending.length === 1
      ? `${firstName} is attending`
      : remainingCount > 0
      ? `${firstName} and ${friendsAttending.length - 1} friends are attending`
      : `${firstName} & ${friendsAttending[1].name.split(' ')[0]} are attending`;

  const displayLabel = compact ? `${friendsAttending.length} ${friendsAttending.length === 1 ? 'friend' : 'friends'}` : label;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      pointerEvents={onPress ? 'auto' : 'none'}
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, compact && styles.compactContainer]}
    >
      <View style={styles.avatarGroup}>
        {visibleFriends.map((friend, index) => (
          <Image
            key={friend.id}
            source={{ uri: getFriendAvatar(friend) }}
            style={[
              styles.avatar,
              compact && styles.compactAvatar,
              { borderColor: colors.surface, marginLeft: index === 0 ? 0 : compact ? -6 : -10 },
            ]}
          />
        ))}
      </View>
      <AppText style={[styles.label, { color: colors.text }, compact && styles.compactLabel]} numberOfLines={1}>
        {displayLabel}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    marginBottom: 8,
  },
  avatarGroup: { flexDirection: 'row', alignItems: 'center' },
  compactContainer: { paddingVertical: 0, paddingHorizontal: 0, borderWidth: 0, marginBottom: 0, gap: 3, flexShrink: 0 },
  compactAvatar: { width: 16, height: 16, borderRadius: 8 },
  compactLabel: { fontSize: 9, lineHeight: 11 },
  avatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  label: { fontSize: 11, fontWeight: '700' },
});
