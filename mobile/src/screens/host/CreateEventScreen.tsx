import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Alert, Image, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { isAxiosError } from 'axios';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
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
const MAX_IMAGE_BYTES = 1024 * 1024;
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
// Base64 text is larger than the image bytes; apply the 1 MiB limit to decoded bytes.
const decodedBase64Bytes = (value: string) =>
  (value.length * 3) / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

// Normalize any selected image to a centered 16:9 JPEG, up to 1280 pixels wide.
// Return a local URI for preview and Base64 for upload; release native image objects
// in finally blocks even if conversion or size validation fails.
async function prepareBanner(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  try {
    const original = await context.renderAsync();
    try {
      const { width, height } = original;
      if (width < 1 || height < 1) throw new Error('The selected image could not be read.');
      const cropWidth = Math.min(width, Math.floor(height * 16 / 9));
      const cropHeight = Math.min(height, Math.floor(cropWidth * 9 / 16));
      if (cropWidth < 1 || cropHeight < 1) throw new Error('Choose an image with larger dimensions.');
      context.crop({ originX: Math.floor((width - cropWidth) / 2), originY: Math.floor((height - cropHeight) / 2), width: cropWidth, height: cropHeight });
      context.resize({ width: Math.min(1280, cropWidth) });
      const rendered = await context.renderAsync();
      try {
        const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
        if (!result.base64) throw new Error('The selected image could not be prepared.');
        if (decodedBase64Bytes(result.base64) > MAX_IMAGE_BYTES) {
          throw new Error('This banner is still larger than 1 MiB. Please choose a simpler or smaller image.');
        }
        return { uri: result.uri, base64: result.base64 };
      } finally { rendered.release(); }
    } finally { original.release(); }
  } finally { context.release(); }
}

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
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
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
    return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  // Request library access, let the host crop, then prepare both preview and upload
  // data. Canceling or failing leaves the previously selected banner unchanged.
  const handlePickImage = async () => {
    if (savingRef.current || imageBusyRef.current || completedRef.current) return;
    imageBusyRef.current = true;
    setImageBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Permission to access the media library is required.'); return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const prepared = await prepareBanner(result.assets[0].uri);
      if (mountedRef.current) { setBannerImage(prepared.uri); setImageBase64(prepared.base64); }
    } catch (error) {
      if (mountedRef.current) Alert.alert('Image Error', error instanceof Error ? error.message : 'The selected image could not be prepared.');
    } finally {
      imageBusyRef.current = false;
      if (mountedRef.current) setImageBusy(false);
    }
  };
  // Clear both representations so a removed preview is also omitted from the request.
  const handleRemoveImage = () => {
    if (savingRef.current || imageBusyRef.current || completedRef.current) return;
    setBannerImage(null); setImageBase64(null);
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
      ...(imageBase64 ? { imageBase64 } : {}),
    };
    savingRef.current = true;
    setIsSaving(true);
    let savedEvent: EventItem;
    try {
      // Wait for the saved document, including its database ID and durable image URL.
      savedEvent = await createEvent(payload);
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
        <Text onPress={handleBack} style={[styles.backLink, { color: colors.primary }]}>‹  Back</Text>
        <ScreenHeader eyebrow="Event Blueprint" title="Create Event" subtitle="Tell us about your event details and entry rules." />
        
        {/* Title Field (Mandatory) */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Event Title*</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={150} placeholder="e.g., Hardcore Synthwave Experience" placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        </View>

        {/* Description Field (Mandatory) */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Description*</Text>
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
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Category*</Text>
          <View style={styles.chipsContainer}>
            {eventCategories.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
                style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, selectedCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[styles.chipText, { color: colors.text }, selectedCategory === cat && styles.activeChipText]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Modular Date Picker Component with Validation */}
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Times use your device time zone: {timeZone || "Unavailable"}</Text>
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
              <Text style={[styles.overnightBadgeText, { color: colors.primary }]}>
                🌙 Ends the following day ({getNextDayFormatted(date)})
              </Text>
            </View>
          ) : null}
        </View>

        {/* Numbers-only price input (blank = free) */}
        <PriceInputField label="Ticket Price" price={price} onPriceChange={setPrice} />

        {/* Secure typeahead autocomplete proxy search drop-down location field */}
        <LocationComponent onVenueSelected={setSelectedVenue} onSelectionCleared={() => setSelectedVenue(null)} />

        {/* Upload Banner Image */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Upload Banner Image</Text>
          {imageBusy && <Text style={{ color: colors.muted, marginBottom: 8 }}>Preparing banner...</Text>}
          {bannerImage ? (
            <View style={[styles.imagePreviewContainer, { borderColor: colors.border }]}>
              <Image source={{ uri: bannerImage }} style={styles.bannerImagePreview} />
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={handlePickImage} disabled={isSaving || imageBusy || completedRef.current} activeOpacity={0.8} style={styles.changeBtn}>
                  <Text style={styles.actionBtnText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRemoveImage} disabled={isSaving || imageBusy || completedRef.current} activeOpacity={0.8} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={handlePickImage} disabled={isSaving || imageBusy || completedRef.current} activeOpacity={0.8} style={[styles.imagePlaceholderFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.placeholderGlyph}>🖼️</Text>
              <Text style={[styles.placeholderText, { color: colors.muted }]}>Tap to select and crop image (optional)</Text>
            </TouchableOpacity>
          )}
        </View>

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
  imagePlaceholderFrame: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, height: 100, alignItems: 'center', justifyContent: 'center' },
  placeholderGlyph: { fontSize: 24, marginBottom: 4 },
  placeholderText: { fontSize: 12, fontWeight: '600' },
  imagePreviewContainer: { position: 'relative', height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 1, backgroundColor: '#000' },
  bannerImagePreview: { width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.9 },
  actionRow: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 8 },
  changeBtn: { backgroundColor: 'rgba(0, 0, 0, 0.75)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  removeBtn: { backgroundColor: 'rgba(229, 62, 62, 0.85)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  actionBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  removeBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  submitButton: { marginTop: 10 }
});
