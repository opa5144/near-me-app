import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';
import { fetchMyStores } from '../../api/stores';
import type { StoreItem } from '../../api/stores';

function StoreCard({ store, onPress }: { store: StoreItem; onPress: () => void }) {
  const { colors } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={'View ' + store.name}
    style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    {store.bannerImage && !imageFailed ? <Image source={{ uri: store.bannerImage }} style={styles.storeImage} onError={() => setImageFailed(true)} />
      : <View style={[styles.storeImage, styles.storePlaceholder]}><AppText style={{ fontSize: 32 }}>🏪</AppText></View>}
    <View style={styles.storeText}>
      <AppText variant="bodyLarge" color={colors.text} style={{ fontWeight: '800' }}>{store.name}</AppText>
      <AppText variant="bodyMedium" color={colors.primary}>{store.categories.join(' · ')}</AppText>
      <AppText variant="bodyMedium" color={colors.muted}>{store.address}</AppText>
    </View>
  </Pressable>;
}

export function EventHostScreen({ events, onOpenEvent, onCreateEvent, onCreateStore, onOpenStore }: {
  events: EventItem[];
  onOpenEvent: (event: EventItem) => void;
  onCreateEvent: () => void;
  onCreateStore: () => void;
  onOpenStore: (store: StoreItem) => void;
}) {
  const { colors, theme } = useTheme();
  const { refreshEvents, isLoading } = useEvents();
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [storeAttempt, setStoreAttempt] = useState(0);

  // Other accounts can change their choices while this screen is away.
  useFocusEffect(useCallback(() => {
    void refreshEvents();
  }, [refreshEvents]));

  // Reload on returning from Create Store; ownership is filtered by the backend session.
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setStoresLoading(true);
    setStoresError(null);
    setStores([]);
    void fetchMyStores(controller.signal)
      .then(saved => { if (active) setStores(saved); })
      .catch(() => {
        if (active && !controller.signal.aborted) setStoresError('Unable to load your stores. Please try again.');
      })
      .finally(() => { if (active) setStoresLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [storeAttempt]));

  const totalEvents = events.length;
  const totalInterested = events.reduce((total, event) => total + (event.interestedCount ?? 0), 0);
  const totalAttending = events.reduce((total, event) => total + (event.attendingCount ?? 0), 0);
  
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} tintColor={colors.primary} colors={[colors.primary]}
        onRefresh={() => { void refreshEvents(); setStoreAttempt(current => current + 1); }} />}>
      <ScreenHeader eyebrow="Your hosting" title="Host Dashboard" subtitle="Manage and monitor your events and stores." />
      
      <View style={styles.actionRow}>
        <AppButton title="+  Create Event" onPress={onCreateEvent} style={styles.halfButton} />
        <AppButton title="+  Create Store" onPress={onCreateStore} style={styles.halfButton} />
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Overview</AppText>
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={styles.valueToken}>{totalEvents}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>TOTAL EVENTS</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={styles.valueToken}>{isLoading ? '…' : totalAttending}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>ATTENDING</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={styles.valueToken}>{isLoading ? '…' : totalInterested}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>INTERESTED</AppText>
        </View>
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Your Events</AppText>
      {events.length ? events.map(event => {
        return (
          <EventCard
            key={event.id}
            event={event}
            horizontal
            interestedCount={event.interestedCount}
            attendingCount={event.attendingCount}
            onPress={() => onOpenEvent(event)}
          />
        );
      }) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>You have no events to display.</AppText>}
      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text, marginTop: 24 }]}>Your Stores</AppText>
      {storesLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : storesError ? <View>
        <AppText accessibilityRole="alert" color={theme === 'dark' ? '#FF8A80' : '#C62828'}>{storesError}</AppText>
        <AppButton title="Retry stores" variant="secondary" onPress={() => setStoreAttempt(current => current + 1)} style={{ marginTop: 12 }} />
      </View> : stores.length ? stores.map(store => <StoreCard key={store.id} store={store} onPress={() => onOpenStore(store)} />)
        : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>You have no stores yet. Create a store to publish your business.</AppText>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  metricsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: 'center' },
  valueToken: { fontWeight: '900', fontSize: 18 },
  labelToken: { fontSize: 9, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  halfButton: { flex: 1 },
  section: { fontWeight: '900', marginBottom: 12, marginTop: 4 },
  empty: { lineHeight: 19, marginTop: 4 },
  storeCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  storeImage: { width: 90, minHeight: 105 },
  storePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  storeText: { flex: 1, padding: 12, gap: 5 },
});
