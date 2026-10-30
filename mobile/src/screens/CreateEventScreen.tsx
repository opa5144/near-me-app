import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Alert, Image, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { PriceInputField } from '../components/PriceInputField';
import { LocationComponent } from '../components/LocationInputField';
import { EventPlace } from '../api/maps';
import { categories } from '../data/events';
import { colors } from '../data/theme';

// Filter out 'All' so hosts assign a specific category
const eventCategories = categories.filter(c => c !== 'All');

const MINUTE_INTERVAL: 15 | 30 = 15; // <--- Single source of truth for the picker step

// Rounds a Date to the nearest interval so the state always matches the picker wheels
const snapToInterval = (d: Date, interval: number = MINUTE_INTERVAL) => {
  const r = new Date(d);
  r.setMinutes(Math.round(r.getMinutes() / interval) * interval, 0, 0);
  return r;
};

export function CreateEventScreen({ onBack }: { onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(eventCategories[0] || 'Music');
  
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
  const [bannerImage, setBannerImage] = useState<string | null>(null);

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

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access the media library is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setBannerImage(result.assets[0].uri);
    }
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
      description,
      category: selectedCategory,
      eventDate: date,
      isOvernight,
      durationMinutes: durationMins,
      startTimestamp: startDateTime.toISOString(),
      endTimestamp: endDateTime.toISOString(),
      price: parseFloat(price) || 0, // Blank (or a lone ".") means a free event
      bannerImage,
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
        
        {/* Title Field */}
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Event Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g., Hardcore Synthwave Experience" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        {/* Description Field */}
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell attendees what to expect, dress codes, age limits..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            style={[styles.fieldInput, styles.textArea]}
          />
        </View>

        {/* Category Selection (Wrapped) */}
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipsContainer}>
            {eventCategories.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
                style={[styles.chip, selectedCategory === cat && styles.activeChip]}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.activeChipText]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
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

        {/* Upload Banner Image */}
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Upload Banner Image</Text>
          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8}>
            {bannerImage ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: bannerImage }} style={styles.bannerImagePreview} />
                <Text style={styles.changeImageBadge}>Tap to change image</Text>
              </View>
            ) : (
              <View style={styles.imagePlaceholderFrame}>
                <Text style={styles.placeholderGlyph}>🖼️</Text>
                <Text style={styles.placeholderText}>Tap to select or browse files</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <AppButton title="Create" onPress={handleSubmit} style={styles.submitButton} />
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
  textArea: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  chip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  activeChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  activeChipText: { color: '#FFFFFF' },
  imagePlaceholderFrame: { borderWidth: 1, borderColor: '#ccc', borderStyle: 'dashed', borderRadius: 4, height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' },
  placeholderGlyph: { fontSize: 24, marginBottom: 4 },
  placeholderText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  imagePreviewContainer: { position: 'relative', height: 120, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#ccc' },
  bannerImagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  changeImageBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.7)', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  submitButton: { marginTop: 10 }
});