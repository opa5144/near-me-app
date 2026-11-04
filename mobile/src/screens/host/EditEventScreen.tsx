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
import { fetchEvent, updateEvent } from '../../api/events';
import type { EventItem, UpdateEventRequest } from '../../api/events';
import { categories } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';

// All is a browsing filter; new events must use a specific category.
const eventCategories = categories.filter(category => category !== 'All');
const MINUTE_INTERVAL: 15 | 30 = 15;
const MAX_IMAGE_BYTES = 1024 * 1024;
// Keep the date picker value in local YYYY-MM-DD form, without converting it to UTC.
const formatDateString = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

// Safeguard price parser so empty, zero, or valid numbers parse correctly
const priceToAmount = (value: string): number | null => {
  const text = value.trim();
  if (!text || text === '0' || text === '0.00') return 0;
  const num = Number(text);
  return !isNaN(num) && num >= 0 ? num : null;
};

// Base64 text is larger than the image bytes; apply the 1 MiB limit to decoded bytes.
const decodedBase64Bytes = (value: string) =>
  (value.length * 3) / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

// Normalize any selected image to a centered 16:9 JPEG, up to 1280 pixels wide.
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

type Props = { eventId: string; onBack: () => void; onUpdated: (event: EventItem) => void };

export function EditEventScreen({ eventId, onBack, onUpdated }: Props) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [date, setDate] = useState(formatDateString(new Date()));
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 3600000));
  const [price, setPrice] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const savingRef = useRef(false);
  const imageBusyRef = useRef(false);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '');

  useEffect(() => {
    mountedRef.current = true;
    fetchEvent(eventId)
      .then(event => {
        if (!mountedRef.current) return;
        setTitle(event.title);
        setDescription(event.description || '');
        
        const matchedCategory = eventCategories.includes(event.category) ? event.category : eventCategories[0];
        setSelectedCategory(matchedCategory);

        if (event.startsAt) {
          const startDate = new Date(event.startsAt);
          setDate(formatDateString(startDate));
          setStartTime(startDate);
        }
        if (event.endsAt) {
          setEndTime(new Date(event.endsAt));
        }
        if (event.price !== undefined && event.price !== null) {
          const numericPrice = Number(event.price);
          setPrice(numericPrice === 0 || isNaN(numericPrice) ? '' : numericPrice.toString());
        }
        if (event.venue || event.place) {
          setSelectedVenue({
            name: event.venue || event.place || '',
            address: event.address || '',
            placeId: event.placeId || '',
            latitude: typeof event.latitude === 'number' ? event.latitude : 0,
            longitude: typeof event.longitude === 'number' ? event.longitude : 0,
          });
        }
        if (event.bannerImage) {
          setBannerImage(event.bannerImage);
        }
      })
      .catch(() => {
        if (mountedRef.current) Alert.alert('Error', 'Could not load event details for editing.');
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });

    return () => { mountedRef.current = false; };
  }, [eventId]);

  const getMinutesFromMidnight = (value: Date) => value.getHours() * 60 + value.getMinutes();
  const startMins = getMinutesFromMidnight(startTime);
  const endMins = getMinutesFromMidnight(endTime);
  const isOvernight = endMins < startMins;
  const previewStart = new Date(`${date}T00:00:00`);
  const previewEnd = new Date(previewStart);
  if (isOvernight) previewEnd.setDate(previewEnd.getDate() + 1);
  previewStart.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
  previewEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

  const handleDateChange = (newDate: string) => setDate(newDate);
  const handleStartTimeChange = (value: Date) => setStartTime(value);
  const handleEndTimeChange = (value: Date) => setEndTime(value);
  const handleBack = () => { if (!savingRef.current && !imageBusyRef.current) onBack(); };

  const handlePickImage = async () => {
    if (savingRef.current || imageBusyRef.current || completedRef.current) return;
    imageBusyRef.current = true;
    setImageBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Permission to access the media library is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const prepared = await prepareBanner(result.assets[0].uri);
      if (mountedRef.current) { setBannerImage(prepared.uri); setImageBase64(prepared.base64); }
    } catch (error) {
      if (mountedRef.current) Alert.alert('Image Error', error instanceof Error ? error.message : 'Could not prepare image.');
    } finally {
      imageBusyRef.current = false;
      if (mountedRef.current) setImageBusy(false);
    }
  };

  const handleRemoveImage = () => {
    if (savingRef.current || imageBusyRef.current || completedRef.current) return;
    setBannerImage(null);
    setImageBase64(null);
  };

  const handleSubmit = async () => {
    if (savingRef.current || imageBusyRef.current || completedRef.current) return;
    if (!title.trim()) { Alert.alert('Missing Title', 'Please enter an event title.'); return; }
    if (!description.trim()) { Alert.alert('Missing Description', 'Please enter an event description.'); return; }
    if (!eventCategories.includes(selectedCategory)) { Alert.alert('Missing Category', 'Please select an event category.'); return; }
    if (!selectedVenue?.name?.trim()) {
      Alert.alert('Missing Location', 'Please select or confirm a venue.'); return;
    }

    const priceAmount = priceToAmount(price);
    if (priceAmount === null) { Alert.alert('Invalid Price', 'Enter a valid price with up to two decimal places, or leave it blank for free.'); return; }

    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    if (isOvernight) end.setDate(end.getDate() + 1);
    start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

    const payload: UpdateEventRequest = {
      title: title.trim(),
      category: selectedCategory,
      description: description.trim(),
      price: priceAmount,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timeZone: timeZone || 'UTC',
      address: selectedVenue.address?.trim() || '',
      place: selectedVenue.name.trim(),
      ...(selectedVenue.placeId ? { placeId: selectedVenue.placeId } : {}),
      latitude: typeof selectedVenue.latitude === 'number' ? selectedVenue.latitude : 0,
      longitude: typeof selectedVenue.longitude === 'number' ? selectedVenue.longitude : 0,
      ...(imageBase64 ? { imageBase64 } : {}),
    };

    savingRef.current = true;
    setIsSaving(true);
    try {
      const updated = await updateEvent(eventId, payload);
      completedRef.current = true;
      onUpdated(updated);
      Alert.alert('Success', 'Event Updated!', [{ text: 'OK', onPress: onBack }]);
    } catch (error) {
      console.log('--- FULL ERROR OBJECT ---', error);
      
      let message = 'Unable to update your event.';
      if (isAxiosError(error)) {
        console.log('SERVER RESPONSE DATA:', JSON.stringify(error.response?.data, null, 2));
        console.log('SERVER STATUS CODE:', error.response?.status);

        const serverData = error.response?.data;
        if (typeof serverData === 'string') {
          message = serverData;
        } else if (serverData?.message) {
          message = Array.isArray(serverData.message) ? serverData.message.join(', ') : serverData.message;
        } else if (serverData?.error) {
          message = serverData.error;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }

      if (mountedRef.current) Alert.alert('Detailed Update Error', message);
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

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text onPress={handleBack} style={[styles.backLink, { color: colors.primary }]}>‹ Back</Text>
        <ScreenHeader eyebrow="Event Management" title="Edit Event" subtitle="Update your event information and schedule." />
        
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Event Title*</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={150} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Description*</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            maxLength={10000}
            multiline
            numberOfLines={4}
            style={[styles.fieldInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
        </View>

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

        <DatePickerField label="Event Date*" date={date} onDateChange={handleDateChange} />

        <View style={styles.timeSection}>
          <View style={styles.splitRow}>
            <TimePickerField label="Start Time*" time={startTime} onTimeChange={handleStartTimeChange} minuteInterval={MINUTE_INTERVAL} />
            <TimePickerField label="End Time*" time={endTime} onTimeChange={handleEndTimeChange} minuteInterval={MINUTE_INTERVAL} />
          </View>
        </View>

        <PriceInputField label="Ticket Price" price={price} onPriceChange={setPrice} />

        <LocationComponent initialValue={selectedVenue?.name} onVenueSelected={setSelectedVenue} onSelectionCleared={() => setSelectedVenue(null)} />

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Banner Image</Text>
          {imageBusy && <Text style={{ color: colors.muted, marginBottom: 8 }}>Preparing banner...</Text>}
          {bannerImage ? (
            <View style={[styles.imagePreviewContainer, { borderColor: colors.border }]}>
              <Image source={{ uri: bannerImage }} style={styles.bannerImagePreview} />
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={handlePickImage} disabled={isSaving || imageBusy} style={styles.changeBtn}>
                  <Text style={styles.actionBtnText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRemoveImage} disabled={isSaving || imageBusy} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={handlePickImage} disabled={isSaving || imageBusy} style={[styles.imagePlaceholderFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.placeholderGlyph}>🖼️</Text>
              <Text style={[styles.placeholderText, { color: colors.muted }]}>Tap to select and crop image (optional)</Text>
            </TouchableOpacity>
          )}
        </View>

        <AppButton title={isSaving ? "Saving Changes..." : "Save Changes"} onPress={handleSubmit} disabled={isSaving || imageBusy} style={styles.submitButton} />
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