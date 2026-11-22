import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppText } from '../../components/AppText';
import { SavedItinerariesSection } from '../../components/SavedItinerariesSection';
import { ItineraryActionBar } from '../../components/ItineraryActionBar';
import { SaveItineraryModal } from '../../components/SaveItineraryModal';
import { useTheme } from '../../context/ThemeContext';
import { useEvents, SavedItinerary } from '../../context/EventsContext';
import { addEventsToCalendarAndOpen } from '../../utils/eventCalendar';

// Coordinates itinerary generation, saved itinerary selection, action bar workflows, and timeline display.
export function ItineraryScreen({ events: plannedEvents, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors, theme } = useTheme();
  const { events: globalEvents, savedItineraries, saveItinerary, deleteItinerary, setBulkRsvp, selectionsSavingEventIds } = useEvents();
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [isSurpriseLoading, setIsSurpriseLoading] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isBulkRsvping, setIsBulkRsvping] = useState(false);
  const [isExportingCalendar, setIsExportingCalendar] = useState(false);
  const [activePlan, setActivePlan] = useState<EventItem[]>(plannedEvents);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [planTitle, setPlanTitle] = useState('Saved Outings');
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [expandedSavedIds, setExpandedSavedIds] = useState<Record<string, boolean>>({});
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

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
      setSelectedSavedId(null);
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
      setSelectedSavedId(null);
      setPlanGenerated(true);
      setIsSurpriseLoading(false);
    }, 500);
  };

  // Opens naming modal pre-filled with the current itinerary title.
  const openSaveModal = () => {
    setDraftTitle(planTitle);
    setNameModalVisible(true);
  };

  // Persists current itinerary with the user-entered name.
  const handleConfirmSave = async () => {
    const listToSave = planGenerated ? activePlan : sortChronologically(plannedEvents);
    if (!listToSave.length || isSavingPlan) return;
    setIsSavingPlan(true);
    try {
      const finalName = draftTitle.trim() || planTitle;
      const saved = await saveItinerary(finalName, listToSave);
      if (saved) {
        setPlanTitle(saved.title);
        setSelectedSavedId(saved.id);
        setNameModalVisible(false);
        Alert.alert('Itinerary Saved', `"${saved.title}" has been saved.`);
      }
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Marks all events currently in the itinerary as attending via EventsContext.
  const handleBulkRsvp = async (list: EventItem[]) => {
    const ids = list.map(ev => ev.id).filter(Boolean);
    if (!ids.length || isBulkRsvping) return;
    setIsBulkRsvping(true);
    try {
      const ok = await setBulkRsvp(ids, true);
      if (ok) {
        Alert.alert('RSVP Updated', `Marked ${ids.length} ${ids.length === 1 ? 'event' : 'events'} as attending.`);
      }
    } finally {
      setIsBulkRsvping(false);
    }
  };

  // Opens the native share sheet with a NearMe-branded itinerary summary.
  const handleShareItinerary = async (title: string, list: EventItem[]) => {
    if (!list.length) return;
    const lines = list.map((ev, idx) => {
      const evTitle = ev.title || 'Untitled Event';
      const when = [ev.date, ev.time].filter(Boolean).join(' · ');
      const loc = ev.location ? ` @ ${ev.location}` : '';
      return `${idx + 1}. ${evTitle}${when ? ` (${when})` : ''}${loc}`;
    });
    try {
      await Share.share({
        title: `${title} · NearMe`,
        message: `Check out my NearMe itinerary: ${title}\n\n${lines.join('\n')}\n\nPlanned with NearMe`,
      });
    } catch {
      Alert.alert('Share Failed', 'Could not open the share sheet.');
    }
  };

  // Batch-inserts all valid itinerary events and opens the Calendar app once without an extra popup.
  const handleAddToCalendar = async (list: EventItem[]) => {
    if (!list.length || isExportingCalendar) return;
    setIsExportingCalendar(true);
    try {
      const { addedCount } = await addEventsToCalendarAndOpen(list);
      if (addedCount === 0) {
        Alert.alert('No Scheduled Events', 'None of the events in this itinerary had a valid calendar schedule.');
      }
    } catch (error) {
      Alert.alert('Calendar Error', error instanceof Error ? error.message : 'The calendar could not be opened. Please try again.');
    } finally {
      setIsExportingCalendar(false);
    }
  };

  // Confirms and deletes a saved itinerary via context.
  const handleDeleteItinerary = (item: SavedItinerary) => {
    Alert.alert(
      'Delete Itinerary',
      `Delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (selectedSavedId === item.id) setSelectedSavedId(null);
            setExpandedSavedIds(prev => {
              const next = { ...prev };
              delete next[item.id];
              return next;
            });
            void deleteItinerary(item.id);
          },
        },
      ]
    );
  };

  // Toggles whether a saved itinerary card's event list dropdown is open.
  const toggleSavedDropdown = (id: string) => {
    setExpandedSavedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Resolves events belonging to a saved itinerary record.
  const resolveSavedEvents = (item: SavedItinerary): EventItem[] => {
    return item.eventsSnapshot && item.eventsSnapshot.length > 0
      ? item.eventsSnapshot
      : globalEvents.filter(ev => item.eventIds.includes(ev.id));
  };

  // Displays the selected saved itinerary in the timeline view and highlights its card.
  const handleSelectSavedItinerary = (item: SavedItinerary) => {
    const resolvedEvents = resolveSavedEvents(item);
    setActivePlan(sortChronologically(resolvedEvents));
    setPlanTitle(item.title);
    setSelectedSavedId(item.id);
    setPlanGenerated(true);
  };

  const isDark = theme === 'dark';
  const currentDisplayList = planGenerated ? activePlan : sortChronologically(plannedEvents);
  const isBusyAction = isBulkRsvping || isSavingPlan || isExportingCalendar || selectionsSavingEventIds.length > 0;

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
              {isSmartLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
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
              {isSurpriseLoading ? <ActivityIndicator color={colors.primary} size="small" /> : (
                <>
                  <Ionicons name="dice-outline" size={16} color={colors.primary} />
                  <AppText style={[styles.secondaryActionText, { color: colors.primary }]}>Surprise Me!</AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <SavedItinerariesSection
        itineraries={savedItineraries}
        selectedId={selectedSavedId}
        expandedIds={expandedSavedIds}
        colors={colors}
        resolveEvents={resolveSavedEvents}
        sortEvents={sortChronologically}
        onSelect={handleSelectSavedItinerary}
        onToggleDropdown={toggleSavedDropdown}
        onDelete={handleDeleteItinerary}
        onOpenEvent={onOpenEvent}
      />

      {/* Timeline Section */}
      {currentDisplayList.length ? (
        <View style={styles.timelineContainer}>
          <View style={styles.timelineHeaderRow}>
            <View style={styles.statusDotLive} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.timelineHeaderLabel}>{planTitle.toUpperCase()}</AppText>
          </View>

          <ItineraryActionBar
            disabled={isBusyAction}
            isBulkRsvping={isBulkRsvping}
            isExportingCalendar={isExportingCalendar}
            colors={colors}
            onBulkRsvp={() => { void handleBulkRsvp(currentDisplayList); }}
            onSave={openSaveModal}
            onShare={() => { void handleShareItinerary(planTitle, currentDisplayList); }}
            onAddToCalendar={() => { void handleAddToCalendar(currentDisplayList); }}
          />

          {Object.entries(groupedByDate).map(([dateStr, dateEvents]) => (
            <View key={dateStr} style={styles.dateSection}>
              {/* Premium Date Header Banner */}
              <View style={[styles.dateBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.dateIconBox, { backgroundColor: colors.primary }]}>
                  <Ionicons name="calendar" size={14} color="#FFFFFF" />
                </View>
                <AppText style={[styles.dateBannerText, { color: colors.text }]}>{dateStr}</AppText>
                <View style={[styles.eventCountPill, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]}>
                  <AppText style={[styles.eventCountText, { color: colors.primary }]}>{dateEvents.length} {dateEvents.length === 1 ? 'Event' : 'Events'}</AppText>
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
          <AppText variant="bodyLarge" style={[styles.emptyTitle, { color: colors.text }]}>Your itinerary is clear</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.emptyText}>Tap "Surprise Me!" above to instantly generate a local discovery itinerary across town.</AppText>
        </View>
      )}

      <SaveItineraryModal
        visible={nameModalVisible}
        value={draftTitle}
        isSaving={isSavingPlan}
        colors={colors}
        onChangeText={setDraftTitle}
        onCancel={() => setNameModalVisible(false)}
        onConfirm={() => { void handleConfirmSave(); }}
      />
    </ScrollView>
  );
}

// Flattened stylesheet definitions for screen layout and timeline elements.
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  assistantCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 22 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  assistantEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  assistantTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  assistantBody: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryActionBtn: { flex: 1, height: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryActionBtn: { flex: 1, height: 42, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryActionText: { fontWeight: '800', fontSize: 13 },
  timelineContainer: { marginTop: 4 },
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  statusDotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  timelineHeaderLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, flex: 1 },
  dateSection: { marginBottom: 20 },
  dateBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  dateIconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dateBannerText: { fontSize: 13, fontWeight: '900', flex: 1 },
  eventCountPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
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