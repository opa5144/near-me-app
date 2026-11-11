import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { isAxiosError } from 'axios';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { PhotoPickerField } from '../../components/PhotoPickerField';
import { toPhotoInput } from '../../api/photos';
import type { EditablePhoto } from '../../api/photos';
import { AppText } from '../../components/AppText';
import { DatePickerField } from '../../components/DatePickerField';
import { TimePickerField } from '../../components/TimePickerField';
import { PriceInputField } from '../../components/PriceInputField';
import { LocationComponent } from '../../components/LocationInputField';
import type { EventPlace } from '../../api/maps';
import { createEvent } from '../../api/events';
import type { CreateEventRequest } from '../../api/events';
import { categories } from '../../data/events';
import type { EventItem } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';

// All is a browsing filter; new events must use a specific category.
const eventCategories = categories.filter(category => category !== 'All');
const MINUTE_INTERVAL: 15 | 30 = 15;
// Keep the date picker value in local YYYY-MM-DD form, without converting it to UTC.
const formatDateString = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

// Initialize once with a future start on a 15-minute boundary and a one-hour duration.
const initialSchedule = () => {
  const start = new Date(Date.now() + 30 * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / MINUTE_INTERVAL) * MINUTE_INTERVAL, 0, 0);
  return { date: formatDateString(start), start, end: new Date(start.getTime() + 60 * 60 * 1000) };
};

