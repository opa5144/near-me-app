import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EventItem, categories } from '../data/events';
import { EventCard } from '../components/EventCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../data/theme';

export function HomeScreen({ events, onOpenEvent, onSeeAll }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void; onSeeAll: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.welcome}>Welcome back, Alex 👋</Text>
      <ScreenHeader title="Discover Events" subtitle="Find something great to do nearby." />
      <TextInput placeholder="⌕  Search artists, venues, or vibes..." placeholderTextColor={colors.muted} style={styles.search} editable={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {categories.slice(1).map((category, index) => <View key={category} style={[styles.chip, index === 0 && styles.selectedChip]}><Text style={[styles.chipText, index === 0 && styles.selectedText]}>{category}</Text></View>)}
      </ScrollView>
      <View style={styles.sectionTitle}><Text style={styles.section}>Top Picks</Text><Text onPress={onSeeAll} style={styles.seeAll}>See All</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featured}>
        {events.slice(0, 4).map(event => (
          <View key={event.id} style={styles.featuredCard}>
            <Text style={[styles.featuredArt, { backgroundColor: event.accent }]}>{event.emoji}</Text>
            <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
            <Text style={styles.featuredMeta}>{event.date} · {event.price}</Text>
            <Text onPress={() => onOpenEvent(event)} style={styles.detailsLink}>View details →</Text>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.section}>Popular near you</Text>
      {events.slice(1).map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />)}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  welcome: { color: colors.muted, fontSize: 11, marginBottom: 5 },
  search: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, fontSize: 12, marginBottom: 14 },
  chips: { gap: 8, paddingBottom: 20 },
  chip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 20 },
  selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  selectedText: { color: '#FFFFFF' },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  section: { fontSize: 16, color: colors.text, fontWeight: '900', marginBottom: 10 },
  seeAll: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  featured: { gap: 12, paddingBottom: 20 },
  featuredCard: { width: 190, backgroundColor: colors.surface, borderRadius: 18, padding: 10, borderWidth: 1, borderColor: colors.border },
  featuredArt: { height: 105, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', fontSize: 42, color: '#FFFFFF', marginBottom: 10 },
  featuredTitle: { color: colors.text, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  featuredMeta: { color: colors.muted, fontSize: 10, marginTop: 5 },
  detailsLink: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 9 },
});
