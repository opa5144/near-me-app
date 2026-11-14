import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={'View ' + store.name}
      style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {store.bannerImage && !imageFailed ? (
        <Image source={{ uri: store.bannerImage }} style={styles.storeImage} onError={() => setImageFailed(true)} />
      ) : (
        <View style={[styles.storeImage, styles.storePlaceholder]}>
          <AppText style={{ fontSize: 32 }}>🏪</AppText>
        </View>
      )}
      <View style={styles.storeText}>
        <AppText variant="bodyLarge" color={colors.text} style={{ fontWeight: '800' }}>{store.name}</AppText>
        <AppText variant="bodyMedium" color={colors.primary}>{store.categories.join(' · ')}</AppText>
        <AppText variant="bodyMedium" color={colors.muted}>{store.address}</AppText>
      </View>
    </Pressable>
  );
}

// Helper to extract whole dollar amount from price strings like "$25", "$25.00", or "Free"
function parseEventPrice(price?: string): number {
  if (!price || price.toLowerCase().includes('free')) return 0;
  const numeric = parseFloat(price.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
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

  const revenueColor = theme === 'dark' ? '#69F0AE' : '#1B873F';

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

  // Full portfolio stats and top-performer rankings
  const analytics = useMemo(() => {
    const totalEvents = events.length;
    const totalInterested = events.reduce((sum, e) => sum + (e.interestedCount ?? 0), 0);
    const totalAttending = events.reduce((sum, e) => sum + (e.attendingCount ?? 0), 0);

    const enriched = events.map(e => {
      const attending = e.attendingCount ?? 0;
      const interested = e.interestedCount ?? 0;
      const revenue = parseEventPrice(e.price) * attending;
      const rsvpRate = interested > 0 ? Math.round((attending / interested) * 100) : attending > 0 ? 100 : 0;
      return { event: e, attending, interested, revenue, rsvpRate };
    });

    const estRevenue = enriched.reduce((sum, item) => sum + item.revenue, 0);
    const conversionRate = totalInterested > 0
      ? Math.round((totalAttending / totalInterested) * 100)
      : totalAttending > 0 ? 100 : 0;

    // Best performers across categories
    const topEarner = [...enriched].sort((a, b) => b.revenue - a.revenue)[0] ?? null;
    const mostAttended = [...enriched].sort((a, b) => b.attending - a.attending)[0] ?? null;
    const bestConverter = [...enriched]
      .filter(item => item.attending > 0)
      .sort((a, b) => b.rsvpRate - a.rsvpRate)[0] ?? null;

    // Lowest-traction event needing reach assistance
    const lowReachItem = [...enriched]
      .sort((a, b) => (a.attending + a.interested) - (b.attending + b.interested))
      .find(item => item.attending === 0 && item.interested < 3) ?? null;

    return {
      totalEvents,
      totalInterested,
      totalAttending,
      estRevenue,
      conversionRate,
      topEarner,
      mostAttended,
      bestConverter,
      lowReachItem,
    };
  }, [events]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          tintColor={colors.primary}
          colors={[colors.primary]}
          onRefresh={() => { void refreshEvents(); setStoreAttempt(current => current + 1); }}
        />
      }
    >
      <ScreenHeader eyebrow="Your hosting" title="Host Dashboard" subtitle="Manage and monitor your events and stores." />

      <View style={styles.actionRow}>
        <AppButton title="+  Create Event" onPress={onCreateEvent} style={styles.halfButton} />
        <AppButton title="+  Create Store" onPress={onCreateStore} style={styles.halfButton} />
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Performance & Revenue</AppText>

      {/* Row 1: Financial & Attendance Highlights */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: revenueColor }]}>
            {isLoading ? '…' : `$${analytics.estRevenue.toLocaleString()}`}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>TOTAL EST. REVENUE</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.primary }]}>
            {isLoading ? '…' : analytics.totalAttending}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>ATTENDING</AppText>
        </View>
      </View>

      {/* Row 2: Secondary Engagement Metrics */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.text }]}>{analytics.totalEvents}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>ACTIVE EVENTS</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.text }]}>
            {isLoading ? '…' : analytics.totalInterested}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>INTERESTED</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.text }]}>
            {isLoading ? '…' : `${analytics.conversionRate}%`}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>RSVP RATE</AppText>
        </View>
      </View>

      {/* Reach & Growth Assistant: Full Stats + Top Performers Leaderboard */}
      <View style={[styles.assistantCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
        <View style={styles.assistantHeader}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <AppText style={[styles.assistantEyebrow, { color: colors.primary }]}>REACH & STATS ASSISTANT</AppText>
        </View>

        {!events.length ? (
          <>
            <AppText style={[styles.assistantTitle, { color: colors.text }]}>Launch your first event</AppText>
            <AppText style={[styles.assistantBody, { color: colors.muted }]}>
              Events with whole-dollar pricing, local venue addresses, and 2+ photos get 3x more RSVPs.
            </AppText>
            <Pressable onPress={onCreateEvent}>
              <AppText style={[styles.assistantAction, { color: colors.primary }]}>Create an event ›</AppText>
            </Pressable>
          </>
        ) : (
          <>
            {/* Top Performers Breakdown */}
            <View style={[styles.leaderboard, { borderBottomColor: colors.border }]}>
              {analytics.topEarner && analytics.topEarner.revenue > 0 && (
                <Pressable onPress={() => onOpenEvent(analytics.topEarner!.event)} style={styles.leaderRow}>
                  <View style={styles.leaderLabelGroup}>
                    <Ionicons name="cash-outline" size={14} color={revenueColor} />
                    <AppText style={[styles.leaderTag, { color: colors.muted }]}>Top Earner</AppText>
                  </View>
                  <AppText numberOfLines={1} style={[styles.leaderEvent, { color: colors.text }]}>
                    {analytics.topEarner.event.title}
                  </AppText>
                  <AppText style={[styles.leaderStat, { color: revenueColor }]}>
                    ${analytics.topEarner.revenue.toLocaleString()}
                  </AppText>
                </Pressable>
              )}

              {analytics.mostAttended && analytics.mostAttended.attending > 0 && (
                <Pressable onPress={() => onOpenEvent(analytics.mostAttended!.event)} style={styles.leaderRow}>
                  <View style={styles.leaderLabelGroup}>
                    <Ionicons name="people-outline" size={14} color={colors.primary} />
                    <AppText style={[styles.leaderTag, { color: colors.muted }]}>Most Attended</AppText>
                  </View>
                  <AppText numberOfLines={1} style={[styles.leaderEvent, { color: colors.text }]}>
                    {analytics.mostAttended.event.title}
                  </AppText>
                  <AppText style={[styles.leaderStat, { color: colors.primary }]}>
                    {analytics.mostAttended.attending} going
                  </AppText>
                </Pressable>
              )}

              {analytics.bestConverter && (
                <Pressable onPress={() => onOpenEvent(analytics.bestConverter!.event)} style={styles.leaderRow}>
                  <View style={styles.leaderLabelGroup}>
                    <Ionicons name="trending-up-outline" size={14} color={colors.primary} />
                    <AppText style={[styles.leaderTag, { color: colors.muted }]}>Best Conversion</AppText>
                  </View>
                  <AppText numberOfLines={1} style={[styles.leaderEvent, { color: colors.text }]}>
                    {analytics.bestConverter.event.title}
                  </AppText>
                  <AppText style={[styles.leaderStat, { color: colors.text }]}>
                    {analytics.bestConverter.rsvpRate}%
                  </AppText>
                </Pressable>
              )}

              {(!analytics.mostAttended || analytics.mostAttended.attending === 0) && (
                <AppText style={[styles.assistantBody, { color: colors.muted, marginBottom: 4 }]}>
                  No confirmed RSVPs yet across {analytics.totalEvents} active {analytics.totalEvents === 1 ? 'event' : 'events'}.
                </AppText>
              )}
            </View>

            {/* Actionable Growth Recommendation */}
            {analytics.lowReachItem ? (
              <Pressable onPress={() => onOpenEvent(analytics.lowReachItem!.event)} style={styles.tipBox}>
                <AppText style={[styles.assistantTitle, { color: colors.text }]}>
                  Boost reach for "{analytics.lowReachItem.event.title}"
                </AppText>
                <AppText style={[styles.assistantBody, { color: colors.muted }]}>
                  Currently at {analytics.lowReachItem.interested} interested and 0 attending. Add gallery photos or share the invite link to build momentum.
                </AppText>
                <AppText style={[styles.assistantAction, { color: colors.primary }]}>
                  Review & optimize event ›
                </AppText>
              </Pressable>
            ) : (
              <View style={styles.tipBox}>
                <AppText style={[styles.assistantBody, { color: colors.muted, marginBottom: 0 }]}>
                  All {analytics.totalEvents} events have active engagement ({analytics.totalInterested} interested · {analytics.totalAttending} attending).
                </AppText>
              </View>
            )}
          </>
        )}
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Your Events</AppText>
      {events.length ? events.map(event => (
        <EventCard
          key={event.id}
          event={event}
          horizontal
          interestedCount={event.interestedCount}
          attendingCount={event.attendingCount}
          onPress={() => onOpenEvent(event)}
        />
      )) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>You have no events to display.</AppText>}

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text, marginTop: 24 }]}>Your Stores</AppText>
      {storesLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : storesError ? (
        <View>
          <AppText accessibilityRole="alert" color={theme === 'dark' ? '#FF8A80' : '#C62828'}>{storesError}</AppText>
          <AppButton title="Retry stores" variant="secondary" onPress={() => setStoreAttempt(current => current + 1)} style={{ marginTop: 12 }} />
        </View>
      ) : stores.length ? stores.map(store => <StoreCard key={store.id} store={store} onPress={() => onOpenStore(store)} />)
        : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>You have no stores yet. Create a store to publish your business.</AppText>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  metricsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metricCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  valueToken: { fontWeight: '900', fontSize: 18 },
  labelToken: { fontSize: 9, fontWeight: '800', marginTop: 3, textAlign: 'center', letterSpacing: 0.4 },
  assistantCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 4, marginBottom: 20 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  assistantEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  leaderboard: { borderBottomWidth: 1, paddingBottom: 10, marginBottom: 10, gap: 8 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaderLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 112 },
  leaderTag: { fontSize: 11, fontWeight: '700' },
  leaderEvent: { flex: 1, fontSize: 12, fontWeight: '800' },
  leaderStat: { fontSize: 12, fontWeight: '900' },
  tipBox: { paddingTop: 2 },
  assistantTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  assistantBody: { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  assistantAction: { fontSize: 12, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  halfButton: { flex: 1 },
  section: { fontWeight: '900', marginBottom: 10, marginTop: 4 },
  empty: { lineHeight: 19, marginTop: 4 },
  storeCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  storeImage: { width: 90, minHeight: 105 },
  storePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  storeText: { flex: 1, padding: 12, gap: 5 },
});