import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EventItem, categories } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function HomeScreen({ events, onOpenEvent, onSeeAll }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void; onSeeAll: () => void }) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.welcome, { color: colors.muted }]}>Welcome back, Demi 👋</Text>
      <ScreenHeader title="Discover Events" subtitle="Find something great to do nearby." />
      <TextInput placeholder="⌕  Search artists, venues, or vibes..." placeholderTextColor={colors.muted} style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} editable={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {categories.slice(1).map((category, index) => (
          <View 
            key={category} 
            style={[
              styles.chip, 
              { backgroundColor: colors.surface, borderColor: colors.border }, 
              index === 0 && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }, index === 0 && styles.selectedText]}>{category}</Text>
          </View>
        ))}
      </ScrollView>
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
  search: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 12, marginBottom: 14 },
  chips: { gap: 8, paddingBottom: 20 },
  chip: { borderWidth: 1, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '700' },
  selectedText: { color: '#FFFFFF' },
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