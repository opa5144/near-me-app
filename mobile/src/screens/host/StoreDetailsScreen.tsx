
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isAxiosError } from 'axios';

import { AppButton } from '../../components/AppButton';
import { PhotoCollection } from '../../components/PhotoCollection';
import { businessDays } from '../../components/BusinessHoursEditor';

import { fetchStore } from '../../api/stores';
import type { StoreBusinessHours, StoreItem } from '../../api/stores';

import { useTheme } from '../../context/ThemeContext';

function openingHours(hours: StoreBusinessHours): string {
  if (!hours.isOpen || !hours.opensAt || !hours.closesAt) return 'Closed';

  const clockLabel = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  };

  return `${clockLabel(hours.opensAt)} – ${clockLabel(hours.closesAt)}${hours.closesAt < hours.opensAt ? ' (next day)' : ''}`;
}

async function openContactLink(url: string, label: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open link', `Your device couldn't open the ${label}.`);
  }
}

export function StoreDetailsScreen({
  storeId,
  onBack
}: {
  storeId: string
  onBack: () => void
}) {
  const { colors, theme } = useTheme();

  const [store, setStore] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';

  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();

    setStore(null);
    setLoading(true);
    setError(null);

    if (!storeId) {
      setError('This store is unavailable.');
      setLoading(false);

      return () => {
        active = false;
        controller.abort();
      };
    }

    void fetchStore(storeId, controller.signal)
      .then(saved => {
        if (active) setStore(saved);
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;

        const status = isAxiosError(reason) ? reason.response?.status : undefined;

        setError(status === 400 || status === 404
          ? 'This store is unavailable.'
          : 'Unable to load this store. Check your connection and try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [storeId, attempt]));

  const owner = store && typeof store.ownerId === 'object' ? store.ownerId : null;

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <AppButton
        title="Back"
        variant="quiet"
        alignment="left"
        style={styles.backButton}
        onPress={onBack}
      />

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loading}
        />
      ) : error || !store ? (
        <View>
          <Text accessibilityRole="alert" style={[styles.message, { color: errorColor }]}>
            {error || 'This store is unavailable.'}
          </Text>

          <AppButton
            title="Retry"
            variant="secondary"
            onPress={() => setAttempt(current => current + 1)}
          />
        </View>
      ) : (
        <>
          <PhotoCollection
            photos={store.photos}
            fallbackUri={store.bannerImage}
            title={store.name}
            emoji="🏪"
            mode="hero"
          />

          <Text style={[styles.title, { color: colors.text }]}>
            {store.name}
          </Text>

          <Text style={[styles.categories, { color: colors.primary }]}>
            {store.categories.join(' · ')}
          </Text>

          {owner?.username && (
            <Text style={[styles.message, { color: colors.muted }]}>
              Owned by @{owner.username}
            </Text>
          )}

          <Text style={[styles.section, { color: colors.text }]}>
            Address
          </Text>

          {store.place !== store.name && (
            <Text style={[styles.body, { color: colors.text }]}>
              {store.place}
            </Text>
          )}

          <Text style={[styles.body, { color: colors.muted }]}>
            {store.address}
          </Text>

          {(store.phone || store.email || store.website) && (
            <>
              <Text style={[styles.section, { color: colors.text }]}>
                Contact Information
              </Text>

              {store.phone && (
                <Text
                  accessibilityRole="link"
                  accessibilityLabel={`Call ${store.phone}`}
                  onPress={() => void openContactLink(`tel:${store.phone}`, 'phone number')}
                  style={[styles.contactLink, { color: colors.primary }]}
                >
                  Phone: {store.phone}
                </Text>
              )}

              {store.email && (
                <Text
                  accessibilityRole="link"
                  accessibilityLabel={`Email ${store.email}`}
                  onPress={() => void openContactLink(`mailto:${store.email}`, 'email address')}
                  style={[styles.contactLink, { color: colors.primary }]}
                >
                  Email: {store.email}
                </Text>
              )}

              {store.website && (
                <Text
                  accessibilityRole="link"
                  accessibilityLabel={`Visit ${store.website}`}
                  onPress={() => void openContactLink(store.website!, 'website')}
                  style={[styles.contactLink, { color: colors.primary }]}
                >
                  Website: {store.website}
                </Text>
              )}
            </>
          )}

          <Text style={[styles.section, { color: colors.text }]}>
            About this store
          </Text>

          <Text style={[styles.body, { color: colors.muted }]}>
            {store.description}
          </Text>

          <Text style={[styles.section, { color: colors.text }]}>
            Business Hours
          </Text>

          <Text style={[styles.caption, { color: colors.muted }]}>
            All hours are in {store.timeZone}.
          </Text>

          {businessDays.map(day => {
            const hours = store.businessHours.find(value => value.day === day);

            return (
              <View key={day} style={[styles.hours, { borderColor: colors.border }]}>
                <Text style={[styles.day, { color: colors.text }]}>
                  {day}
                </Text>

                <Text style={[styles.hoursValue, { color: colors.muted }]}>
                  {hours ? openingHours(hours) : 'Unavailable'}
                </Text>
              </View>
            );
          })}

          <PhotoCollection
            photos={store.photos}
            fallbackUri={store.bannerImage}
            title={store.name}
            mode="gallery"
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, flexGrow: 1 },
  backButton: { paddingHorizontal: 0, marginBottom: 4 },
  loading: { marginTop: 20 },
  message: { fontSize: 12, lineHeight: 18, marginVertical: 6 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  categories: { fontSize: 12, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '800', marginTop: 10, marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 19 },
  contactLink: { fontSize: 14, lineHeight: 24, textDecorationLine: 'underline' },
  caption: { fontSize: 11, marginBottom: 4 },
  hours: { flexDirection: 'row', gap: 8, borderBottomWidth: 1, paddingVertical: 8 },
  day: { width: 84, fontSize: 13, fontWeight: '600' },
  hoursValue: { flex: 1, fontSize: 13, textAlign: 'right' },
});