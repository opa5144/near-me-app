import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../data/events';
import { useTheme } from '../context/ThemeContext';

// Helper to ensure prices display as whole dollars without decimals or cents
function formatWholeDollarPrice(price?: string | number | null): string {
  if (price === undefined || price === null) return 'Free';
  const raw = String(price).trim();
  if (!raw || raw.toLowerCase().includes('free')) return 'Free';
  const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Free';
  return `$${Math.round(numeric).toLocaleString()}`;
}

// Reused by event lists. The parent supplies the record and decides where a tap navigates.
export function EventCard({ event, onPress, horizontal = false, interestedCount, attendingCount }: {
  event: EventItem; onPress: () => void; horizontal?: boolean;
  interestedCount?: number; attendingCount?: number;
}) {
  const { colors } = useTheme();
  // Use the persisted image URL, falling back to the event emoji if loading fails.
  const [imageFailed, setImageFailed] = useState(false);
  // Reset a previous failure when this card is given a different image URL.
  useEffect(() => setImageFailed(false), [event.bannerImage]);

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, horizontal && styles.horizontal]}>
      <View style={[styles.art, { backgroundColor: event.accent }, horizontal && styles.horizontalArt]}>
        {event.bannerImage && !imageFailed ? (
          <Image source={{ uri: event.bannerImage }} style={styles.bannerImage}
            accessibilityLabel={event.title} onError={() => setImageFailed(true)} />
        ) : (
          <Text style={styles.emoji}>{event.emoji}</Text>
        )}
      </View>
      <View style={styles.details}>
        <View style={styles.categories}>
          {event.categories.map(category => <View key={category} style={[styles.categoryBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.categoryText, { color: colors.text }]}>{category}</Text>
          </View>)}
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{event.title}</Text>
        </View>
        <Text style={[styles.meta, { color: colors.primary }]}>{event.date} · {event.time}</Text>
        <Text style={[styles.price, { color: colors.primary }]}>{formatWholeDollarPrice(event.price)}</Text>
        <Text style={[styles.venue, { color: colors.muted }]} numberOfLines={1}>⌖ {event.venue}</Text>
        {interestedCount !== undefined && <Text style={[styles.audience, { color: colors.muted }]}>
          {interestedCount} interested{attendingCount !== undefined ? ` · ${attendingCount} attending` : ''}
        </Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 11 },
  horizontal: { flexDirection: 'row', alignItems: 'center', padding: 9, gap: 11 },
  art: { height: 128, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  horizontalArt: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden' },
  bannerImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  emoji: { fontSize: 45 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 5 },
  categoryBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  categoryText: { fontSize: 9, fontWeight: '700' },
  details: { padding: 11, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  price: { fontSize: 12, fontWeight: '800', marginTop: 5 },
  meta: { fontSize: 10, marginTop: 5 },
  venue: { fontSize: 10, marginTop: 4 },
  audience: { fontSize: 10, marginTop: 6 },
});