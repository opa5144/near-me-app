import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';

export function ItineraryScreen({ events: plannedEvents, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors, theme } = useTheme();
  const { events: globalEvents } = useEvents();
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [isSurpriseLoading, setIsSurpriseLoading] = useState(false);
  const [activePlan, setActivePlan] = useState<EventItem[]>(plannedEvents);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [planTitle, setPlanTitle] = useState('Saved Outings');

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
      const sorted = sortChronologically(plannedEvents);
      setActivePlan(sorted);
      setPlanTitle('Chronological Master Itinerary');
      setPlanGenerated(true);
      setIsSmartLoading(false);
    }, 500);
  };

  // Surprise Me!: Pulls a new 1-2 day adventure from the global event ecosystem independently
  const handleSurprisePlan = () => {
    setIsSurpriseLoading(true);
    setTimeout(() => {
      const sourcePool = globalEvents.length > 0 ? globalEvents : plannedEvents;
      const shuffled = [...sourcePool].sort(() => 0.5 - Math.random());
      const surpriseSelection = shuffled.slice(0, Math.min(sourcePool.length, 5));
      const sortedSurprise = sortChronologically(surpriseSelection);

      setActivePlan(sortedSurprise);
      setPlanTitle('AI Discovery Itinerary');
      setPlanGenerated(true);
      setIsSurpriseLoading(false);
    }, 500);
  };

  const isDark = theme === 'dark';
  const currentDisplayList = planGenerated ? activePlan : sortChronologically(plannedEvents);

  // Group events by date string
  const groupedByDate = currentDisplayList.reduce((acc: { [key: string]: EventItem[] }, event) => {
    const eventDate = event.date || 'Upcoming Outings';
    if (!acc[eventDate]) acc[eventDate] = [];
    acc[eventDate].push(event);
    return acc;
  }, {});

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        title="My Itinerary"
        subtitle={
          planGenerated
            ? 'Your custom multi-day itinerary, fully optimized.'
            : `${plannedEvents.length} saved ${plannedEvents.length === 1 ? 'event' : 'events'} ready to plan around.`
        }
      />

      {/* Interactive AI Gimmick Card */}
      {(plannedEvents.length > 0 || globalEvents.length > 0) && (
        <View style={[styles.assistantCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
          <View style={styles.assistantHeader}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <AppText style={[styles.assistantEyebrow, { color: colors.primary }]}>SMART ITINERARY ASSISTANT</AppText>
          </View>

          <AppText style={[styles.assistantTitle, { color: colors.text }]}>Find what's happening NearMe</AppText>
          <AppText style={[styles.assistantBody, { color: colors.muted }]}>
            Generate a smart chronological timeline from your saved items, or hit Surprise Me to instantly discover a 1-2 day local adventure.
          </AppText>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
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
              {/* Premium Date Header Banner */}
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
                    <View style={styles.timeBadgeRow}>
                      <Ionicons name="time" size={13} color={colors.primary} />
                      <AppText style={[styles.time, { color: colors.primary }]}>{event.time}</AppText>
                    </View>
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
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  assistantCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 22 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  assistantEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  assistantTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  assistantBody: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryActionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryActionBtn: {
    flex: 1,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: { fontWeight: '800', fontSize: 13 },
  timelineContainer: { marginTop: 4 },
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  statusDotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  timelineHeaderLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, flex: 1 },
  resetText: { fontSize: 11, fontWeight: '700' },
  dateSection: { marginBottom: 20 },
  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  dateIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBannerText: { fontSize: 13, fontWeight: '900', flex: 1 },
  eventCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  eventCountText: { fontSize: 11, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  timeline: { width: 16, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 14, borderWidth: 2, borderColor: '#FFFFFF' },
  line: { width: 2.5, flex: 1, marginTop: 6, marginBottom: -6 },
  eventWrapper: { flex: 1, marginBottom: 14 },
  timeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6, marginTop: 10 },
  time: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
  emptyText: { lineHeight: 20, textAlign: 'center' },
});