
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem, categories } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CategoryFilter } from '../../components/CategoryFilter';
import { SearchBar } from '../../components/SearchBar';
import { useTheme } from '../../context/ThemeContext';

export function SearchScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = useMemo(() => events.filter(event =>
    (category === 'All' || event.category === category) &&
    `${event.title} ${event.venue} ${event.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [events, category, query]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader eyebrow="Discover something new" title="What do you want to do?" subtitle="Search by activity, place, or mood." />
      <SearchBar value={query} onChangeText={setQuery} placeholder="Try “live music” or “pottery”" />
      <CategoryFilter categories={categories} selectedCategory={category} onSelectCategory={setCategory} />
      <View style={styles.resultsHeader}>
        <Text style={[styles.results, { color: colors.text }]}>Events near you</Text>
        <Text style={[styles.count, { color: colors.muted }]}>{filtered.length} results</Text>
      </View>
      {filtered.length ? filtered.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <Text style={[styles.empty, { color: colors.muted }]}>No events match that search. Try another term or category.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  results: { fontSize: 15, fontWeight: '900' },
  count: { fontSize: 11 },
  empty: { fontSize: 13, paddingVertical: 24, lineHeight: 20 },
});
