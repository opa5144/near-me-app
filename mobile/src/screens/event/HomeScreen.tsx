
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem, categories } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CategoryFilter } from '../../components/CategoryFilter';
import { SearchBar } from '../../components/SearchBar';
import { useTheme } from '../../context/ThemeContext';

export function HomeScreen({ events, onOpenEvent, onSeeAll }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void; onSeeAll: () => void }) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.welcome, { color: colors.muted }]}>Welcome back, Demi 👋</Text>
      <ScreenHeader title="Discover Events" subtitle="Find something great to do nearby." />
      <SearchBar value="" onChangeText={() => {}} placeholder="⌕  Search artists, venues, or vibes..." editable={false} />
      <CategoryFilter categories={categories.slice(1)} selectedCategory={categories[1]} onSelectCategory={() => {}} />
      <View style={styles.sectionTitle}>
        <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>Top Picks</Text>
        <Text onPress={onSeeAll} style={[styles.seeAll, { color: colors.primary }]}>See All</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featured}>
        {events.slice(0, 4).map(event => (
          <View key={event.id} style={[styles.featuredCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.featuredArt, { backgroundColor: event.accent }]}>{event.emoji}</Text>
            <Text style={[styles.featuredTitle, { color: colors.text }]} numberOfLines={2}>{event.title}</Text>
            <Text style={[styles.featuredMeta, { color: colors.muted }]}>{event.date} · {event.price}</Text>
            <Text onPress={() => onOpenEvent(event)} style={[styles.detailsLink, { color: colors.primary }]}>View details →</Text>
          </View>
        ))}
      </ScrollView>
      <Text style={[styles.section, { color: colors.text }]}>Popular near you</Text>
      {events.slice(1).map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  welcome: { fontSize: 11, marginBottom: 5 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  section: { fontSize: 16, fontWeight: '900', marginBottom: 10 },
  seeAll: { fontSize: 11, fontWeight: '700' },
  featured: { gap: 12, paddingBottom: 20 },
  featuredCard: { width: 190, borderRadius: 18, padding: 10, borderWidth: 1 },
  featuredArt: { height: 105, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', fontSize: 42, color: '#FFFFFF', marginBottom: 10 },
  featuredTitle: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  featuredMeta: { fontSize: 10, marginTop: 5 },
  detailsLink: { fontSize: 11, fontWeight: '800', marginTop: 9 },
});
