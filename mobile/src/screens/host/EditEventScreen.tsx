import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { FieldError } from '../../components/FieldError';
import { PhotoPickerField } from '../../components/PhotoPickerField';
import { toPhotoInput, toEditablePhotos } from '../../api/photos';
import type { EditablePhoto } from '../../api/photos';
import { DatePickerField } from '../../components/DatePickerField';
import { TimePickerField } from '../../components/TimePickerField';
import { PriceInputField } from '../../components/PriceInputField';
import { LocationComponent } from '../../components/LocationInputField';
import { fetchEvent, updateEvent } from '../../api/events';
import type { EventItem, UpdateEventRequest } from '../../api/events';
import { eventCategories } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';
import { formatHostDate, hasHostErrors, hostRequestError, mergeHostFieldErrors, validateEventDraft } from './hostFormUtils';
import type { EventDraft, HostFieldErrors, HostVenue } from './hostFormUtils';
import { formatCalendarDate } from '../../utils/dateFormat';

const MINUTE_INTERVAL: 15 | 30 = 15;
// Keep the date picker value in local YYYY-MM-DD form, without converting it to UTC.
const formatDateString = formatHostDate;

type Props = { eventId: string; onBack: () => void; onUpdated: (event: EventItem) => void };

export function EditEventScreen({ eventId, onBack, onUpdated }: Props) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [date, setDate] = useState(formatDateString(new Date()));
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 3600000));
  const [price, setPrice] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<HostVenue | null>(null);
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [errors, setErrors] = useState<HostFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const savingRef = useRef(false);
  const imageBusyRef = useRef(false);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);
  const originalSchedule = useRef<{ startsAt: string; endsAt: string; timeZone?: string } | null>(null);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '');

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    const controller = new AbortController();
    originalSchedule.current = null;
    setIsLoading(true); setLoadError(null);
    fetchEvent(eventId, controller.signal)
      .then(event => {
        if (!current) return;
        originalSchedule.current = { startsAt: event.startsAt, endsAt: event.endsAt, timeZone: event.timeZone };
        setTitle(event.title);
        setDescription(event.description || '');
        
        setSelectedCategories(event.categories);

        if (event.startsAt) {
          const startDate = new Date(event.startsAt);
          setDate(formatDateString(startDate));
          setStartTime(startDate);
        }
        if (event.endsAt) {
          setEndTime(new Date(event.endsAt));
        }
        // Canonical priceAmount is independent of the currency label. Keep a
        // readable fallback for older responses rather than silently making it free.
        const details = event;
        const storedPrice = typeof details.priceAmount === 'number' && Number.isFinite(details.priceAmount)
          ? String(details.priceAmount) : /^free$/i.test(event.price) ? '' : event.price.replace(/[$,]/g, '').trim();
        setPrice(storedPrice === '0' ? '' : storedPrice);
        if (event.venue || details.place) {
          setSelectedVenue({
            name: event.venue || details.place || '',
            address: event.address || '',
            placeId: details.placeId || undefined,
            ...(typeof event.latitude === 'number' && typeof event.longitude === 'number'
              ? { latitude: event.latitude, longitude: event.longitude } : {}),
          });
        } else setSelectedVenue(null);
        setPhotos(toEditablePhotos(event.photos, event.bannerImage));
        setPhotosChanged(false);
        setErrors({}); setFormError(null);
      })
      .catch(() => {
        if (current) setLoadError('Could not load event details for editing. Check your connection and try again.');
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });

    return () => { current = false; controller.abort(); mountedRef.current = false; };
  }, [eventId, loadAttempt]);

  const draft: EventDraft = { title, description, categories: selectedCategories, date, startTime, endTime, price, venue: selectedVenue, timeZone, photos };
  const validateFields = (fields: string[], changes: Partial<EventDraft> = {}) => {
    const next = validateEventDraft({ ...draft, ...changes }).errors;
    setErrors(current => mergeHostFieldErrors(current, next, fields));
  };
  const validateSchedule = (changes: Partial<EventDraft> = {}) => validateFields(['date', 'startTime', 'endTime', 'timeZone'], changes);
  const isOvernight = endTime.getHours() * 60 + endTime.getMinutes() < startTime.getHours() * 60 + startTime.getMinutes();
  const nextDay = new Date(`${date}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);

  const handleDateChange = (newDate: string) => setDate(newDate);
  const handleStartTimeChange = (value: Date) => setStartTime(value);
  const handleEndTimeChange = (value: Date) => setEndTime(value);
  const handleBack = () => { if (!savingRef.current && !imageBusyRef.current) onBack(); };

  const handlePhotoBusyChange = (busy: boolean) => {
    imageBusyRef.current = busy;
    if (mountedRef.current) setImageBusy(busy);
  };

  const handleSubmit = async () => {
    if (isLoading || loadError || savingRef.current || imageBusyRef.current || completedRef.current) return;
    const { errors: nextErrors, start, end, priceAmount } = validateEventDraft(draft);
    setErrors(nextErrors); setFormError(null);
    if (hasHostErrors(nextErrors) || !start || !end || priceAmount === null || !selectedVenue) return;

    // Metadata-only edits keep the event's saved display zone. When the host
    // changes either instant, the device-local pickers use the device zone.
    const original = originalSchedule.current;
    const unchangedSchedule = original && start.getTime() === Date.parse(original.startsAt) && end.getTime() === Date.parse(original.endsAt);
    const savedTimeZone = original && unchangedSchedule && original.timeZone ? original.timeZone : timeZone;

    const payload: UpdateEventRequest = {
      title: title.trim(),
      categories: selectedCategories,
      description: description.trim(),
      price: priceAmount,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timeZone: savedTimeZone,
      address: selectedVenue.address?.trim() || '',
      place: selectedVenue.name.trim(),
      ...(selectedVenue.placeId ? { placeId: selectedVenue.placeId } : {}),
      latitude: selectedVenue.latitude,
      longitude: selectedVenue.longitude,
    };

    savingRef.current = true;
    setIsSaving(true);
    try {
      const updated = await updateEvent(eventId, { ...payload,
        ...(photosChanged ? { photos: toPhotoInput(photos) } : {}),
      });
      completedRef.current = true;
      if (!mountedRef.current) return;
      onUpdated(updated);
      Alert.alert('Success', 'Event Updated!', [{ text: 'OK', onPress: onBack }]);
    } catch (error) {
      if (mountedRef.current) {
        const feedback = hostRequestError(error, 'Unable to update your event. Please try again.');
        setErrors(feedback.errors); setFormError(feedback.message);
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.muted }}>Loading event data...</Text>
      </View>
    );
  }
  if (loadError) {
    return <View style={[styles.content, { flex: 1, backgroundColor: colors.background }]}>
      <AppButton title="Back" variant="quiet" onPress={onBack} />
      <FieldError message={loadError} />
      <AppButton title="Retry" onPress={() => setLoadAttempt(current => current + 1)} style={styles.submitButton} />
    </View>;
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text onPress={handleBack} style={[styles.backLink, { color: colors.primary }]}>‹ Back</Text>
        <ScreenHeader eyebrow="Event Management" title="Edit Event" subtitle="Update your event information and schedule." />
        
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Event Title*</Text>
          <TextInput value={title} onChangeText={setTitle} onBlur={() => validateFields(['title'])} editable={!isSaving} maxLength={150} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          <FieldError message={errors.title} />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Description*</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            onBlur={() => validateFields(['description'])}
            editable={!isSaving}
            maxLength={10000}
            multiline
            numberOfLines={4}
            style={[styles.fieldInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <FieldError message={errors.description} />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Categories*</Text>
          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>Choose all that apply.</Text>
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
                <Text style={[styles.chipText, { color: colors.text }, selectedCategories.includes(cat) && styles.activeChipText]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FieldError message={errors.categories} />
        </View>

        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Times use your device time zone: {timeZone || 'Unavailable'}</Text>
        <FieldError message={errors.timeZone} />
        <DatePickerField label="Event Date*" date={date} onDateChange={handleDateChange} minimumDate={formatDateString(new Date())}
          error={errors.date} onBlur={value => validateSchedule({ date: value })} disabled={isSaving} />

        <View style={styles.timeSection}>
          <View style={styles.splitRow}>
            <TimePickerField label="Start Time*" time={startTime} onTimeChange={handleStartTimeChange} minuteInterval={MINUTE_INTERVAL}
              error={errors.startTime} onBlur={value => validateSchedule({ startTime: value })} disabled={isSaving} />
            <TimePickerField label="End Time*" time={endTime} onTimeChange={handleEndTimeChange} minuteInterval={MINUTE_INTERVAL}
              error={errors.endTime} onBlur={value => validateSchedule({ endTime: value })} disabled={isSaving} />
          </View>
          {isOvernight && <Text style={{ color: colors.primary, fontSize: 11, marginTop: 6 }}>
            Ends the following day ({formatCalendarDate(formatDateString(nextDay))})
          </Text>}
        </View>

        <PriceInputField label="Ticket Price" price={price} onPriceChange={setPrice}
          error={errors.price} onBlur={() => validateFields(['price'])} disabled={isSaving} />

        <LocationComponent initialValue={selectedVenue?.name}
          onVenueSelected={venue => { setSelectedVenue(venue); validateFields(['location'], { venue }); }}
          onSelectionCleared={() => setSelectedVenue(null)} onBlur={() => validateFields(['location'])}
          error={errors.location} disabled={isSaving} />

        <PhotoPickerField photos={photos} onChange={next => { setPhotos(next); setPhotosChanged(true); }}
          label="Event photos" disabled={isLoading || isSaving || completedRef.current} onBusyChange={handlePhotoBusyChange}
          error={errors.photos} onBlur={value => validateFields(['photos'], { photos: value })} />

        <FieldError message={formError} />
        <AppButton title={isSaving ? "Saving Changes..." : "Save Changes"} onPress={handleSubmit} disabled={isSaving || imageBusy || completedRef.current} style={styles.submitButton} />
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
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, fontSize: 14 },
  textArea: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '700' },
  activeChipText: { color: '#FFFFFF' },
  submitButton: { marginTop: 10 }
});
