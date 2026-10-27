import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { PriceInputField } from '../components/PriceInputField';
import { LocationComponent } from '../components/LocationInputField';
import { EventPlace } from '../api/maps';
import { colors } from '../data/theme';

const MINUTE_INTERVAL: 15 | 30 = 15; // <--- Single source of truth for the picker step

// Rounds a Date to the nearest interval so the state always matches the picker wheels
const snapToInterval = (d: Date, interval: number = MINUTE_INTERVAL) => {
  const r = new Date(d);
  r.setMinutes(Math.round(r.getMinutes() / interval) * interval, 0, 0);
  return r;
};

export function CreateEventScreen({ onBack }: { onBack: () => void }) {
  const [title, setTitle] = useState('');
  
  // Helpers to format dates and initialize dates/times as native Date objects
  // Uses local time (not UTC) so "today" is correct in the evening
  const formatDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const todayString = formatDateString(today);

  // State managed as strings for dates and Date objects for times to support pickers & validation
  const [date, setDate] = useState(todayString);
  const [startTime, setStartTime] = useState(snapToInterval(new Date(today.getTime() + 10 * 60 * 1000)));
  const [endTime, setEndTime] = useState(snapToInterval(new Date(today.getTime() + 70 * 60 * 1000)));
  
  const [price, setPrice] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);

  // Helper to calculate total minutes from midnight for robust 24-hour comparisons
  const getMinutesFromMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();

  // Helper to calculate total duration in minutes (handles both same-day and overnight)
  const getEventDurationMinutes = (start: Date, end: Date) => {
    const startMins = getMinutesFromMidnight(start);
    const endMins = getMinutesFromMidnight(end);

    if (endMins < startMins) {
      // Overnight event (adds 24 hours / 1440 mins)
      return (1440 - startMins) + endMins;
    }
    return endMins - startMins;
  };

  // --- Dynamic UI State Computations ---
  const startMins = getMinutesFromMidnight(startTime);
  const endMins = getMinutesFromMidnight(endTime);
  const durationMins = getEventDurationMinutes(startTime, endTime);

  // Catch-all invalid check: covers 0-minute duration (identical times) and anything under 30 mins
  const isInvalidDuration = durationMins < 30;
  const isOvernight = endMins < startMins;

  // Helper to format the next morning's date for clarity in the badge
  const getNextDayFormatted = (currentDateStr: string) => {
    const d = new Date(currentDateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // --- Validation & Event Logic ---

  const handleDateChange = (newDate: string) => {
    if (newDate < todayString) {
      Alert.alert("Invalid Date", "Event date cannot be in the past.");
      return;
    }
    setDate(newDate);
  };

  const handleStartTimeChange = (newTime: Date) => {
    setStartTime(newTime);
  };

  const handleEndTimeChange = (newTime: Date) => {
    setEndTime(newTime);
  };

  const handleSubmit = () => {
    // Catch-all hard block on submit
    if (isInvalidDuration) {
      Alert.alert("Invalid Schedule", "Event duration must be at least 30 minutes.");
      return;
    }

    if (!selectedVenue) {
      Alert.alert("Missing Location", "Please search and select a venue location.");
      return;
    }

    // Build ISO timestamps based on single event date selection
    const startDateTime = new Date(`${date}T${startTime.toTimeString().split(' ')[0]}`);
    const endDateTime = new Date(`${date}T${endTime.toTimeString().split(' ')[0]}`);
    
    if (isOvernight) {
      endDateTime.setDate(endDateTime.getDate() + 1); // Safely advances date by +1 day for overnight events
    }

    const eventPayload = {
      title,
      eventDate: date,
      isOvernight,
      durationMinutes: durationMins,
      startTimestamp: startDateTime.toISOString(),
      endTimestamp: endDateTime.toISOString(),
      price: parseFloat(price) || 0, // Blank (or a lone ".") means a free event
      venue: {
        placeId: selectedVenue.placeId,
        name: selectedVenue.name,
        address: selectedVenue.address,
        geometry: {
          type: "Point",
          coordinates: [selectedVenue.longitude, selectedVenue.latitude] // GeoJSON format standard ordering
        }
      }
    };

    console.log("Event Blueprint Submitted:", eventPayload);
    Alert.alert('Success', 'Event Blueprint Formulated.');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text onPress={onBack} style={styles.backLink}>‹  Back to Dashboard</Text>
        <ScreenHeader eyebrow="Event Blueprint" title="Create Event" subtitle="Tell us about your event details and entry rules." />
        
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Event Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g., Hardcore Synthwave Experience" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        {/* Modular Date Picker Component with Validation */}
        <DatePickerField label="Event Date*" date={date} onDateChange={handleDateChange} minimumDate={todayString} />

        {/* Modular Time Picker Components with Validation & Contextual Guidance */}
        <View style={styles.timeSection}>
          <View style={styles.splitRow}>
            <TimePickerField label="Start Time*" time={startTime} onTimeChange={handleStartTimeChange} minuteInterval={MINUTE_INTERVAL} />
            <TimePickerField label="End Time*" time={endTime} onTimeChange={handleEndTimeChange} minuteInterval={MINUTE_INTERVAL} />
          </View>

          {/* Contextual Visual Badges */}
          {isInvalidDuration ? (
            <View style={styles.badgeContainer}>
              <Text style={styles.warningBadgeText}>
                ⚠️ Event duration must be at least 30 minutes.
              </Text>
            </View>
          ) : isOvernight ? (
            <View style={styles.badgeContainer}>
              <Text style={styles.overnightBadgeText}>
                🌙 Ends the following day ({getNextDayFormatted(date)})
              </Text>
            </View>
          ) : null}
        </View>

        {/* Numbers-only price input (blank = free) */}
        <PriceInputField label="Ticket Price" price={price} onPriceChange={setPrice} />

        {/* Secure typeahead autocomplete proxy search drop-down location field */}
        <LocationComponent onVenueSelected={setSelectedVenue} />

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Upload Banner Image</Text>
          <View style={styles.imagePlaceholderFrame}>
            <Text style={styles.placeholderGlyph}>🖼️</Text>
            <Text style={styles.placeholderText}>Drop banner image here or browse files</Text>
          </View>
        </View>

        <AppButton title="Next" onPress={handleSubmit} style={styles.submitButton} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  backLink: { color: colors.primary, fontWeight: '800', fontSize: 13, marginBottom: 12 },
  formGroup: { marginBottom: 14 },
  timeSection: { marginBottom: 14 },
  splitRow: { flexDirection: 'row', gap: 12 },
  badgeContainer: { marginTop: 6, paddingHorizontal: 4 },
  overnightBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  warningBadgeText: { color: '#E53E3E', fontSize: 11, fontWeight: '700' },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 10, fontSize: 14, color: '#000', backgroundColor: '#fff' },
  imagePlaceholderFrame: { borderWidth: 1, borderColor: '#ccc', borderStyle: 'dashed', borderRadius: 4, height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' },
  placeholderGlyph: { fontSize: 24, marginBottom: 4 },
  placeholderText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  submitButton: { marginTop: 10 }
});
