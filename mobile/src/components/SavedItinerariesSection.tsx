import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../data/events';
import { AppText } from './AppText';
import { SavedItinerary } from '../context/EventsContext'; // Saved itinerary record type.

interface SavedItinerariesSectionProps {
  itineraries: SavedItinerary[];
  selectedId: string | null;
  expandedIds: Record<string, boolean>;
  deleteDisabled?: boolean;
  colors: { surface: string; border: string; primary: string; text: string; muted: string };
  resolveEvents: (item: SavedItinerary) => EventItem[];
  sortEvents: (list: EventItem[]) => EventItem[];
  onSelect: (item: SavedItinerary) => void;
  onToggleDropdown: (id: string) => void;
  onDelete: (item: SavedItinerary) => void;
  onOpenEvent: (event: EventItem) => void;
}

// Displays saved itinerary cards with active primary styling, dropdown event lists, and delete actions.
export function SavedItinerariesSection({
  itineraries, selectedId, expandedIds, deleteDisabled = false, colors, resolveEvents, sortEvents, onSelect, onToggleDropdown, onDelete, onOpenEvent,
}: SavedItinerariesSectionProps) {
  if (!itineraries.length) return null; // Skip rendering when no saved itineraries exist.

  return (
    <View style={styles.section}>
      <AppText variant="bodyMedium" color={colors.primary} style={styles.headerLabel}>SAVED ITINERARIES</AppText>
      {itineraries.map(item => {
        const isSelected = selectedId === item.id; // Highlight card with primary color when active.
        const isExpanded = Boolean(expandedIds[item.id]); // Dropdown stays collapsed until toggled.
        const cardEvents = sortEvents(resolveEvents(item)); // Chronological events for dropdown display.
        const primaryText = isSelected ? '#FFFFFF' : colors.text;
        const secondaryText = isSelected ? 'rgba(255, 255, 255, 0.85)' : colors.muted;

        return (
          <View key={item.id} style={[styles.card, { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}>
            <View style={styles.topRow}>
              <TouchableOpacity style={styles.nameBtn} activeOpacity={0.8} onPress={() => onSelect(item)} accessibilityRole="button"
                accessibilityLabel={`View ${item.title}`} accessibilityState={{ selected: isSelected }}>
                <AppText style={[styles.title, { color: primaryText }]}>{item.title}</AppText>
                <AppText style={[styles.count, { color: secondaryText }]}>{cardEvents.length} {cardEvents.length === 1 ? 'event' : 'events'}</AppText>
              </TouchableOpacity>

              <View style={styles.rightActions}>
                {cardEvents.length > 0 && (
                  <TouchableOpacity style={styles.iconBtn} onPress={() => onToggleDropdown(item.id)} accessibilityRole="button"
                    accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} events for ${item.title}`} accessibilityState={{ expanded: isExpanded }}>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={secondaryText} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.iconBtn, deleteDisabled && styles.disabled]} onPress={() => onDelete(item)} disabled={deleteDisabled}
                  accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} accessibilityState={{ disabled: deleteDisabled }}>
                  <Ionicons name="trash-outline" size={18} color={isSelected ? '#FFFFFF' : '#EF4444'} />
                </TouchableOpacity>
              </View>
            </View>

            {isExpanded && cardEvents.length > 0 && (
              <View style={[styles.eventsList, { borderTopColor: isSelected ? 'rgba(255, 255, 255, 0.25)' : colors.border }]}>
                {cardEvents.map(ev => (
                  <TouchableOpacity key={ev.id} style={styles.eventRow} activeOpacity={0.75} onPress={() => onOpenEvent(ev)} accessibilityRole="button"
                    accessibilityLabel={`View ${ev.title}, ${[ev.date, ev.time].filter(Boolean).join(', ')}`}>
                    <Ionicons name="ellipse" size={6} color={isSelected ? '#FFFFFF' : colors.primary} />
                    <AppText style={[styles.eventText, { color: primaryText }]} numberOfLines={1}>{ev.title || 'Untitled Event'}</AppText>
                    <AppText style={[styles.eventMeta, { color: secondaryText }]} numberOfLines={1}>{[ev.date, ev.time].filter(Boolean).join(' · ')}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// Flattened styles for saved itinerary cards and dropdown event rows.
const styles = StyleSheet.create({
  section: { marginBottom: 12, gap: 8 },
  headerLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameBtn: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', marginRight: 6 },
  title: { fontSize: 13, fontWeight: '800' },
  count: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  rightActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  eventsList: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, gap: 6 },
  eventRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventText: { flex: 1, fontSize: 12, fontWeight: '600' },
  eventMeta: { fontSize: 11, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
