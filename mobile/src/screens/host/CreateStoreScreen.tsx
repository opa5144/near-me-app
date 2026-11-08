
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import {
  BusinessHoursEditor,
  businessDays
} from '../../components/BusinessHoursEditor';
import type {
  BusinessHoursData,
  BusinessDay
} from '../../components/BusinessHoursEditor';

import { LocationComponent } from '../../components/LocationInputField';
import type { EventPlace } from '../../api/maps';
import { categories } from '../../data/events';
import { useTheme } from '../../context/ThemeContext';

const storeCategories = categories.filter(category => category !== 'All');

const createTime = (hour: number, minute = 0) => {
  const time = new Date();
  time.setHours(hour, minute, 0, 0);
  return time;
};

const initialHours: BusinessHoursData = {
  Sunday: { open: true, openTime: createTime(9), closeTime: createTime(17) },
  Monday: { open: true, openTime: createTime(9), closeTime: createTime(17) },
  Tuesday: { open: true, openTime: createTime(9), closeTime: createTime(17) },
  Wednesday: { open: false, openTime: createTime(9), closeTime: createTime(17) },
  Thursday: { open: false, openTime: createTime(9), closeTime: createTime(17) },
  Friday: { open: false, openTime: createTime(9), closeTime: createTime(17) },
  Saturday: { open: false, openTime: createTime(9), closeTime: createTime(17) }
};

export function CreateStoreScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();

  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [hours, setHours] = useState<BusinessHoursData>(initialHours);
  const [selectedVenue, setSelectedVenue] = useState<EventPlace | null>(null);
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const handlePickImage = async () => {
    if (imageBusy) return;

    setImageBusy(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission Required', 'Allow photo library access to select a store banner.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8
      });

      if (!result.canceled && result.assets.length > 0) {
        setBannerImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Image Error', 'Unable to select the banner image.');
    } finally {
      setImageBusy(false);
    }
  };

  const handlePublish = () => {
    if (!storeName.trim()) {
      Alert.alert('Missing Business Name', 'Please enter your legal business name.');
      return;
    }

    if (!category) {
      Alert.alert('Missing Category', 'Please select a vendor category.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please describe your business.');
      return;
    }

    if (!selectedVenue?.name.trim() || !selectedVenue.address.trim()) {
      Alert.alert('Missing Location', 'Please select a business location.');
      return;
    }

    const storeDraft = {
      name: storeName.trim(),
      category,
      description: description.trim(),
      address: selectedVenue.address.trim(),
      place: selectedVenue.name.trim(),
      placeId: selectedVenue.placeId || undefined,
      latitude: selectedVenue.latitude,
      longitude: selectedVenue.longitude,
      businessHours: businessDays.map((day: BusinessDay) => ({
        day,
        isOpen: hours[day].open,
        opensAt: hours[day].open ? hours[day].openTime : null,
        closesAt: hours[day].open ? hours[day].closeTime : null
      })),
      bannerImage
    };

    // Placeholder until the store API is implemented.
    console.log('Store draft ready:', storeDraft);

    Alert.alert(
      'Store Draft Ready',
      'Your store information is ready to connect to the backend.'
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation */}
        <Text
          onPress={onBack}
          style={[styles.backLink, { color: colors.primary }]}
        >
          ‹  Back
        </Text>

        <ScreenHeader
          eyebrow="Directory Mode"
          title="Create Store"
          subtitle="Tell us about your business location parameters."
        />

        {/* Google Maps import */}
        <TouchableOpacity
          style={[styles.googleMapsButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert(
              'Google Maps Import',
              'Google Maps import will be connected once the backend integration is ready.'
            )
          }
        >
          <Text style={styles.googleMapsText}>
            🗺️  Import from Google Maps
          </Text>
        </TouchableOpacity>

        {/* Business name */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Legal Business Name
          </Text>

          <TextInput
            value={storeName}
            onChangeText={setStoreName}
            maxLength={150}
            placeholder="e.g. Clover Bakery"
            placeholderTextColor={colors.muted}
            style={[
              styles.fieldInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text
              }
            ]}
          />
        </View>

        {/* Category */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Vendor Category
          </Text>

          <TouchableOpacity
            style={[
              styles.dropdown,
              { backgroundColor: colors.surface, borderColor: colors.border }
            ]}
            onPress={() => setCategoryExpanded(previous => !previous)}
          >
            <Text style={{ color: category ? colors.text : colors.muted }}>
              {category || 'Select Category'}
            </Text>
            <Text style={{ color: colors.muted }}>⌄</Text>
          </TouchableOpacity>

          {categoryExpanded && (
            <View
              style={[
                styles.categoryList,
                { backgroundColor: colors.surface, borderColor: colors.border }
              ]}
            >
              {storeCategories.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    setCategory(item);
                    setCategoryExpanded(false);
                  }}
                  style={[styles.categoryOption, { borderBottomColor: colors.border }]}
                >
                  <Text style={{ color: colors.text }}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Store Description
          </Text>

          <TextInput
            value={description}
            onChangeText={setDescription}
            maxLength={5000}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            placeholder="Share your specialties with customers..."
            placeholderTextColor={colors.muted}
            style={[
              styles.fieldInput,
              styles.descriptionInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text
              }
            ]}
          />
        </View>

        {/* Business hours */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Business Hours
          </Text>

          <BusinessHoursEditor
            hours={hours}
            onChange={setHours}
          />
        </View>

        {/* Location */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Location Address Picker
          </Text>

          <LocationComponent
            onVenueSelected={setSelectedVenue}
            onSelectionCleared={() => setSelectedVenue(null)}
          />
        </View>

        {/* Banner image */}
        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Upload Banner Image
          </Text>

          {bannerImage ? (
            <View style={[styles.imagePreviewContainer, { borderColor: colors.border }]}>
              <Image
                source={{ uri: bannerImage }}
                style={styles.bannerPreview}
              />

              <View style={styles.imageActions}>
                <TouchableOpacity
                  onPress={handlePickImage}
                  disabled={imageBusy}
                  style={styles.changeImageButton}
                >
                  <Text style={styles.imageActionText}>Change</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setBannerImage(null)}
                  disabled={imageBusy}
                  style={styles.removeImageButton}
                >
                  <Text style={styles.imageActionText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handlePickImage}
              disabled={imageBusy}
              style={[
                styles.imagePlaceholder,
                { backgroundColor: colors.surface, borderColor: colors.primary }
              ]}
            >
              <Text style={styles.imageIcon}>🖼️</Text>
              <Text style={[styles.imageTitle, { color: colors.text }]}>
                {imageBusy ? 'Preparing image...' : 'Drop your banner here'}
              </Text>
              <Text style={[styles.imageSubtitle, { color: colors.muted }]}>
                or browse files · JPG or PNG
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <AppButton
          title="Publish Store"
          onPress={handlePublish}
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  backLink: {
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 12
  },

  googleMapsButton: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18
  },
  googleMapsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800'
  },

  formGroup: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6
  },
  fieldInput: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 12
  },
  descriptionInput: {
    minHeight: 90,
    paddingTop: 12
  },

  dropdown: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  categoryList: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden'
  },
  categoryOption: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },

  imagePlaceholder: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  imageIcon: { fontSize: 24 },
  imageTitle: { fontSize: 12, fontWeight: '800' },
  imageSubtitle: { fontSize: 10 },

  imagePreviewContainer: {
    height: 150,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden'
  },
  bannerPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  imageActions: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8
  },
  changeImageButton: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8
  },
  removeImageButton: {
    backgroundColor: 'rgba(210,50,50,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8
  },
  imageActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },

  submitButton: { marginTop: 12 }
});
