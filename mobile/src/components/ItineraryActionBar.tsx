import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';

interface ItineraryActionBarProps {
  disabled: boolean;
  isBulkRsvping: boolean;
  isExportingCalendar: boolean;
  colors: { surface: string; border: string; primary: string; text: string };
  onBulkRsvp: () => void;
  onSave: () => void;
  onShare: () => void;
  onAddToCalendar: () => void;
}

// Action bar for bulk RSVPing, saving, sharing, and exporting itinerary events to calendar.
export function ItineraryActionBar({
  disabled, isBulkRsvping, isExportingCalendar, colors, onBulkRsvp, onSave, onShare, onAddToCalendar,
}: ItineraryActionBarProps) {
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.btn} activeOpacity={0.8} onPress={onBulkRsvp} disabled={disabled}>
        {isBulkRsvping ? <ActivityIndicator color={colors.primary} size="small" /> : (
          <>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
            <AppText style={[styles.btnText, { color: colors.text }]}>RSVP All</AppText>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} activeOpacity={0.8} onPress={onSave} disabled={disabled}>
        <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
        <AppText style={[styles.btnText, { color: colors.text }]}>Save</AppText>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} activeOpacity={0.8} onPress={onShare} disabled={disabled}>
        <Ionicons name="share-outline" size={16} color={colors.primary} />
        <AppText style={[styles.btnText, { color: colors.text }]}>Share</AppText>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} activeOpacity={0.8} onPress={onAddToCalendar} disabled={disabled}>
        {isExportingCalendar ? <ActivityIndicator color={colors.primary} size="small" /> : (
          <>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <AppText style={[styles.btnText, { color: colors.text }]}>Calendar</AppText>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// Flattened styles for the itinerary action bar.
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  btnText: { fontSize: 11, fontWeight: '800' },
});