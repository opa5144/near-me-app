import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { FriendItem } from '../api/friends';

interface FriendAvatarStackProps {
  friendsAttending: FriendItem[];
  onPress?: () => void;
}

export function FriendAvatarStack({ friendsAttending, onPress }: FriendAvatarStackProps) {
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

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.avatarGroup}>
        {visibleFriends.map((friend, index) => (
          <Image
            key={friend.id}
            source={{ uri: friend.avatar }}
            style={[
              styles.avatar,
              { borderColor: colors.surface, marginLeft: index === 0 ? 0 : -10 },
            ]}
          />
        ))}
      </View>
      <AppText style={[styles.label, { color: colors.text }]} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    marginBottom: 14,
  },
  avatarGroup: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  label: { fontSize: 11, fontWeight: '700' },
});