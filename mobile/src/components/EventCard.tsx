import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../data/events';
import { colors } from '../data/theme';

export function EventCard({ event, onPress, horizontal = false }: { event: EventItem; onPress: () => void; horizontal?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.card, horizontal && styles.horizontal]}>
      <View style={[styles.art, { backgroundColor: event.accent }, horizontal && styles.horizontalArt]}>
        <Text style={styles.emoji}>{event.emoji}</Text>
        <View style={styles.artBadge}><Text style={styles.artBadgeText}>{event.category}</Text></View>
      </View>
      <View style={styles.details}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.price}>{event.price}</Text>
        </View>
        <Text style={styles.meta}>{event.date} · {event.time}</Text>
        <Text style={styles.venue} numberOfLines={1}>⌖ {event.venue}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 11 },
  horizontal: { flexDirection: 'row', alignItems: 'center', padding: 9, gap: 11 },
  art: { height: 128, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  horizontalArt: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden' },
  emoji: { fontSize: 45 },
  artBadge: { position: 'absolute', left: 9, top: 9, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9 },
  artBadgeText: { color: colors.text, fontSize: 9, fontWeight: '700' },
  details: { padding: 11, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  price: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  meta: { color: colors.primary, fontSize: 10, marginTop: 5 },
  venue: { color: colors.muted, fontSize: 10, marginTop: 4 },
});
