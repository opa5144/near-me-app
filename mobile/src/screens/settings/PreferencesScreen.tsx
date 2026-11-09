import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';
import { fetchPreferences, searchSettingsCities, settingsErrorMessage, updatePreferences } from '../../api/settings';
import type { CitySuggestion, PreferencesResponse, SubscribedCity } from '../../api/settings';

export function PreferencesScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<Record<string, boolean>>({});
  const [cities, setCities] = useState<SubscribedCity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const viewVersion = useRef(0);
  const searchVersion = useRef(0);
  const focused = useRef(false);
  const searchController = useRef<AbortController | null>(null);
  const pendingSave = useRef<Promise<PreferencesResponse> | null>(null);

  function applyResponse(response: PreferencesResponse) {
    setAvailableCategories(response.categories);
    // Missing category flags are off. Keep every city, including unsubscribed ones.
    setCategories(Object.fromEntries(response.categories.map(category => [category, response.preferences.categories[category] === true])));
    setCities(response.preferences.cities);
  }

  // Reload on a new visit or explicit retry, never on each edit. Waiting for a
  // previous save avoids reading stale settings after leaving and coming back.
  useFocusEffect(useCallback(() => {
    const version = ++viewVersion.current;
    const controller = new AbortController();
    focused.current = true;
    setIsLoading(true); setLoadError(null); setSaveError(null); setSaved(false);
    setQuery(''); setSuggestions([]); setSearchError(null);
    async function load() {
      try {
        await pendingSave.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const response = await fetchPreferences(controller.signal);
        if (viewVersion.current === version) applyResponse(response);
      } catch (error: unknown) {
        if (viewVersion.current === version && !controller.signal.aborted) setLoadError(settingsErrorMessage(error, 'Unable to load your preferences. Please try again.'));
      } finally {
        if (viewVersion.current === version) { setIsLoading(false); setIsSaving(false); }
      }
    }
    void load();
    return () => { focused.current = false; ++viewVersion.current; ++searchVersion.current; controller.abort(); searchController.current?.abort(); };
  }, [loadAttempt]));

  // A short pause avoids requesting every keystroke. Both abort and revision
  // checks prevent older city results from replacing a more recent search.
  useEffect(() => {
    const revision = ++searchVersion.current;
    const version = viewVersion.current;
    const controller = new AbortController();
    searchController.current = controller;
    setSuggestions([]); setSearchError(null); setIsSearching(false); setSearchedQuery('');
    const text = query.trim();
    if (!focused.current || isLoading || isSaving || text.length < 3) return () => controller.abort();
    setIsSearching(true);
    const timer = setTimeout(() => {
      if (controller.signal.aborted || !focused.current || searchVersion.current !== revision) return;
      void searchSettingsCities(text, controller.signal).then(result => {
        if (!controller.signal.aborted && focused.current && viewVersion.current === version && searchVersion.current === revision) { setSuggestions(result); setSearchedQuery(text); }
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && focused.current && viewVersion.current === version && searchVersion.current === revision) setSearchError(settingsErrorMessage(error, 'Unable to search cities. Please try again.'));
      }).finally(() => {
        if (!controller.signal.aborted && focused.current && viewVersion.current === version && searchVersion.current === revision) setIsSearching(false);
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, isLoading, isSaving, searchAttempt]);

  function editQuery(value: string) {
    ++searchVersion.current;
    setQuery(value); setSuggestions([]); setSearchError(null); setSearchedQuery('');
  }
  function addCity(city: CitySuggestion) {
    if (pendingSave.current) return;
    setCities(current => current.some(item => item.placeId === city.placeId)
      ? current.map(item => item.placeId === city.placeId ? { ...item, ...city, subscribed: true, unavailable: false } : item)
      : [...current, { ...city, subscribed: true }]);
    editQuery(''); setSaveError(null); setSaved(false);
  }
  function toggleCategory(category: string) {
    if (pendingSave.current) return;
    setCategories(current => ({ ...current, [category]: !current[category] })); setSaveError(null); setSaved(false);
  }
  function toggleCity(placeId: string, subscribed: boolean) {
    if (pendingSave.current) return;
    setCities(current => current.map(city => city.placeId === placeId ? { ...city, subscribed } : city)); setSaveError(null); setSaved(false);
  }
  async function handleSave() {
    if (isLoading || isSaving || loadError || pendingSave.current) return;
    setIsSaving(true); setSaveError(null); setSaved(false);
    const version = viewVersion.current;
    // Metadata comes back canonicalized by the server; only IDs and flags are sent.
    const request = updatePreferences({ categories: { ...categories }, cities: cities.map(city => ({ placeId: city.placeId, subscribed: city.subscribed })) });
    pendingSave.current = request;
    try {
      const response = await request;
      if (viewVersion.current !== version) return;
      applyResponse(response); editQuery(''); setSaved(true);
    } catch (error: unknown) {
      if (viewVersion.current === version) setSaveError(settingsErrorMessage(error, 'Unable to save your preferences. Please try again.'));
    } finally {
      if (pendingSave.current === request) pendingSave.current = null;
      if (viewVersion.current === version) setIsSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <AppButton title="Back to Settings" variant="quiet" alignment="left" onPress={() => navigation.goBack()} disabled={isSaving} style={styles.backButton} />
      <ScreenHeader title="My Preferences" subtitle="Choose the categories and cities you want to follow." />
      {isLoading ? <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={[styles.note, { color: colors.muted }]}>Loading your preferences...</Text></View> : loadError ? (
        <View style={styles.status}><Text accessibilityRole="alert" style={[styles.note, { color: errorColor }]}>{loadError}</Text><AppButton title="Retry" onPress={() => setLoadAttempt(current => current + 1)} /></View>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferred Categories</Text>
          <View style={styles.chipContainer}>
            {availableCategories.map(category => (
              <TouchableOpacity key={category} accessibilityRole="checkbox" accessibilityState={{ checked: categories[category] === true, disabled: isSaving }} disabled={isSaving} onPress={() => toggleCategory(category)} style={[styles.chip, { backgroundColor: categories[category] ? colors.primary : colors.surface, borderColor: categories[category] ? colors.primary : colors.border }, isSaving && styles.disabled]}>
                <Text style={[styles.chipText, { color: categories[category] ? '#fff' : colors.text }, categories[category] && styles.activeChipText]}>{category}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Subscribed Cities</Text>
          <Text style={[styles.note, { color: colors.muted }]}>Search for any city to add it. Turning a city off keeps it in your list.</Text>
          <Text style={[styles.searchLabel, { color: colors.text }]}>Find a city</Text>
          <TextInput accessibilityLabel="Find a city" value={query} onChangeText={editQuery} editable={!isSaving} autoCorrect={false} placeholder="Search by city name" placeholderTextColor={colors.muted} style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          {query.trim().length > 0 && query.trim().length < 3 && <Text style={[styles.note, { color: colors.muted }]}>Enter at least 3 characters.</Text>}
          {isSearching && <ActivityIndicator accessibilityLabel="Searching cities" color={colors.primary} style={styles.searchIndicator} />}
          {searchError && <View><Text accessibilityRole="alert" style={[styles.feedback, { color: errorColor }]}>{searchError}</Text><AppButton title="Retry City Search" variant="quiet" disabled={isSaving} onPress={() => setSearchAttempt(current => current + 1)} /></View>}
          {!!suggestions.length && (
            <View>
              <Text style={[styles.mapsAttribution, { color: theme === 'dark' ? '#FFFFFF' : '#5E5E5E' }]}>Google Maps</Text>
              {suggestions.map(city => (
                <TouchableOpacity key={city.placeId} accessibilityRole="button" accessibilityLabel={`Follow ${city.label}`} disabled={isSaving} onPress={() => addCity(city)} style={[styles.searchResult, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.rowCopy}><Text style={[styles.cityName, { color: colors.text }]}>{city.name}</Text><Text style={[styles.note, { color: colors.muted }]}>{city.label}</Text></View>
                  <Text style={[styles.addText, { color: colors.primary }]}>Add</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!isSearching && !searchError && searchedQuery === query.trim() && searchedQuery.length >= 3 && !suggestions.length && <Text style={[styles.note, { color: colors.muted }]}>No matching cities found.</Text>}
          <View style={styles.cityList}>
            {!!cities.length && <Text style={[styles.mapsAttribution, { color: theme === 'dark' ? '#FFFFFF' : '#5E5E5E' }]}>Google Maps</Text>}
            {cities.map(city => (
              <View key={city.placeId} style={[styles.cityRow, { backgroundColor: colors.surface, borderColor: colors.border }, isSaving && styles.disabled]}>
                <View style={styles.rowCopy}><Text style={[styles.cityName, { color: colors.text }]}>{city.name}</Text><Text style={[styles.note, { color: colors.muted }]}>{city.label}</Text></View>
                <Switch accessibilityLabel={`Follow ${city.label}`} value={city.subscribed} onValueChange={value => toggleCity(city.placeId, value)} disabled={isSaving} trackColor={{ true: colors.primary }} />
              </View>
            ))}
          </View>
          {!cities.length && <Text style={[styles.note, { color: colors.muted }]}>You are not following any cities yet.</Text>}
          {saveError && <Text accessibilityRole="alert" style={[styles.feedback, { color: errorColor }]}>{saveError}</Text>}
          {saved && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.primary }]}>Your preferences have been saved.</Text>}
          {isSaving && <ActivityIndicator color={colors.primary} style={styles.searchIndicator} />}
          <AppButton title={isSaving ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={isSaving} style={styles.saveButton} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backButton: { marginLeft: -8, paddingHorizontal: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { fontSize: 12 },
  activeChipText: { fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 19 },
  disabled: { opacity: 0.5 },
  status: { gap: 16, paddingVertical: 32 },
  searchLabel: { fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  searchInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 8 },
  searchIndicator: { marginVertical: 12 },
  searchResult: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 6, gap: 12 },
  rowCopy: { flex: 1 },
  cityName: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  addText: { fontSize: 12, fontWeight: '700' },
  cityList: { gap: 8, marginVertical: 14 },
  mapsAttribution: { fontSize: 12, fontWeight: '400', marginVertical: 6 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 10 },
  feedback: { fontSize: 13, lineHeight: 20, marginTop: 12 },
  saveButton: { marginTop: 20, marginBottom: 16 },
});
