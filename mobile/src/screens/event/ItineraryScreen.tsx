import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { AppText } from '../../components/AppText';
import { FieldError } from '../../components/FieldError';
import { ItineraryActionBar } from '../../components/ItineraryActionBar';
import { SaveItineraryModal } from '../../components/SaveItineraryModal';
import { SavedItinerariesSection } from '../../components/SavedItinerariesSection';
import { addEventsToCalendarAndOpen } from '../../utils/eventCalendar';
import { useTheme } from '../../context/ThemeContext';
import { useEvents, SavedItinerary } from '../../context/EventsContext'; // Context types and persistence actions.
import { isAvailableEvent } from '../../utils/eventAvailability';

// Renders planned outings, smart/surprise itinerary generators, and saved itineraries.
export function ItineraryScreen({ events: plannedEvents, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors, theme } = useTheme();
  const { events: globalEvents, isLoading, error, savedItineraries, saveItinerary, deleteItinerary,
    savedItinerariesLoading, savedItinerariesReady, savedItinerariesError, refreshSavedItineraries,
    setBulkRsvp, selectionsReady, selectionsLoading, selectionsSavingEventIds } = useEvents();
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [isSurpriseLoading, setIsSurpriseLoading] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false); // Tracks in-flight save operation.
  const [activePlan, setActivePlan] = useState<EventItem[]>(plannedEvents);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [planTitle, setPlanTitle] = useState('Saved Outings');
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null); // Tracks which saved itinerary card is currently active.
  const [expandedSavedIds, setExpandedSavedIds] = useState<Record<string, boolean>>({}); // Tracks dropdown open/closed state per saved itinerary card.
  const [nameModalVisible, setNameModalVisible] = useState(false); // Controls itinerary naming modal.
  const [draftTitle, setDraftTitle] = useState(''); // Editable name input inside modal.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isBulkRsvping, setIsBulkRsvping] = useState(false);
  const [isExportingCalendar, setIsExportingCalendar] = useState(false);
  const [isSharingPlan, setIsSharingPlan] = useState(false);
  const actionInFlight = useRef(false);
  const mounted = useRef(true);
  const generationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (generationTimer.current) clearTimeout(generationTimer.current); };
  }, []);

  // Current server details take precedence over snapshots. A saved plan cannot
  // restore an ended/cancelled event that has left discovery.
  const currentById = new Map(globalEvents.map(event => [event.id, event]));
  const availablePlan = (items: EventItem[]) => items.flatMap(event => {
    const candidate = currentById.get(event.id) ?? ((isLoading || error) ? event : undefined);
    return candidate && isAvailableEvent(candidate) ? [candidate] : [];
  });
  const savedOutings = availablePlan(plannedEvents);

  // Clear selection only after deletion has actually persisted successfully.
  useEffect(() => {
    if (!savedItinerariesReady) return;
    if (selectedSavedId && !savedItineraries.some(item => item.id === selectedSavedId)) setSelectedSavedId(null);
    setExpandedSavedIds(current => Object.fromEntries(Object.entries(current)
      .filter(([id]) => savedItineraries.some(item => item.id === id))));
  }, [savedItineraries, savedItinerariesReady, selectedSavedId]);

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
    if (actionInFlight.current || isSmartLoading || isSurpriseLoading) return;
    setIsSmartLoading(true);
    generationTimer.current = setTimeout(() => {
      const sorted = sortChronologically(availablePlan(plannedEvents));
      setActivePlan(sorted);
      setPlanTitle('Chronological Master Itinerary');
      setSelectedSavedId(null); // Clear active saved card highlight when generating a new plan.
      setPlanGenerated(true);
      setIsSmartLoading(false);
    }, 500);
  };

  // Surprise Me!: Pulls a new 1-2 day adventure from the global event ecosystem independently
  const handleSurprisePlan = () => {
    if (actionInFlight.current || isSmartLoading || isSurpriseLoading) return;
    setIsSurpriseLoading(true);
    generationTimer.current = setTimeout(() => {
      const sourcePool = availablePlan(globalEvents.length > 0 ? globalEvents : plannedEvents);
      const shuffled = [...sourcePool].sort(() => 0.5 - Math.random());
      const surpriseSelection = shuffled.slice(0, Math.min(sourcePool.length, 5));
      const sortedSurprise = sortChronologically(surpriseSelection);

      setActivePlan(sortedSurprise);
      setPlanTitle('AI Discovery Itinerary');
      setSelectedSavedId(null); // Clear active saved card highlight for a fresh surprise plan.
      setPlanGenerated(true);
      setIsSurpriseLoading(false);
    }, 500);
  };

  // Opens naming modal pre-filled with the current itinerary title.
  const openSaveModal = () => {
    if (actionInFlight.current || !savedItinerariesReady) return;
    setSaveError(null);
    setDraftTitle(planTitle); // Seed input with current plan title.
    setNameModalVisible(true); // Show modal.
  };

  // Persists current itinerary with the user-entered name.
  const handleConfirmSave = async () => {
    if (actionInFlight.current || !savedItinerariesReady) return;
    const listToSave = sortChronologically(availablePlan(planGenerated ? activePlan : plannedEvents));
    if (!listToSave.length) {
      setSaveError('These events have ended or are no longer available.');
      return;
    }
    setSaveError(null);
    actionInFlight.current = true;
    setIsSavingPlan(true);
    try {
      const finalName = draftTitle.trim() || planTitle; // Fallback to current title if blank.
      const saved = await saveItinerary(finalName, listToSave);
      if (saved && mounted.current) {
        setPlanTitle(saved.title); // Reflect saved name in active timeline header.
        setSelectedSavedId(saved.id); // Mark newly saved itinerary as active.
        setNameModalVisible(false); // Close modal.
        Alert.alert('Itinerary Saved', `"${saved.title}" has been saved.`);
      }
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setIsSavingPlan(false);
    }
  };

  // RSVP uses the shared writer, preserving QR issuance and check-in rules.
  const handleBulkRsvp = async (list: EventItem[]) => {
    if (actionInFlight.current || !selectionsReady || selectionsLoading) return;
    const ids = [...new Set(availablePlan(list).map(event => event.id))];
    if (!ids.length) {
      Alert.alert('No available events', 'These events have ended or are no longer available.');
      return;
    }
    actionInFlight.current = true;
    setIsBulkRsvping(true);
    try {
      const saved = await setBulkRsvp(ids, true);
      if (saved && mounted.current) Alert.alert('RSVP Updated', `Registered for ${ids.length} ${ids.length === 1 ? 'event' : 'events'}.`);
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setIsBulkRsvping(false);
    }
  };

  // Share current schedules and venue details rather than stale saved snapshots.
  const handleShareItinerary = async (title: string, list: EventItem[]) => {
    if (actionInFlight.current) return;
    const current = availablePlan(list);
    if (!current.length) return;
    actionInFlight.current = true;
    setIsSharingPlan(true);
    const lines = current.map((event, index) => {
      const when = [event.date, event.time].filter(Boolean).join(' · ');
      const location = [event.venue, event.address || event.location].filter(Boolean).join(', ');
      return `${index + 1}. ${event.title}${when ? ` (${when})` : ''}${location ? ` @ ${location}` : ''}`;
    });
    try {
      await Share.share({ title: `${title} · NearMe`,
        message: `Check out my NearMe itinerary: ${title}\n\n${lines.join('\n')}\n\nPlanned with NearMe` });
    } catch {
      if (mounted.current) Alert.alert('Share Failed', 'Could not open the share sheet.');
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setIsSharingPlan(false);
    }
  };

  // Export once and report partial results without claiming failed inserts saved.
  const handleAddToCalendar = async (list: EventItem[]) => {
    if (actionInFlight.current) return;
    const current = availablePlan(list);
    if (!current.length) {
      Alert.alert('No available events', 'These events have ended or are no longer available.');
      return;
    }
    actionInFlight.current = true;
    setIsExportingCalendar(true);
    try {
      const { addedCount, skippedCount } = await addEventsToCalendarAndOpen(current);
      if (!mounted.current) return;
      if (!addedCount) Alert.alert('No Scheduled Events', 'No available events could be added to your calendar.');
      else if (skippedCount) Alert.alert('Calendar partially updated', `${addedCount} added; ${skippedCount} could not be added. Please check your calendar before trying again.`);
    } catch {
      if (mounted.current) Alert.alert('Calendar Error', 'Your calendar could not be updated. Check calendar access in device settings and try again.');
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setIsExportingCalendar(false);
    }
  };

  // Confirms and deletes a saved itinerary via context.
  const handleDeleteItinerary = (item: SavedItinerary) => {
    if (actionInFlight.current || !savedItinerariesReady) return;
    Alert.alert(
      'Delete Itinerary',
      `Delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => { void deleteItinerary(item.id); },
        },
      ]
    );
  };

  // Toggles whether a saved itinerary card's event list dropdown is open.
  const toggleSavedDropdown = (id: string) => {
    setExpandedSavedIds(prev => ({ ...prev, [id]: !prev[id] })); // Flip expansion state for this itinerary ID.
  };

  // Resolves events belonging to a saved itinerary record.
  const resolveSavedEvents = (item: SavedItinerary): EventItem[] => {
    const snapshots = new Map((item.eventsSnapshot ?? []).map(event => [event.id, event]));
    return availablePlan(item.eventIds.flatMap(id => {
      const event = currentById.get(id) ?? snapshots.get(id);
      return event ? [event] : [];
    }));
  };

  // Displays the selected saved itinerary in the timeline view and highlights its card.
  const handleSelectSavedItinerary = (item: SavedItinerary) => {
    const resolvedEvents = resolveSavedEvents(item);
    setActivePlan(sortChronologically(resolvedEvents));
    setPlanTitle(item.title);
    setSelectedSavedId(item.id); // Highlight selected saved itinerary card.
    setPlanGenerated(true);
  };

  const isDark = theme === 'dark';
  const currentDisplayList = sortChronologically(planGenerated ? availablePlan(activePlan) : savedOutings);
  const isBusyAction = isBulkRsvping || isSavingPlan || isExportingCalendar || isSharingPlan ||
    isSmartLoading || isSurpriseLoading || selectionsSavingEventIds.length > 0;

  const resetPlan = () => {
    setPlanGenerated(false); setActivePlan(savedOutings);
    setPlanTitle('Saved Outings'); setSelectedSavedId(null);
  };

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

      {/* Keep planning controls compact while retaining saved-plan features. */}
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

      {savedItinerariesLoading && <ActivityIndicator color={colors.primary} style={styles.storageLoading} />}
      {savedItinerariesError && <View style={styles.storageNotice}>
        <FieldError message={savedItinerariesError} />
        {!savedItinerariesReady && <TouchableOpacity accessibilityRole="button" onPress={() => void refreshSavedItineraries()}>
          <AppText style={{ color: colors.primary }}>Retry saved itineraries</AppText>
        </TouchableOpacity>}
      </View>}

      <SavedItinerariesSection
        itineraries={savedItineraries} selectedId={selectedSavedId} expandedIds={expandedSavedIds}
        colors={colors} resolveEvents={resolveSavedEvents} sortEvents={sortChronologically}
        onSelect={handleSelectSavedItinerary} onToggleDropdown={toggleSavedDropdown}
        onDelete={handleDeleteItinerary} onOpenEvent={onOpenEvent}
        deleteDisabled={!savedItinerariesReady || isBusyAction}
      />

      {/* Timeline Section */}
      {currentDisplayList.length ? (
        <View style={styles.timelineContainer}>
          <View style={styles.timelineHeaderRow}>
            <View style={styles.statusDotLive} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.timelineHeaderLabel}>
              {planTitle.toUpperCase()}
            </AppText>
            {planGenerated && <TouchableOpacity accessibilityRole="button" onPress={resetPlan}>
              <AppText style={[styles.resetText, { color: colors.muted }]}>Reset View</AppText>
            </TouchableOpacity>}
          </View>

          <ItineraryActionBar
            disabled={isBusyAction} saveDisabled={savedItinerariesLoading || !savedItinerariesReady}
            rsvpDisabled={!selectionsReady || selectionsLoading}
            isBulkRsvping={isBulkRsvping} isExportingCalendar={isExportingCalendar} colors={colors}
            onBulkRsvp={() => { void handleBulkRsvp(currentDisplayList); }} onSave={openSaveModal}
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
                    {/* EventCard already displays this event's date and time. */}
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
          {planGenerated && <TouchableOpacity accessibilityRole="button" onPress={resetPlan}>
            <AppText style={[styles.resetText, { color: colors.primary }]}>Reset View</AppText>
          </TouchableOpacity>}
        </View>
      )}

      <SaveItineraryModal
        visible={nameModalVisible} value={draftTitle} isSaving={isSavingPlan} colors={colors}
        error={saveError || savedItinerariesError} canSave={savedItinerariesReady}
        onChangeText={setDraftTitle} onCancel={() => { if (!actionInFlight.current) setNameModalVisible(false); }}
        onConfirm={() => { void handleConfirmSave(); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, flexGrow: 1 },
  pageHeader: { marginBottom: 10 },
  pageTitle: { fontSize: 28, fontWeight: '900' },
  pageSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  storageLoading: { marginBottom: 8 },
  storageNotice: { marginBottom: 10 },
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
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
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
