import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EventItem, categories } from '../data/events';
import { EventCard } from '../components/EventCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../data/theme';

export function SearchScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const filtered = useMemo(() => events.filter(event =>
    (category === 'All' || event.category === category) &&
    `${event.title} ${event.venue} ${event.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [events, category, query]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader eyebrow="Discover something new" title="What do you want to do?" subtitle="Search by activity, place, or mood." />
      <TextInput value={query} onChangeText={setQuery} placeholder="Try “live music” or “pottery”" placeholderTextColor={colors.muted} style={styles.search} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {categories.map(item => <Text key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.activeChip]}>{item}</Text>)}
      </ScrollView>
      <View style={styles.resultsHeader}><Text style={styles.results}>Events near you</Text><Text style={styles.count}>{filtered.length} results</Text></View>
      {filtered.length ? filtered.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <Text style={styles.empty}>No events match that search. Try another term or category.</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  search: { height: 46, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, fontSize: 12, marginBottom: 13 },
  chips: { gap: 8, paddingBottom: 20 },
  chip: { overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9, color: colors.text, fontSize: 11, fontWeight: '700' },
  activeChip: { backgroundColor: colors.primary, color: '#FFFFFF', borderColor: colors.primary },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  results: { color: colors.text, fontSize: 15, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 11 },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: 24, lineHeight: 20 },
});
