import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { PhotoPickerField } from '../../components/PhotoPickerField';
import { toPhotoInput } from '../../api/photos';
import type { EditablePhoto } from '../../api/photos';
import { AppText } from '../../components/AppText';
import { FieldError } from '../../components/FieldError';
import { DatePickerField } from '../../components/DatePickerField';
import { TimePickerField } from '../../components/TimePickerField';
import { PriceInputField } from '../../components/PriceInputField';
import { LocationComponent } from '../../components/LocationInputField';
import type { EventPlace } from '../../api/maps';
import { createEvent } from '../../api/events';
import type { CreateEventRequest } from '../../api/events';
import { eventCategories } from '../../data/events';
import type { EventItem } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';
import { formatHostDate, hasHostErrors, hostRequestError, mergeHostFieldErrors, validateEventDraft } from './hostFormUtils';
import type { EventDraft, HostFieldErrors } from './hostFormUtils';
import { formatCalendarDate } from '../../utils/dateFormat';

const MINUTE_INTERVAL: 15 | 30 = 15;
// Keep the date picker value in local YYYY-MM-DD form, without converting it to UTC.
const formatDateString = formatHostDate;

// Initialize once with a future start on a 15-minute boundary and a one-hour duration.
const initialSchedule = () => {
  const start = new Date(Date.now() + 30 * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / MINUTE_INTERVAL) * MINUTE_INTERVAL, 0, 0);
  return { date: formatDateString(start), start, end: new Date(start.getTime() + 60 * 60 * 1000) };
};

type Props = { onBack: () => void; onCreated: (event: EventItem) => void };

export function CreateEventScreen({ onBack, onCreated }: Props) {
  const { colors } = useTheme();
  // Form values stay local until the backend successfully creates the event.
  const [initial] = useState(initialSchedule);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Start empty so the host chooses the categories that describe this event.
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.start);
  const [endTime, setEndTime] = useState(initial.end);
  const [price, setPrice] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);
  // The device-local preview URI is never sent as a shared image URL.
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [errors, setErrors] = useState<HostFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
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
  const isOvernight = endTime.getHours() * 60 + endTime.getMinutes() < startTime.getHours() * 60 + startTime.getMinutes();
  const draft: EventDraft = { title, description, categories: selectedCategories, date, startTime, endTime, price, venue: selectedVenue, timeZone, photos };
  const validateFields = (fields: string[], changes: Partial<EventDraft> = {}) => {
    const next = validateEventDraft({ ...draft, ...changes }).errors;
    setErrors(current => mergeHostFieldErrors(current, next, fields));
  };
  const validateSchedule = (changes: Partial<EventDraft> = {}) => validateFields(['date', 'startTime', 'endTime', 'timeZone'], changes);
  const getNextDayFormatted = (value: string) => {
    const next = new Date(`${value}T00:00:00`);
    next.setDate(next.getDate() + 1);
    return formatCalendarDate(formatDateString(next));
  };
  const handleDateChange = (newDate: string) => setDate(newDate);
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
    const { errors: nextErrors, start, end, priceAmount } = validateEventDraft(draft);
    setErrors(nextErrors);
    setFormError(null);
    if (hasHostErrors(nextErrors) || !start || !end || priceAmount === null || !selectedVenue) return;
    // Send real UTC instants plus the display time zone, venue details and optional
    // image bytes. The backend derives hostId from the authenticated session.
    const payload: CreateEventRequest = {
      title: title.trim(), categories: selectedCategories, description: description.trim(), price: priceAmount,
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
      if (mountedRef.current) {
        const feedback = hostRequestError(error, 'Unable to create your event. Please try again.');
        setErrors(feedback.errors); setFormError(feedback.message);
      }
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
          <TextInput value={title} onChangeText={setTitle} onBlur={() => validateFields(['title'])} editable={!isSaving} maxLength={150} placeholder="e.g., Hardcore Synthwave Experience" placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          <FieldError message={errors.title} />
        </View>

        {/* Description Field (Mandatory) */}
        <View style={styles.formGroup}>
          <AppText style={[styles.fieldLabel, { color: colors.text }]}>Description*</AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            onBlur={() => validateFields(['description'])}
            editable={!isSaving}
            maxLength={10000}
            placeholder="Tell attendees what to expect, dress codes, age limits..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            style={[styles.fieldInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <FieldError message={errors.description} />
        </View>

        {/* Category Selection (Wrapped) */}
        <View style={styles.formGroup}>
          <AppText style={[styles.fieldLabel, { color: colors.text }]}>Categories*</AppText>
          <AppText style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>Choose all that apply.</AppText>
          <View style={styles.chipsContainer}>
            {eventCategories.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => {
                  const next = selectedCategories.includes(cat) ? selectedCategories.filter(value => value !== cat) : [...selectedCategories, cat];
                  setSelectedCategories(next); validateFields(['categories'], { categories: next });
                }}
                disabled={isSaving}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedCategories.includes(cat), disabled: isSaving }}
                activeOpacity={0.7}
                style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, selectedCategories.includes(cat) && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <AppText style={[styles.chipText, { color: colors.text }, selectedCategories.includes(cat) && styles.activeChipText]}>{cat}</AppText>
              </TouchableOpacity>
            ))}
          </View>
          <FieldError message={errors.categories} />
        </View>

        {/* Modular Date Picker Component with Validation */}
        <AppText style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Times use your device time zone: {timeZone || "Unavailable"}</AppText>
        <FieldError message={errors.timeZone} />
        <DatePickerField label="Event Date*" date={date} onDateChange={handleDateChange} minimumDate={todayString}
          error={errors.date} onBlur={value => validateSchedule({ date: value })} disabled={isSaving} />

        {/* Modular Time Picker Components with Validation & Contextual Guidance */}
        <View style={styles.timeSection}>
          <View style={styles.splitRow}>
            <TimePickerField label="Start Time*" time={startTime} onTimeChange={handleStartTimeChange} minuteInterval={MINUTE_INTERVAL}
              error={errors.startTime} onBlur={value => validateSchedule({ startTime: value })} disabled={isSaving} />
            <TimePickerField label="End Time*" time={endTime} onTimeChange={handleEndTimeChange} minuteInterval={MINUTE_INTERVAL}
              error={errors.endTime} onBlur={value => validateSchedule({ endTime: value })} disabled={isSaving} />
          </View>

          {/* Contextual Visual Badges */}
          {isOvernight ? (
            <View style={styles.badgeContainer}>
              <AppText style={[styles.overnightBadgeText, { color: colors.primary }]}>
                🌙 Ends the following day ({getNextDayFormatted(date)})
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Numbers-only price input (blank = free) */}
        <PriceInputField label="Ticket Price" price={price} onPriceChange={setPrice}
          error={errors.price} onBlur={() => validateFields(['price'])} disabled={isSaving} />

        {/* Secure typeahead autocomplete proxy search drop-down location field */}
        <LocationComponent onVenueSelected={venue => { setSelectedVenue(venue); validateFields(['location'], { venue }); }}
          onSelectionCleared={() => setSelectedVenue(null)} error={errors.location}
          onBlur={() => validateFields(['location'])} disabled={isSaving} />

        <PhotoPickerField photos={photos} onChange={setPhotos} label="Event photos"
          disabled={isSaving || completedRef.current} onBusyChange={handlePhotoBusyChange}
          error={errors.photos} onBlur={value => validateFields(['photos'], { photos: value })} />

        <FieldError message={formError} />
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
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, fontSize: 14 },
  textArea: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '700' },
  activeChipText: { color: '#FFFFFF' },
  submitButton: { marginTop: 10 }
});
