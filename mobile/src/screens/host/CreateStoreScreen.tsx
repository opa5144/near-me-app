
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { FieldError } from '../../components/FieldError';
import { BusinessHoursEditor, businessDays } from '../../components/BusinessHoursEditor';
import { CategoryPickerField } from '../../components/CategoryPickerField';
import type { BusinessHoursData } from '../../components/BusinessHoursEditor';
import { LocationComponent } from '../../components/LocationInputField';
import { PhotoPickerField } from '../../components/PhotoPickerField';
import type { EditablePhoto } from '../../api/photos';
import { toPhotoInput } from '../../api/photos';
import type { EventPlace } from '../../api/maps';
import { createStore } from '../../api/stores';
import type { CreateStoreRequest, StoreItem } from '../../api/stores';
import { storeCategories } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';
import { clockTime, hasHostErrors, hostRequestError, mergeHostFieldErrors, validateStoreDraft } from './hostFormUtils';
import type { HostFieldErrors, StoreDraft } from './hostFormUtils';

const initialHours = (): BusinessHoursData => Object.fromEntries(businessDays.map(day => {
  const openTime = new Date();
  openTime.setHours(9, 0, 0, 0);
  const closeTime = new Date();
  closeTime.setHours(17, 0, 0, 0);
  return [day, { open: false, openTime, closeTime }];
})) as BusinessHoursData;

type Props = { onBack: () => void; onCreated?: (store: StoreItem) => void };

export function CreateStoreScreen({ onBack, onCreated }: Props) {
  const { colors } = useTheme();
  const [storeName, setStoreName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [hours, setHours] = useState<BusinessHoursData>(initialHours);
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<HostFieldErrors>({});
  const [publishedStore, setPublishedStore] = useState<StoreItem | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);
  const photoBusyRef = useRef(false);
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

  const draft: StoreDraft = { name: storeName, description, categories: selectedCategories, venue: selectedVenue, timeZone, hours, photos, phone, email, website };
  const validateFields = (fields: string[], changes: Partial<StoreDraft> = {}) => {
    const next = validateStoreDraft({ ...draft, ...changes });
    setErrors(current => mergeHostFieldErrors(current, next, fields));
  };
  const validateHours = (value: BusinessHoursData) => validateFields(['businessHours', ...businessDays.map(day => `hours.${day}`)], { hours: value });

  const handlePublish = async () => {
    if (saving.current || completed.current || photoBusyRef.current) return;
    setError(null);
    const nextErrors = validateStoreDraft(draft);
    setErrors(nextErrors);
    if (hasHostErrors(nextErrors) || !selectedVenue) return;
    saving.current = true;
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      const input: CreateStoreRequest = {
        name: storeName.trim(), categories: selectedCategories, description: description.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
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
      const feedback = hostRequestError(reason, 'Your store could not be published. Check your connection and try again.');
      setErrors(feedback.errors); setError(feedback.message);
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }];
  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Navigation */}
        <AppButton title="‹  Back" variant="quiet" alignment="left" minHeight={44} onPress={onBack} disabled={isSaving} style={styles.backButton} textStyle={styles.backText} />
        <ScreenHeader eyebrow="Your business" title="Create Store" subtitle="Publish your store, photos, and weekly opening hours." />
        <View pointerEvents={isSaving ? 'none' : 'auto'}>
          <Text style={[styles.label, { color: colors.text }]}>Business Name</Text>
          <TextInput value={storeName} onChangeText={setStoreName} onBlur={() => validateFields(['name'])} editable={!isSaving} maxLength={150} placeholder="e.g. Clover Bakery"
            accessibilityLabel="Business name" placeholderTextColor={colors.muted} style={inputStyle} />
          <FieldError message={errors.name} />

          <CategoryPickerField label="Vendor Categories" categories={storeCategories} selectedCategories={selectedCategories}
            onChange={setSelectedCategories} onBlur={values => validateFields(['categories', 'category'], { categories: values })}
            error={errors.categories || errors.category} disabled={isSaving} />

          <Text style={[styles.label, { color: colors.text }]}>Store Description</Text>
          <TextInput value={description} onChangeText={setDescription} onBlur={() => validateFields(['description'])} editable={!isSaving} maxLength={5000} multiline numberOfLines={5}
            textAlignVertical="top" accessibilityLabel="Store description" placeholder="Share your specialties with customers…"
            placeholderTextColor={colors.muted} style={[...inputStyle, styles.description]} />
          <FieldError message={errors.description} />

          <Text style={[styles.label, { color: colors.text }]}>Contact Information</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>All contact details are optional.</Text>
          <TextInput value={phone} onChangeText={setPhone} onBlur={() => validateFields(['phone'])} editable={!isSaving} maxLength={30} keyboardType="phone-pad"
            accessibilityLabel="Business phone number" placeholder="Phone number (optional)" placeholderTextColor={colors.muted} style={inputStyle} />
          <FieldError message={errors.phone} />
          <TextInput value={email} onChangeText={setEmail} onBlur={() => validateFields(['email'])} editable={!isSaving} maxLength={254} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Business email address" placeholder="Email address (optional)" placeholderTextColor={colors.muted} style={[inputStyle, styles.contactInput]} />
          <FieldError message={errors.email} />
          <TextInput value={website} onChangeText={setWebsite} onBlur={() => validateFields(['website'])} editable={!isSaving} maxLength={500} keyboardType="url" autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Business website" placeholder="Website URL (optional, include https://)" placeholderTextColor={colors.muted} style={[inputStyle, styles.contactInput]} />
          <FieldError message={errors.website} />

          <Text style={[styles.label, { color: colors.text }]}>Store Address</Text>
          <LocationComponent onVenueSelected={venue => { setSelectedVenue(venue); validateFields(['location'], { venue }); }}
            onSelectionCleared={() => setSelectedVenue(null)} error={errors.location}
            onBlur={() => validateFields(['location'])} disabled={isSaving} />

          <Text style={[styles.label, { color: colors.text }]}>Business Timezone</Text>
          <TextInput value={timeZone} onChangeText={setTimeZone} onBlur={() => validateFields(['timeZone'])} editable={!isSaving} autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Business timezone" placeholder="America/New_York" placeholderTextColor={colors.muted} style={inputStyle} />
          <FieldError message={errors.timeZone} />
          <Text style={[styles.hint, { color: colors.muted }]}>Use the timezone where your store is located.</Text>

          <Text style={[styles.label, { color: colors.text }]}>Business Hours</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Set each day to open or closed. A closing time before opening means the next day.</Text>
          <BusinessHoursEditor hours={hours} onChange={setHours} disabled={isSaving}
            error={errors.businessHours} dayErrors={Object.fromEntries(businessDays.map(day => [day, errors[`hours.${day}`]]))}
            onBlur={validateHours} />
          <PhotoPickerField label="Store Photos" photos={photos} onChange={setPhotos} disabled={isSaving}
            onBusyChange={busy => { photoBusyRef.current = busy; setPhotoBusy(busy); }}
            error={errors.photos} onBlur={value => validateFields(['photos'], { photos: value })} />
        </View>
        <FieldError message={error} />
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
  backButton: { paddingHorizontal: 8, marginLeft: -8, marginBottom: 8 },
  backText: { fontWeight: '800', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  description: { minHeight: 110, paddingTop: 12 },
  contactInput: { marginTop: 10 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12, marginTop: 5 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderWidth: 1, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  submit: { marginTop: 18 },
  busyOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000066' },
  busyPanel: { padding: 24, borderRadius: 18, gap: 14, alignItems: 'center' },
});
