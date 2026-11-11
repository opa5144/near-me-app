import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { isAxiosError } from 'axios';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BusinessHoursEditor, businessDays } from '../../components/BusinessHoursEditor';
import type { BusinessHoursData } from '../../components/BusinessHoursEditor';
import { LocationComponent } from '../../components/LocationInputField';
import { PhotoPickerField } from '../../components/PhotoPickerField';
import type { EditablePhoto } from '../../api/photos';
import { toPhotoInput } from '../../api/photos';
import type { EventPlace } from '../../api/maps';
import { createStore } from '../../api/stores';
import type { CreateStoreRequest, StoreItem } from '../../api/stores';
import { categories } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';

const storeCategories = categories.filter(category => category !== 'All');
const initialHours = (): BusinessHoursData => Object.fromEntries(businessDays.map(day => {
  const openTime = new Date();
  openTime.setHours(9, 0, 0, 0);
  const closeTime = new Date();
  closeTime.setHours(17, 0, 0, 0);
  return [day, { open: false, openTime, closeTime }];
})) as BusinessHoursData;
const clockTime = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;

type Props = { onBack: () => void; onCreated?: (store: StoreItem) => void };

export function CreateStoreScreen({ onBack, onCreated }: Props) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [storeName, setStoreName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState<BusinessHoursData>(initialHours);
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedStore, setPublishedStore] = useState<StoreItem | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);
  const completed = useRef(false);
  const returned = useRef(false);
  usePreventRemove(isSaving, () => {});
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Navigate only after the saving guard has been removed on the next render.
  useEffect(() => {
    if (!publishedStore || isSaving || returned.current) return;
    returned.current = true;
    if (onCreated) onCreated(publishedStore);
    else onBack();
  }, [publishedStore, isSaving, onCreated, onBack]);

  const handlePublish = async () => {
    if (saving.current || completed.current || photoBusy) return;
    setError(null);
    if (!storeName.trim()) return setError('Enter your business name.');
    if (!selectedCategories.length) return setError('Choose at least one vendor category.');
    if (!description.trim()) return setError('Describe your store.');
    if (!selectedVenue?.name.trim() || !selectedVenue.address.trim()) return setError('Select your store address from the location search.');
    try { new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).format(new Date()); }
    catch { return setError('Enter a valid business timezone, such as America/New_York.'); }
    for (const day of businessDays) {
      if (hours[day].open && clockTime(hours[day].openTime) === clockTime(hours[day].closeTime)) {
        return setError(`${day}: opening and closing times must be different.`);
      }
    }
    saving.current = true;
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      const input: CreateStoreRequest = {
        name: storeName.trim(), categories: selectedCategories, description: description.trim(),
        address: selectedVenue.address.trim(), place: selectedVenue.name.trim(),
        ...(selectedVenue.placeId ? { placeId: selectedVenue.placeId } : {}),
        latitude: selectedVenue.latitude, longitude: selectedVenue.longitude, timeZone: timeZone.trim(),
        businessHours: businessDays.map(day => ({
          day, isOpen: hours[day].open,
          opensAt: hours[day].open ? clockTime(hours[day].openTime) : null,
          closesAt: hours[day].open ? clockTime(hours[day].closeTime) : null,
        })),
        photos: toPhotoInput(photos),
      };
      const store = await createStore(input);
      if (!mounted.current) return;
      completed.current = true;
      setPublishedStore(store);
    } catch (reason: unknown) {
      if (!mounted.current) return;
      const data = isAxiosError<{ message?: string; errors?: Record<string, string> }>(reason) ? reason.response?.data : undefined;
      const fields = data?.errors ? Object.values(data.errors).filter(value => typeof value === 'string').join('\n') : '';
      setError(fields || data?.message || (reason instanceof Error && !isAxiosError(reason) ? reason.message : undefined)
        || 'Your store could not be published. Check your connection and try again.');
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }];
  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppButton title="Back" variant="quiet" alignment="left" onPress={onBack} disabled={isSaving} />
        <ScreenHeader eyebrow="Your business" title="Create Store" subtitle="Publish your store, photos, and weekly opening hours." />
        <View pointerEvents={isSaving ? 'none' : 'auto'}>
          <Text style={[styles.label, { color: colors.text }]}>Business Name</Text>
          <TextInput value={storeName} onChangeText={setStoreName} editable={!isSaving} maxLength={150} placeholder="e.g. Clover Bakery"
            accessibilityLabel="Business name" placeholderTextColor={colors.muted} style={inputStyle} />

          <Text style={[styles.label, { color: colors.text }]}>Vendor Categories</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Choose all that apply.</Text>
          <View style={styles.categories}>
            {storeCategories.map(category => {
              const selected = selectedCategories.includes(category);
              return <TouchableOpacity key={category} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
                onPress={() => setSelectedCategories(current => selected ? current.filter(value => value !== category) : [...current, category])}
                style={[styles.category, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}>
                <Text style={{ color: selected ? '#FFFFFF' : colors.text }}>{selected ? '✓ ' : ''}{category}</Text>
              </TouchableOpacity>;
            })}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Store Description</Text>
          <TextInput value={description} onChangeText={setDescription} editable={!isSaving} maxLength={5000} multiline numberOfLines={5}
            textAlignVertical="top" accessibilityLabel="Store description" placeholder="Share your specialties with customers…"
            placeholderTextColor={colors.muted} style={[...inputStyle, styles.description]} />

          <Text style={[styles.label, { color: colors.text }]}>Store Address</Text>
          <LocationComponent onVenueSelected={setSelectedVenue} onSelectionCleared={() => setSelectedVenue(null)} />

          <Text style={[styles.label, { color: colors.text }]}>Business Timezone</Text>
          <TextInput value={timeZone} onChangeText={setTimeZone} editable={!isSaving} autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Business timezone" placeholder="America/New_York" placeholderTextColor={colors.muted} style={inputStyle} />
          <Text style={[styles.hint, { color: colors.muted }]}>Use the timezone where your store is located.</Text>

          <Text style={[styles.label, { color: colors.text }]}>Business Hours</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Set each day to open or closed. A closing time before opening means the next day.</Text>
          <BusinessHoursEditor hours={hours} onChange={setHours} />
          <PhotoPickerField label="Store Photos" photos={photos} onChange={setPhotos} disabled={isSaving} onBusyChange={setPhotoBusy} />
        </View>
        {error && <Text accessibilityRole="alert" style={[styles.error, { color: errorColor }]}>{error}</Text>}
        <AppButton title={isSaving ? 'Publishing…' : photoBusy ? 'Preparing photo…' : 'Publish Store'}
          onPress={() => void handlePublish()} disabled={isSaving || photoBusy} style={styles.submit} />
      </ScrollView>
      <Modal visible={isSaving} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.busyOverlay}>
          <View accessibilityViewIsModal style={[styles.busyPanel, { backgroundColor: colors.surface }]}>
            <ActivityIndicator color={colors.primary} />
            <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>Publishing your store…</Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  description: { minHeight: 110, paddingTop: 12 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12, marginTop: 5 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderWidth: 1, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  error: { marginVertical: 14, fontSize: 13, lineHeight: 19 },
  submit: { marginTop: 18 },
  busyOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000066' },
  busyPanel: { padding: 24, borderRadius: 18, gap: 14, alignItems: 'center' },
});
