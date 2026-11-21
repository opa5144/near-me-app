import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';
import { isAvailableEvent } from '../../utils/eventAvailability';

export function ItineraryScreen({ events: plannedEvents, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors, theme } = useTheme();
  const { events: globalEvents, isLoading, error } = useEvents();
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [isSurpriseLoading, setIsSurpriseLoading] = useState(false);
  const [activePlan, setActivePlan] = useState<EventItem[]>(plannedEvents);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [planTitle, setPlanTitle] = useState('Saved Outings');

  // Generated plans retain their event IDs, while the refreshed discovery
  // records supply current details and remove completed/cancelled outings.
  const currentById = new Map(globalEvents.map(event => [event.id, event]));
  const availablePlan = (items: EventItem[]) => items.flatMap(event => {
    const current = currentById.get(event.id);
    const candidate = current ?? ((isLoading || error) ? event : undefined);
    return candidate && isAvailableEvent(candidate) ? [candidate] : [];
  });
  const savedOutings = availablePlan(plannedEvents);

  // Strict chronological sort by full date and time
  const sortChronologically = (list: EventItem[]) => {
    return [...list].sort((a, b) => {
      const timeA = Date.parse(a.startsAt || `${a.date} ${a.time}`) || new Date(a.date).getTime() || 0;
      const timeB = Date.parse(b.startsAt || `${b.date} ${b.time}`) || new Date(b.date).getTime() || 0;
      return timeA - timeB;
    });
  };

  // Smart Plan: Organizes current saved events chronologically
  const handleGenerateSmartPlan = () => {
    setIsSmartLoading(true);
    setTimeout(() => {
      const sorted = sortChronologically(availablePlan(plannedEvents));
      setActivePlan(sorted);
      setPlanTitle('Chronological Itinerary');
      setPlanGenerated(true);
      setIsSmartLoading(false);
    }, 500);
  };

  // Surprise Me!: Pulls a new 1-2 day adventure from the global event ecosystem independently
  const handleSurprisePlan = () => {
    setIsSurpriseLoading(true);
    setTimeout(() => {
      const sourcePool = globalEvents.length > 0 ? globalEvents : availablePlan(plannedEvents);
      const shuffled = [...sourcePool].sort(() => 0.5 - Math.random());
      const surpriseSelection = shuffled.slice(0, Math.min(sourcePool.length, 5));
      const sortedSurprise = sortChronologically(surpriseSelection);

      setActivePlan(sortedSurprise);
      setPlanTitle('Discovery Itinerary');
      setPlanGenerated(true);
      setIsSurpriseLoading(false);
    }, 500);
  };

  const isDark = theme === 'dark';
  const currentDisplayList = sortChronologically(planGenerated ? availablePlan(activePlan) : savedOutings);

  // Group events by date string
  const groupedByDate = currentDisplayList.reduce((acc: { [key: string]: EventItem[] }, event) => {
    const eventDate = event.date || 'Upcoming Outings';
    if (!acc[eventDate]) acc[eventDate] = [];
    acc[eventDate].push(event);
    return acc;
  }, {});

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeader}>
        <AppText accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>My Itinerary</AppText>
        <AppText style={[styles.pageSubtitle, { color: colors.muted }]}>{planGenerated
          ? 'Your planned outings, in time order.'
          : `${savedOutings.length} saved ${savedOutings.length === 1 ? 'event' : 'events'}`}</AppText>
      </View>

      {/* Keep planning controls compact so the first outing stays near the heading. */}
      {(savedOutings.length > 0 || globalEvents.length > 0) && (
        <View style={[styles.assistantCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
          <View style={styles.assistantHeader}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <AppText style={[styles.assistantTitle, { color: colors.text }]}>Plan your outings</AppText>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Smart Plan: sort saved events in time order"
              onPress={handleGenerateSmartPlan}
              disabled={isSmartLoading || isSurpriseLoading}
            >
              {isSmartLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="flash" size={15} color="#FFFFFF" />
                  <AppText style={styles.primaryActionText}>Smart Plan</AppText>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Surprise Me: discover available events"
              onPress={handleSurprisePlan}
              disabled={isSmartLoading || isSurpriseLoading}
            >
              {isSurpriseLoading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="dice-outline" size={16} color={colors.primary} />
                  <AppText style={[styles.secondaryActionText, { color: colors.primary }]}>Surprise Me!</AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Timeline Section */}
      {currentDisplayList.length ? (
        <View style={styles.timelineContainer}>
          <View style={styles.timelineHeaderRow}>
            <View style={styles.statusDotLive} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.timelineHeaderLabel}>
              {planTitle.toUpperCase()}
            </AppText>
            {planGenerated && (
              <TouchableOpacity onPress={() => { setPlanGenerated(false); setActivePlan(plannedEvents); setPlanTitle('Saved Outings'); }}>
                <AppText style={[styles.resetText, { color: colors.muted }]}>Reset View</AppText>
              </TouchableOpacity>
            )}
          </View>

          {Object.entries(groupedByDate).map(([dateStr, dateEvents]) => (
            <View key={dateStr} style={styles.dateSection}>
              {/* One small date heading groups the event cards below it. */}
              <View style={[styles.dateBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.dateIconBox, { backgroundColor: colors.primary }]}>
                  <Ionicons name="calendar" size={14} color="#FFFFFF" />
                </View>
                <AppText style={[styles.dateBannerText, { color: colors.text }]}>{dateStr}</AppText>
                <View style={[styles.eventCountPill, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]}>
                  <AppText style={[styles.eventCountText, { color: colors.primary }]}>
                    {dateEvents.length} {dateEvents.length === 1 ? 'Event' : 'Events'}
                  </AppText>
                </View>
              </View>

              {dateEvents.map((event, index, arr) => (
                <View key={event.id} style={styles.row}>
                  <View style={styles.timeline}>
                    <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                    {index < arr.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
                  </View>
                  <View style={styles.eventWrapper}>
                    {/* The shared card already includes this event's date and time. */}
                    <EventCard event={event} horizontal onPress={() => onOpenEvent(event)} />
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="map-outline" size={32} color={colors.primary} />
          </View>
          <AppText variant="bodyLarge" style={[styles.emptyTitle, { color: colors.text }]}>
            Your itinerary is clear
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.emptyText}>
            Tap "Surprise Me!" above to instantly generate a local discovery itinerary across town.
          </AppText>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, flexGrow: 1 },
  pageHeader: { marginBottom: 10 },
  pageTitle: { fontSize: 28, fontWeight: '900' },
  pageSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  assistantCard: { borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 12 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  assistantTitle: { fontSize: 12, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8 },
  primaryActionBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12, paddingVertical: 8, flexShrink: 1, textAlign: 'center' },
  secondaryActionBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: { fontWeight: '800', fontSize: 12, paddingVertical: 8, flexShrink: 1, textAlign: 'center' },
  timelineContainer: { marginTop: 0 },
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusDotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  timelineHeaderLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, flex: 1 },
  resetText: { fontSize: 11, fontWeight: '700' },
  dateSection: { marginBottom: 10 },
  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  dateIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBannerText: { fontSize: 12, fontWeight: '800', flex: 1 },
  eventCountPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  eventCountText: { fontSize: 11, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  timeline: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 14, borderWidth: 2, borderColor: '#FFFFFF' },
  line: { width: 2.5, flex: 1, marginTop: 6, marginBottom: -6 },
  eventWrapper: { flex: 1, minWidth: 0 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  emptyIconCircle: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
  emptyText: { lineHeight: 20, textAlign: 'center' },
});
