import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../data/events';
import { useTheme } from '../context/ThemeContext';

export function EventCard({ event, onPress, horizontal = false }: { event: EventItem; onPress: () => void; horizontal?: boolean }) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, horizontal && styles.horizontal]}>
      <View style={[styles.art, { backgroundColor: event.accent }, horizontal && styles.horizontalArt]}>
        {event.bannerImage ? (
          <Image source={{ uri: event.bannerImage }} style={styles.bannerImage} />
        ) : (
          <Text style={styles.emoji}>{event.emoji}</Text>
        )}
        <View style={[styles.artBadge, { backgroundColor: colors.surface }]}>
          <Text style={[styles.artBadgeText, { color: colors.text }]}>{event.category}</Text>
        </View>
      </View>
      <View style={styles.details}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{event.title}</Text>
          <Text style={[styles.price, { color: colors.primary }]}>{event.price}</Text>
        </View>
        <Text style={[styles.meta, { color: colors.primary }]}>{event.date} · {event.time}</Text>
        <Text style={[styles.venue, { color: colors.muted }]} numberOfLines={1}>⌖ {event.venue}</Text>
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
  artBadge: { position: 'absolute', left: 9, top: 9, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, zIndex: 2 },
  artBadgeText: { fontSize: 9, fontWeight: '700' },
  details: { padding: 11, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  price: { fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 10, marginTop: 5 },
  venue: { fontSize: 10, marginTop: 4 },
});