// Blank means free. Validate up to two decimal places and calculate in integer cents
// before returning the dollar amount, so a price such as 12.50 keeps its cents.
const priceToAmount = (value: string): number | null => {
  const text = value.trim();
  if (!text) return 0;
  if (!/^(?:\d{1,7}(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) return null;
  const [whole, fractional = ''] = text.split('.');
  const cents = Number(whole || '0') * 100 + Number(fractional.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents / 100 : null;
};
type Props = { onBack: () => void; onCreated: (event: EventItem) => void };

export function CreateEventScreen({ onBack, onCreated }: Props) {
  const { colors } = useTheme();
  // Form values stay local until the backend successfully creates the event.
  const [initial] = useState(initialSchedule);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Start empty so the host must choose a category rather than accept a default.
  const [selectedCategory, setSelectedCategory] = useState('');
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.start);
  const [endTime, setEndTime] = useState(initial.end);
  const [price, setPrice] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);
  // The device-local preview URI is never sent as a shared image URL.
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  // State updates the button/loading UI; refs below guard repeat taps immediately,
  // before React has rendered the updated disabled state.
  const [isSaving, setIsSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const savingRef = useRef(false);
  const imageBusyRef = useRef(false);
  // A successful save stays locked while its success alert is open.
  const completedRef = useRef(false);
  const mountedRef = useRef(true);
  // The pickers use device-local clock times; save the matching IANA time zone too.
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  const todayString = formatDateString(new Date());

  // Async work may finish after leaving the screen; avoid local updates and alerts then.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // Combine the chosen date with each clock time. An earlier end means the next
  // calendar day; subtracting timestamps measures real elapsed time across DST.
  const getMinutesFromMidnight = (value: Date) => value.getHours() * 60 + value.getMinutes();
  const startMins = getMinutesFromMidnight(startTime);
  const endMins = getMinutesFromMidnight(endTime);
  const isOvernight = endMins < startMins;
  const previewStart = new Date(`${date}T00:00:00`);
  const previewEnd = new Date(previewStart);
  if (isOvernight) previewEnd.setDate(previewEnd.getDate() + 1);
  previewStart.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
  previewEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
  const durationMins = (previewEnd.getTime() - previewStart.getTime()) / (60 * 1000);
  const isInvalidDuration = !Number.isFinite(durationMins) || durationMins < 30;
  const getNextDayFormatted = (value: string) => {
    const next = new Date(`${value}T00:00:00`);
    next.setDate(next.getDate() + 1);
    return next.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  // Block past calendar days here; submission also checks the complete start time.
  const handleDateChange = (newDate: string) => {
    if (newDate < formatDateString(new Date())) {
      Alert.alert('Invalid Date', 'Event date cannot be in the past.'); return;
    }
    setDate(newDate);
  };
  const handleStartTimeChange = (value: Date) => setStartTime(value);
  const handleEndTimeChange = (value: Date) => setEndTime(value);
  // Keep the form's Back link from interrupting its image preparation or save flow.
  const handleBack = () => { if (!savingRef.current && !imageBusyRef.current) onBack(); };

  const handlePhotoBusyChange = (busy: boolean) => {
    imageBusyRef.current = busy;
    if (mountedRef.current) setImageBusy(busy);
  };

  // Validate the complete draft before making a request. The ref guards also prevent
  // another submission while image preparation, saving, or the success alert is active.
  const handleSubmit = async () => {
    if (savingRef.current || imageBusyRef.current || completedRef.current) return;
    if (!title.trim()) { Alert.alert('Missing Title', 'Please enter an event title.'); return; }
    if (!description.trim()) { Alert.alert('Missing Description', 'Please enter an event description.'); return; }
    if (!eventCategories.includes(selectedCategory)) { Alert.alert('Missing Category', 'Please select an event category.'); return; }
    if (!selectedVenue?.name.trim() || !selectedVenue.address.trim()) {
      Alert.alert('Missing Location', 'Please search and select a venue with an address.'); return;
    }
    const priceAmount = priceToAmount(price);
    if (priceAmount === null) { Alert.alert('Invalid Price', 'Enter a valid price with up to two decimal places, or leave it blank for free.'); return; }
    if (!timeZone) { Alert.alert('Missing Time Zone', 'Set a time zone in your device settings before creating an event.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Invalid Date', 'Choose a valid event date.'); return; }
    // Build local date/time values, preserving the overnight end date. Round-trip
    // checks catch invalid calendar dates before converting valid instants to ISO.
    const start = new Date(`${date}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || formatDateString(start) !== date) { Alert.alert('Invalid Date', 'Choose a valid event date.'); return; }
    const end = new Date(start);
    if (isOvernight) end.setDate(end.getDate() + 1);
    const expectedEndDate = formatDateString(end);
    start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    // During the spring DST jump, JavaScript moves a nonexistent time forward;
    // reject that silent change. A repeated autumn time uses its earlier occurrence.
    if (formatDateString(start) !== date || formatDateString(end) !== expectedEndDate ||
        start.getHours() !== startTime.getHours() || start.getMinutes() !== startTime.getMinutes() ||
        end.getHours() !== endTime.getHours() || end.getMinutes() !== endTime.getMinutes()) {
      Alert.alert('Invalid Time', 'That time does not exist on this date in your device time zone. Choose another time.'); return;
    }
    if (start.getTime() <= Date.now()) { Alert.alert('Invalid Start Time', 'The event must start in the future.'); return; }
    if (isInvalidDuration || end.getTime() - start.getTime() < 30 * 60 * 1000) {
      Alert.alert('Invalid Schedule', 'Event duration must be at least 30 minutes.'); return;
    }
    // Send real UTC instants plus the display time zone, venue details and optional
    // image bytes. The backend derives hostId from the authenticated session.
    const payload: CreateEventRequest = {
      title: title.trim(), category: selectedCategory, description: description.trim(), price: priceAmount,
      startsAt: start.toISOString(), endsAt: end.toISOString(), timeZone,
      address: selectedVenue.address.trim(), place: selectedVenue.name.trim(),
      placeId: selectedVenue.placeId || undefined, latitude: selectedVenue.latitude, longitude: selectedVenue.longitude,
    };
    savingRef.current = true;
    setIsSaving(true);
    let savedEvent: EventItem;
    try {
      // Wait for the saved document, including its database ID and durable image URL.
      savedEvent = await createEvent({ ...payload, photos: toPhotoInput(photos) });
      completedRef.current = true;
    } catch (error) {
      // Prefer a useful backend validation message; report a missing response as a
      // connection problem. Failure keeps the draft available and skips success.
      let message = 'Unable to create your event. Please try again.';
      if (isAxiosError<{ message?: string }>(error)) {
        const serverMessage = error.response?.data?.message;
        if (typeof serverMessage === 'string') message = serverMessage;
        else if (!error.response) message = 'No response from the server. Check your connection.';
      } else if (error instanceof Error) {
        message = error.message;
      }
      if (mountedRef.current) Alert.alert('Could Not Create Event', message);
      return;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
    // Refresh the shared event list from the server response before announcing success.
    onCreated(savedEvent);
    if (mountedRef.current) Alert.alert('Success', 'Event Created!', [{ text: 'OK', onPress: onBack }]);
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText onPress={handleBack} style={[styles.backLink, { color: colors.primary }]}>‹  Back</AppText>
        <ScreenHeader eyebrow="Event Blueprint" title="Create Event" subtitle="Tell us about your event details and entry rules." />
        
        {/* Title Field (Mandatory) */}
        <View style={styles.formGroup}>
          <AppText style={[styles.fieldLabel, { color: colors.text }]}>Event Title*</AppText>
          <TextInput value={title} onChangeText={setTitle} maxLength={150} placeholder="e.g., Hardcore Synthwave Experience" placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        </View>

        {/* Description Field (Mandatory) */}
        <View style={styles.formGroup}>
          <AppText style={[styles.fieldLabel, { color: colors.text }]}>Description*</AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            maxLength={10000}
            placeholder="Tell attendees what to expect, dress codes, age limits..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            style={[styles.fieldInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
        </View>

        {/* Category Selection (Wrapped) */}
        <View style={styles.formGroup}>
          <AppText style={[styles.fieldLabel, { color: colors.text }]}>Category*</AppText>
          <View style={styles.chipsContainer}>
            {eventCategories.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
                style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, selectedCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <AppText style={[styles.chipText, { color: colors.text }, selectedCategory === cat && styles.activeChipText]}>{cat}</AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Modular Date Picker Component with Validation */}
        <AppText style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Times use your device time zone: {timeZone || "Unavailable"}</AppText>
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
              <AppText style={styles.warningBadgeText}>
                ⚠️ Event duration must be at least 30 minutes.
              </AppText>
            </View>
          ) : isOvernight ? (
            <View style={styles.badgeContainer}>
              <AppText style={[styles.overnightBadgeText, { color: colors.primary }]}>
                🌙 Ends the following day ({getNextDayFormatted(date)})
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Numbers-only price input (blank = free) */}
        <PriceInputField label="Ticket Price" price={price} onPriceChange={setPrice} />

        {/* Secure typeahead autocomplete proxy search drop-down location field */}
        <LocationComponent onVenueSelected={setSelectedVenue} onSelectionCleared={() => setSelectedVenue(null)} />

        <PhotoPickerField photos={photos} onChange={setPhotos} label="Event photos"
          disabled={isSaving || completedRef.current} onBusyChange={handlePhotoBusyChange} />

        <AppButton title={isSaving ? "Creating Event..." : "Create Event"} onPress={handleSubmit} disabled={isSaving || imageBusy || completedRef.current} style={styles.submitButton} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  formGroup: { marginBottom: 14 },
  timeSection: { marginBottom: 14 },
  splitRow: { flexDirection: 'row', gap: 12 },
  badgeContainer: { marginTop: 6, paddingHorizontal: 4 },
  overnightBadgeText: { fontSize: 11, fontWeight: '700' },
  warningBadgeText: { color: '#E53E3E', fontSize: 11, fontWeight: '700' },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, fontSize: 14 },
  textArea: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '700' },
  activeChipText: { color: '#FFFFFF' },
  submitButton: { marginTop: 10 }
});
