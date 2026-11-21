import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';
import { useUserData } from '../../context/UserDataContext';
import type { StoreItem } from '../../api/stores';
import { estimatedRevenueCents, formatCurrency } from '../../utils/eventPrice';

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

export function EventHostScreen({ events, onOpenEvent, onCreateEvent, onCreateStore, onOpenStore }: {
  events: EventItem[];
  onOpenEvent: (event: EventItem) => void;
  onCreateEvent: () => void;
  onCreateStore: () => void;
  onOpenStore: (store: StoreItem) => void;
}) {
  const { colors, theme } = useTheme();
  const { refreshEvents, isLoading: eventsLoading } = useEvents();
  const { stores, storesError, storesLoading, refreshStores } = useUserData();
  const [refreshing, setRefreshing] = useState(false);
  const [eventFilter, setEventFilter] = useState<'active' | 'completed' | 'archived' | 'drafts'>('active');
  const [clockNow, setClockNow] = useState(Date.now());

  // Cached reads are shared; returning here refreshes only once they are stale.
  useFocusEffect(useCallback(() => { void refreshStores(); }, [refreshStores]));

  // Move open cards to Completed at their actual end instant, including when
  // the app resumes. Only the focused host screen keeps a clock running.
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const updateClock = () => {
      if (timer) clearTimeout(timer);
      const current = Date.now();
      setClockNow(current);
      const nextEnd = events.reduce((next, event) => {
        const end = Date.parse(event.endsAt);
        return Number.isFinite(end) && end > current ? Math.min(next, end) : next;
      }, current + 60000);
      timer = setTimeout(updateClock, Math.max(1, nextEnd - current));
    };
    updateClock();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') updateClock(); });
    return () => { if (timer) clearTimeout(timer); listener.remove(); };
  }, [events]));

  const eventGroups = useMemo(() => {
    const active: EventItem[] = [];
    const completed: EventItem[] = [];
    const archived: EventItem[] = [];
    const drafts: EventItem[] = [];
    for (const event of events) {
      const end = Date.parse(event.endsAt);
      if (event.status === 'draft') drafts.push(event);
      else if (event.status === 'cancelled' || event.status === 'archived') archived.push(event);
      else if (event.storage === 'past' || Number.isFinite(end) && end <= clockNow) completed.push(event);
      else active.push(event);
    }
    active.sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt));
    completed.sort((first, second) => Date.parse(second.endsAt) - Date.parse(first.endsAt));
    archived.sort((first, second) => Date.parse(second.archivedAt || second.cancelledAt || second.endsAt) - Date.parse(first.archivedAt || first.cancelledAt || first.endsAt));
    return { active, completed, archived, drafts };
  }, [events, clockNow]);
  const visibleEvents = eventGroups[eventFilter];

  const revenueColor = theme === 'dark' ? '#69F0AE' : '#1B873F';

  const onPullToRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshEvents(),
      refreshStores(true),
    ]);
    setRefreshing(false);
  };

  // Full portfolio stats and top-performer rankings
  const analytics = useMemo(() => {
    // Unpublished drafts have no audience and do not affect portfolio performance.
    const published = events.filter(event => event.status !== 'draft');
    const totalEvents = published.length;
    const totalInterested = published.reduce((sum, e) => sum + (e.interestedCount ?? 0), 0);
    const totalAttending = published.reduce((sum, e) => sum + (e.attendingCount ?? 0), 0);
    const now = clockNow;
    const upcomingEvents = published.filter(event => event.status !== 'cancelled' && event.status !== 'archived' && Date.parse(event.startsAt) > now).length;

    const enriched = published.map(e => {
      const attending = e.attendingCount ?? 0;
      const interested = e.interestedCount ?? 0;
      const revenueCents = e.status === 'cancelled' || e.status === 'archived' ? 0 : estimatedRevenueCents(e, attending);
      return { event: e, attending, interested, revenueCents };
    });

    const estRevenueCents = enriched.some(item => item.revenueCents === null)
      ? null : enriched.reduce((sum, item) => sum + (item.revenueCents ?? 0), 0);

    // Best performers across categories
    const topEarner = enriched.filter(item => item.revenueCents !== null)
      .sort((a, b) => (b.revenueCents ?? 0) - (a.revenueCents ?? 0))[0] ?? null;
    const mostAttended = [...enriched].sort((a, b) => b.attending - a.attending)[0] ?? null;
    const mostInterested = [...enriched].filter(item => item.interested > 0)
      .sort((a, b) => b.interested - a.interested)[0] ?? null;

    // Lowest-traction event needing reach assistance
    const lowReachItem = [...enriched]
      .filter(item => item.event.status !== 'cancelled' && item.event.status !== 'archived' && Date.parse(item.event.endsAt) > now)
      .sort((a, b) => (a.attending + a.interested) - (b.attending + b.interested))
      .find(item => item.attending === 0 && item.interested < 3) ?? null;

    return {
      totalEvents,
      totalInterested,
      totalAttending,
      estRevenueCents,
      upcomingEvents,
      topEarner,
      mostAttended,
      mostInterested,
      lowReachItem,
    };
  }, [events, clockNow]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          colors={[colors.primary]}
          onRefresh={onPullToRefresh}
        />
      }
    >
      <ScreenHeader eyebrow="Your hosting" title="Host Dashboard" subtitle="Manage and monitor your events and stores." />

      <View style={styles.actionRow}>
        <AppButton title="+  Create Event" onPress={onCreateEvent} style={styles.halfButton} />
        <AppButton title="+  Create Store" onPress={onCreateStore} style={styles.halfButton} />
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Performance & Revenue</AppText>
      <AppText color={colors.muted} style={styles.assistantBody}>
        Revenue estimates use ticket prices and registrations. They do not represent recorded payments.
      </AppText>

      {/* Row 1: Financial & Attendance Highlights */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: revenueColor }]}>
            {eventsLoading && events.length === 0 ? '…' : analytics.estRevenueCents === null ? '—' : formatCurrency(analytics.estRevenueCents / 100)}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>TOTAL EST. REVENUE</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.primary }]}>
            {eventsLoading && events.length === 0 ? '…' : analytics.totalAttending}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>ATTENDING</AppText>
        </View>
      </View>

      {/* Row 2: Secondary Engagement Metrics */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.text }]}>{analytics.totalEvents}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>TOTAL EVENTS</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.text }]}>
            {eventsLoading && events.length === 0 ? '…' : analytics.totalInterested}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>INTERESTED</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.text }]}>
            {eventsLoading && events.length === 0 ? '…' : analytics.upcomingEvents}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>UPCOMING EVENTS</AppText>
        </View>
      </View>

      {/* Reach & Growth Assistant: Full Stats + Top Performers Leaderboard */}
      <View style={[styles.assistantCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
        <View style={styles.assistantHeader}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <AppText style={[styles.assistantEyebrow, { color: colors.primary }]}>REACH & STATS ASSISTANT</AppText>
        </View>

        {!analytics.totalEvents ? (
          <>
            <AppText style={[styles.assistantTitle, { color: colors.text }]}>Launch your first event</AppText>
            <AppText style={[styles.assistantBody, { color: colors.muted }]}>
              Add your event details, a venue address, and photos so people can decide whether to attend.
            </AppText>
            <Pressable onPress={onCreateEvent}>
              <AppText style={[styles.assistantAction, { color: colors.primary }]}>Create an event ›</AppText>
            </Pressable>
          </>
        ) : (
          <>
            {/* Top Performers Breakdown */}
            <View style={[styles.leaderboard, { borderBottomColor: colors.border }]}>
              {analytics.topEarner && (analytics.topEarner.revenueCents ?? 0) > 0 && (
                <Pressable onPress={() => onOpenEvent(analytics.topEarner!.event)} style={styles.leaderRow}>
                  <View style={styles.leaderLabelGroup}>
                    <Ionicons name="cash-outline" size={14} color={revenueColor} />
                    <AppText style={[styles.leaderTag, { color: colors.muted }]}>Top Estimate</AppText>
                  </View>
                  <AppText numberOfLines={1} style={[styles.leaderEvent, { color: colors.text }]}>
                    {analytics.topEarner.event.title}
                  </AppText>
                  <AppText style={[styles.leaderStat, { color: revenueColor }]}>
                    {formatCurrency((analytics.topEarner.revenueCents ?? 0) / 100)}
                  </AppText>
                </Pressable>
              )}

              {analytics.mostAttended && analytics.mostAttended.attending > 0 && (
                <Pressable onPress={() => onOpenEvent(analytics.mostAttended!.event)} style={styles.leaderRow}>
                  <View style={styles.leaderLabelGroup}>
                    <Ionicons name="people-outline" size={14} color={colors.primary} />
                    <AppText style={[styles.leaderTag, { color: colors.muted }]}>Most Booked</AppText>
                  </View>
                  <AppText numberOfLines={1} style={[styles.leaderEvent, { color: colors.text }]}>
                    {analytics.mostAttended.event.title}
                  </AppText>
                  <AppText style={[styles.leaderStat, { color: colors.primary }]}>
                    {analytics.mostAttended.attending} going
                  </AppText>
                </Pressable>
              )}

              {analytics.mostInterested && (
                <Pressable onPress={() => onOpenEvent(analytics.mostInterested!.event)} style={styles.leaderRow}>
                  <View style={styles.leaderLabelGroup}>
                    <Ionicons name="trending-up-outline" size={14} color={colors.primary} />
                    <AppText style={[styles.leaderTag, { color: colors.muted }]}>Most Interest</AppText>
                  </View>
                  <AppText numberOfLines={1} style={[styles.leaderEvent, { color: colors.text }]}>
                    {analytics.mostInterested.event.title}
                  </AppText>
                  <AppText style={[styles.leaderStat, { color: colors.text }]}>
                    {analytics.mostInterested.interested} interested
                  </AppText>
                </Pressable>
              )}

              {(!analytics.mostAttended || analytics.mostAttended.attending === 0) && (
                <AppText style={[styles.assistantBody, { color: colors.muted, marginBottom: 4 }]}>
                  No registrations yet across {analytics.totalEvents} {analytics.totalEvents === 1 ? 'event' : 'events'}.
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
                  Your {analytics.totalEvents} events have {analytics.totalInterested} interested choices and {analytics.totalAttending} registrations.
                </AppText>
              </View>
            )}
          </>
        )}
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Your Events</AppText>
      <View style={[styles.eventFilters, { borderColor: colors.border }]} accessibilityRole="tablist">
        {(['active', 'completed', 'archived', 'drafts'] as const).map(filter => <Pressable key={filter}
          accessibilityRole="tab" accessibilityState={{ selected: eventFilter === filter }}
          accessibilityLabel={`${filter} events, ${eventGroups[filter].length}`}
          onPress={() => setEventFilter(filter)}
          style={[styles.eventFilter, { backgroundColor: eventFilter === filter ? colors.primary : colors.surface }]}>
          <AppText style={styles.eventFilterLabel} color={eventFilter === filter ? '#FFFFFF' : colors.text}>
            {{ active: 'Active', completed: 'Completed', archived: 'Archived', drafts: 'Drafts' }[filter]} ({eventGroups[filter].length})
          </AppText>
        </Pressable>)}
      </View>
      {visibleEvents.length ? visibleEvents.map(event => event.status === 'draft' ? (
        <Pressable key={event.id} onPress={() => onOpenEvent(event)} accessibilityRole="button"
          accessibilityLabel={'Edit draft: ' + (event.title || 'Untitled draft')}
          style={[styles.draftCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.draftIcon}><Ionicons name="document-text-outline" size={30} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <AppText style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>PRIVATE DRAFT</AppText>
            <AppText numberOfLines={1} style={{ color: colors.text, fontWeight: '800', marginTop: 4 }}>{event.title || 'Untitled draft'}</AppText>
            <AppText numberOfLines={2} style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{event.date ? event.date + (event.time ? ' · ' + event.time : '') : 'No schedule selected'}</AppText>
          </View>
          <Ionicons name="chevron-forward" color={colors.muted} size={18} />
        </Pressable>
      ) : (
        <EventCard
          key={event.id}
          event={event}
          horizontal
          interestedCount={event.interestedCount}
          attendingCount={event.attendingCount}
          onPress={() => onOpenEvent(event)}
        />
      )) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>
        {{ active: 'No active events. Your ended events appear under Completed.', completed: 'No completed events yet. Events move here after their end time.', archived: 'No archived or cancelled events.', drafts: 'No drafts yet. Save an unfinished event as a draft to continue later.' }[eventFilter]}
      </AppText>}

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text, marginTop: 24 }]}>Your Stores</AppText>
      {storesLoading && stores.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : storesError && stores.length === 0 ? (
        <View>
          <AppText accessibilityRole="alert" color={theme === 'dark' ? '#FF8A80' : '#C62828'}>{storesError}</AppText>
          <AppButton title="Retry stores" variant="secondary" onPress={() => { void refreshStores(true); }} style={{ marginTop: 12 }} />
        </View>
      ) : stores.length ? stores.map(store => <StoreCard key={store.id} store={store} onPress={() => onOpenStore(store)} />)
        : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>You have no stores yet. Create a store to publish your business.</AppText>}
      {storesError && stores.length > 0 && <View>
        <AppText accessibilityRole="alert" color={theme === 'dark' ? '#FF8A80' : '#C62828'}>{storesError}</AppText>
        <AppButton title="Retry stores" variant="secondary" onPress={() => { void refreshStores(true); }} style={{ marginTop: 12 }} />
      </View>}
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
  eventFilters: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 10, padding: 3, gap: 4 },
  eventFilter: { flexGrow: 1, flexBasis: '45%', minHeight: 44, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  eventFilterLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  draftCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 112, marginBottom: 12 },
  draftIcon: { alignItems: 'center', justifyContent: 'center', width: 58, height: 72 },
  empty: { lineHeight: 19, marginTop: 4 },
  storeCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  storeImage: { width: 90, minHeight: 105 },
  storePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  storeText: { flex: 1, padding: 12, gap: 5 },
});
