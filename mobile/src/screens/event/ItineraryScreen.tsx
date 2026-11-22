import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useEvents, SavedItinerary } from '../../context/EventsContext'; // Context types and persistence actions.

// Renders planned outings, smart/surprise itinerary generators, and saved itineraries.
export function ItineraryScreen({ events: plannedEvents, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors, theme } = useTheme();
  const { events: globalEvents, savedItineraries, saveItinerary, deleteItinerary } = useEvents(); // Read and manage saved itineraries via context.
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
      setSelectedSavedId(null); // Clear active saved card highlight when generating a new plan.
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
      setSelectedSavedId(null); // Clear active saved card highlight for a fresh surprise plan.
      setPlanGenerated(true);
      setIsSurpriseLoading(false);
    }, 500);
  };

  // Opens naming modal pre-filled with the current itinerary title.
  const openSaveModal = () => {
    setDraftTitle(planTitle); // Seed input with current plan title.
    setNameModalVisible(true); // Show modal.
  };

  // Persists current itinerary with the user-entered name.
  const handleConfirmSave = async () => {
    const listToSave = planGenerated ? activePlan : sortChronologically(plannedEvents);
    if (!listToSave.length || isSavingPlan) return;
    setIsSavingPlan(true);
    try {
      const finalName = draftTitle.trim() || planTitle; // Fallback to current title if blank.
      const saved = await saveItinerary(finalName, listToSave);
      if (saved) {
        setPlanTitle(saved.title); // Reflect saved name in active timeline header.
        setSelectedSavedId(saved.id); // Mark newly saved itinerary as active.
        setNameModalVisible(false); // Close modal.
        Alert.alert('Itinerary Saved', `"${saved.title}" has been saved.`);
      }
    } finally {
      setIsSavingPlan(false);
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
            if (selectedSavedId === item.id) setSelectedSavedId(null); // Clear highlight if active card is deleted.
            setExpandedSavedIds(prev => {
              const next = { ...prev };
              delete next[item.id]; // Clean up dropdown state for deleted card.
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
    setExpandedSavedIds(prev => ({ ...prev, [id]: !prev[id] })); // Flip expansion state for this itinerary ID.
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
    setSelectedSavedId(item.id); // Highlight selected saved itinerary card.
    setPlanGenerated(true);
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

      {/* Saved Itineraries list with full primary fill when active and dropdown event names + date & time */}
      {savedItineraries.length > 0 && (
        <View style={styles.savedItinerariesSection}>
          <AppText variant="bodyMedium" color={colors.primary} style={styles.timelineHeaderLabel}>
            SAVED ITINERARIES
          </AppText>
          {savedItineraries.map(item => {
            const isSelected = selectedSavedId === item.id; // True when this saved itinerary card is filled with primary color.
            const isExpanded = Boolean(expandedSavedIds[item.id]); // Dropdown collapsed by default until toggled.
            const cardEvents = sortChronologically(resolveSavedEvents(item)); // Sorted events inside this card.
            const primaryTextColor = isSelected ? '#FFFFFF' : colors.text; // High-contrast text when card uses primary fill.
            const secondaryTextColor = isSelected ? 'rgba(255, 255, 255, 0.85)' : colors.muted; // Readable secondary text on primary fill.

            return (
              <View
                key={item.id}
                style={[
                  styles.savedItineraryCard,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surface, // Full primary fill when active.
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={styles.savedItineraryTopRow}>
                  <TouchableOpacity
                    style={styles.savedItineraryNameBtn}
                    activeOpacity={0.8}
                    onPress={() => handleSelectSavedItinerary(item)}
                  >
                    <AppText style={[styles.savedItineraryTitle, { color: primaryTextColor }]}>{item.title}</AppText>
                    <AppText style={[styles.savedItineraryCount, { color: secondaryTextColor }]}>
                      {cardEvents.length} {cardEvents.length === 1 ? 'event' : 'events'}
                    </AppText>
                  </TouchableOpacity>

                  <View style={styles.cardRightActions}>
                    {/* Dropdown toggle button to show or hide event names, dates, and times */}
                    {cardEvents.length > 0 && (
                      <TouchableOpacity
                        onPress={() => toggleSavedDropdown(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} events for ${item.title}`}
                      >
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={secondaryTextColor}
                        />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => handleDeleteItinerary(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={`Delete ${item.title}`}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={isSelected ? '#FFFFFF' : '#EF4444'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Dropdown list of event names with date and time, shown only when expanded */}
                {isExpanded && cardEvents.length > 0 && (
                  <View
                    style={[
                      styles.cardEventsList,
                      { borderTopColor: isSelected ? 'rgba(255, 255, 255, 0.25)' : colors.border },
                    ]}
                  >
                    {cardEvents.map(ev => (
                      <TouchableOpacity
                        key={ev.id}
                        style={styles.cardEventItemRow}
                        activeOpacity={0.75}
                        onPress={() => onOpenEvent(ev)}
                      >
                        <Ionicons name="ellipse" size={6} color={isSelected ? '#FFFFFF' : colors.primary} />
                        <AppText style={[styles.cardEventItemText, { color: primaryTextColor }]} numberOfLines={1}>
                          {ev.title || 'Untitled Event'}
                        </AppText>
                        <AppText
                          style={[styles.cardEventItemMeta, { color: secondaryTextColor }]}
                          numberOfLines={1}
                        >
                          {[ev.date, ev.time].filter(Boolean).join(' · ')}
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
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
            {/* Save button to name and persist the current itinerary */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={openSaveModal}
              disabled={isSavingPlan}
            >
              <Ionicons name="bookmark-outline" size={14} color={colors.primary} />
              <AppText style={[styles.saveBtnText, { color: colors.primary }]}>Save</AppText>
            </TouchableOpacity>
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

      {/* Modal to name and save the current itinerary */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText style={[styles.modalTitle, { color: colors.text }]}>Save Itinerary</AppText>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Itinerary name"
              placeholderTextColor={colors.muted}
              style={[styles.nameInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              maxLength={60}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtnSecondary, { borderColor: colors.border }]}
                onPress={() => setNameModalVisible(false)}
                disabled={isSavingPlan}
              >
                <AppText style={[styles.modalBtnSecondaryText, { color: colors.text }]}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={() => { void handleConfirmSave(); }}
                disabled={isSavingPlan}
              >
                {isSavingPlan ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <AppText style={styles.modalBtnPrimaryText}>Save</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  // Styles for saved itinerary cards, dropdown event list, and save button.
  savedItinerariesSection: { marginBottom: 20, gap: 10 },
  savedItineraryCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  savedItineraryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedItineraryNameBtn: { flex: 1, marginRight: 10 },
  savedItineraryTitle: { fontSize: 13, fontWeight: '800' },
  savedItineraryCount: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  cardRightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEventsList: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  cardEventItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardEventItemText: { flex: 1, fontSize: 12, fontWeight: '600' },
  cardEventItemMeta: { fontSize: 11, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  saveBtnText: { fontSize: 11, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  nameInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtnSecondary: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnSecondaryText: { fontSize: 13, fontWeight: '700' },
  modalBtnPrimary: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  timelineContainer: { marginTop: 4 },
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  statusDotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  timelineHeaderLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, flex: 1 },
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