
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { EventItem, categories } from '../../data/events';
import type { StoreItem } from '../../api/stores';
import { fetchStores } from '../../api/stores';

import { EventCard } from '../../components/EventCard';
import { StoreCard } from '../../components/StoreCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CategoryFilter } from '../../components/CategoryFilter';
import { ContentTypeFilter } from '../../components/ContentTypeFilter';
import type { ContentType } from '../../components/ContentTypeFilter';
import { SearchBar } from '../../components/SearchBar';
import { AppButton } from '../../components/AppButton';

import { useTheme } from '../../context/ThemeContext';

export function SearchScreen({
  events,
  onOpenEvent,
  onOpenStore
}: {
  events: EventItem[]
  onOpenEvent: (event: EventItem) => void
  onOpenStore: (store: StoreItem) => void
}) {
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<ContentType>('All');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    void fetchStores(controller.signal)
      .then(savedStores => {
        if (active) setStores(savedStores);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setError('Unable to load stores. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]));

  const toggleCategory = (category: string) => {
    if (category === 'All') {
      setSelectedCategories([]);
      return;
    }

    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(item => item !== category)
        : [...prev, category]
    );
  };

  const handleSelectType = (type: ContentType) => {
    setSelectedType(type);
    setSelectedCategories([]);
  };

  const filteredEvents = useMemo(() => {
    if (selectedType === 'Stores') return [];

    return events.filter(event =>
      (selectedCategories.length === 0 ||
        event.categories.some(category => selectedCategories.includes(category))) &&
      `${event.title} ${event.description} ${event.venue} ${event.address} ${event.categories.join(' ')}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  }, [events, selectedCategories, selectedType, query]);

  const filteredStores = useMemo(() => {
    if (selectedType === 'Events') return [];

    return stores.filter(store =>
      (selectedCategories.length === 0 ||
        store.categories.some(category => selectedCategories.includes(category))) &&
      `${store.name} ${store.description} ${store.address} ${store.categories.join(' ')}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  }, [stores, selectedCategories, selectedType, query]);

  const results = useMemo(() => [
    ...filteredEvents.map(event => ({ type: 'event' as const, item: event })),
    ...filteredStores.map(store => ({ type: 'store' as const, item: store })),
  ], [filteredEvents, filteredStores]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          eyebrow="Discover something new"
          title="What do you want to do?"
          subtitle="Search by activity, place, or mood."
        />

        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Try 'live music' or 'pottery'"
        />

        <ContentTypeFilter
          selectedType={selectedType}
          onSelectType={handleSelectType}
        />

        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategories}
          onSelectCategory={toggleCategory}
        />

        <View style={styles.resultsHeader}>
          <Text style={[styles.results, { color: colors.text }]}>
            {selectedType === 'All' ? 'Stores and events' : selectedType}
          </Text>

          <Text style={[styles.count, { color: colors.muted }]}>
            {results.length} results
          </Text>
        </View>

        {loading && selectedType !== 'Events' ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ paddingVertical: 24 }}
          />
        ) : error && selectedType !== 'Events' ? (
          <View>
            <Text style={[styles.empty, { color: colors.muted }]}>
              {error}
            </Text>

            <AppButton
              title="Retry"
              variant="secondary"
              onPress={() => setAttempt(current => current + 1)}
            />
          </View>
        ) : results.length > 0 ? (
          results.map(result => result.type === 'event' ? (
            <EventCard
              key={`event-${result.item.id}`}
              event={result.item}
              horizontal
              onPress={() => onOpenEvent(result.item)}
            />
          ) : (
            <StoreCard
              key={`store-${result.item.id}`}
              store={result.item}
              horizontal
              onPress={() => onOpenStore(result.item)}
            />
          ))
        ) : (
          <Text style={[styles.empty, { color: colors.muted }]}>
            No results match that search. Try another term or category.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  results: { fontSize: 15, fontWeight: '900' },
  count: { fontSize: 11 },
  empty: { fontSize: 13, paddingVertical: 24, lineHeight: 20 },
});
