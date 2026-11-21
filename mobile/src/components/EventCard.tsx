import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { EventItem } from '../data/events';
import { useTheme } from '../context/ThemeContext';
import { FriendAvatarStack } from './FriendAvatarStack';
import type { FriendItem } from '../api/friends';
import { formatEventPrice } from '../utils/eventPrice';

// Reused by event lists. The parent supplies the record and decides where a tap navigates.
export function EventCard({ event, onPress, horizontal = false, interestedCount, attendingCount, friendsAttending, isOwnEvent = false }: {
  event: EventItem; onPress: () => void; horizontal?: boolean;
  interestedCount?: number; attendingCount?: number;
  friendsAttending?: FriendItem[];
  isOwnEvent?: boolean;
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  // Use the persisted image URL, falling back to the event emoji if loading fails.
  const [imageFailed, setImageFailed] = useState(false);
  // Reset a previous failure when this card is given a different image URL.
  useEffect(() => setImageFailed(false), [event.bannerImage]);

  const goingFriends = friendsAttending ?? event.friendsAttending ?? [];
  const interestedTotal = interestedCount ?? event.interestedCount;
  const attendingTotal = attendingCount ?? event.attendingCount;
  const audience = [interestedTotal !== undefined ? `${interestedTotal} interested` : '',
    attendingTotal !== undefined ? `${attendingTotal} attending` : ''].filter(Boolean).join(' · ');
  const statusLabel = event.status === 'cancelled' ? 'Cancelled' : event.status === 'archived' ? 'Archived' : event.status === 'draft' ? 'Draft' : '';
  const shownCategories = horizontal ? event.categories.slice(0, statusLabel ? 1 : 2) : event.categories;
  const hiddenCategoryCount = event.categories.length - shownCategories.length;
  // Cards share a compact height at the device's font scale; their full text
  // stays in the accessible summary and on the event's details page.
  const cardHeight = Math.ceil(108 + (Math.max(1, fontScale) - 1) * 92);
  const summary = [event.title || 'Untitled draft', isOwnEvent ? 'Mine' : '', statusLabel, event.categories.join(', '),
    event.date, event.time, formatEventPrice(event), event.venue, audience,
    goingFriends.length ? `${goingFriends.length} friends attending` : ''].filter(Boolean).join('. ');

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={summary}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, horizontal && [styles.horizontal, { height: cardHeight }]]}>
      <View style={[styles.art, { backgroundColor: event.accent }, horizontal && styles.horizontalArt]}>
        {event.status !== 'draft' && event.bannerImage && !imageFailed ? (
          <Image source={{ uri: event.bannerImage }} style={styles.bannerImage}
            accessibilityLabel={event.title} onError={() => setImageFailed(true)} />
        ) : (
          <Text style={styles.emoji}>{event.emoji}</Text>
        )}
      </View>
      <View style={[styles.details, horizontal && styles.horizontalDetails]}>
        <View style={[styles.categories, horizontal && styles.horizontalCategories]}>
          {Boolean(statusLabel) && <View style={[styles.categoryBadge, { borderColor: colors.border }]}>
            <Text style={[styles.categoryText, { color: colors.muted }]} numberOfLines={1}>{statusLabel}</Text>
          </View>}
          {shownCategories.map(category => <View key={category} style={[styles.categoryBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.categoryText, { color: colors.text }]} numberOfLines={1}>{category}</Text>
          </View>)}
          {hiddenCategoryCount > 0 && <Text style={[styles.categoryText, { color: colors.muted }]}>+{hiddenCategoryCount}</Text>}
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={horizontal ? 1 : 2}>{event.title || 'Untitled draft'}</Text>
          <Text style={[styles.price, { color: colors.primary }]} numberOfLines={1}>{formatEventPrice(event)}</Text>
        </View>
        <Text style={[styles.meta, { color: colors.primary }]} numberOfLines={2}>{event.date} · {event.time}</Text>
        <Text style={[styles.venue, { color: colors.muted }]} numberOfLines={1}>⌖ {event.venue}</Text>
        {(audience || goingFriends.length > 0) && <View style={styles.footer}>
          {Boolean(audience) && <Text style={[styles.audience, { color: colors.muted }]} numberOfLines={1}>{audience}</Text>}
          {goingFriends.length > 0 && <FriendAvatarStack friendsAttending={goingFriends} compact />}
        </View>}
      </View>
      {isOwnEvent && <View pointerEvents="none" style={styles.ownershipColumn}>
        <View style={[styles.ownershipBadge, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
          <Text style={[styles.ownershipText, { color: colors.primary }]} numberOfLines={2}>Mine</Text>
        </View>
      </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  horizontal: { flexDirection: 'row', alignItems: 'center', padding: 6, gap: 8 },
  art: { height: 112, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  horizontalArt: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  bannerImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  emoji: { fontSize: 45 },
  categories: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 },
  horizontalCategories: { flexWrap: 'nowrap', overflow: 'hidden' },
  categoryBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, borderWidth: 1, flexShrink: 0 },
  categoryText: { fontSize: 9, lineHeight: 11, fontWeight: '700' },
  details: { padding: 8, flex: 1, minWidth: 0 },
  horizontalDetails: { padding: 0, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '800', lineHeight: 16 },
  price: { maxWidth: '45%', flexShrink: 1, textAlign: 'right', fontSize: 12, lineHeight: 16, fontWeight: '800' },
  meta: { fontSize: 10, lineHeight: 12, marginTop: 2 },
  venue: { fontSize: 10, lineHeight: 12, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, minHeight: 18 },
  audience: { fontSize: 9, lineHeight: 11, flex: 1 },
  // A trailing column centers the badge without covering event text or changing card height.
  ownershipColumn: { width: 40, flexShrink: 0, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'flex-end' },
  ownershipBadge: { maxWidth: '100%', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 5 },
  ownershipText: { fontSize: 10, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
});
