import React, { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import debounce from 'lodash.debounce';
import { fetchPlaceSuggestions, fetchPlaceDetails, createSessionToken, PlaceSuggestion, EventPlace } from '../api/maps';
import { useTheme } from '../context/ThemeContext';

interface LocationComponentProps {
  onVenueSelected: (venue: EventPlace) => void;
  // Let a parent discard its old venue as soon as the search text changes.
  onSelectionCleared?: () => void;
}

export function LocationComponent({ onVenueSelected, onSelectionCleared }: LocationComponentProps) {
  const { colors } = useTheme();
  // State controls the search field, suggestion list and loading indicator.
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Keep one Maps session token for a search/selection cycle without rerendering.
  const sessionTokenRef = useRef(createSessionToken());
  // Abort cancels old autocomplete work; a revision number also ignores late results
  // from searches or place-detail requests that are no longer current.
  const abortControllerRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  // Wait for a pause in typing to reduce requests. Only the latest revision may
  // replace suggestions or clear its loading indicator.
  const debouncedFetch = useCallback(
    debounce(async (text: string, token: string, revision: number) => {
      if (revision !== revisionRef.current) return;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const results = await fetchPlaceSuggestions(text, token, controller.signal);
        if (revision === revisionRef.current) setSuggestions(results);
      } catch (error: any) {
        if (revision === revisionRef.current && error?.name !== 'AbortError' && error?.message !== 'canceled') {
          console.error('Autocomplete fetch error:', error);
        }
      } finally {
        if (revision === revisionRef.current) setIsLoading(false);
      }
    }, 350), []
  );
  // Invalidate late responses and cancel queued/in-flight autocomplete on unmount.
  useEffect(() => () => {
    revisionRef.current += 1;
    debouncedFetch.cancel();
    abortControllerRef.current?.abort();
  }, [debouncedFetch]);
  // Changing even one character invalidates the parent's previously selected venue;
  // the host must select a fresh result before that venue can be used to save.
  const handleTextChange = (text: string) => {
    const revision = ++revisionRef.current;
    debouncedFetch.cancel();
    abortControllerRef.current?.abort();
    setQuery(text);
    setSuggestions([]);
    onSelectionCleared?.();
    if (text.trim().length < 3) { setIsLoading(false); return; }
    setIsLoading(true);
    debouncedFetch(text, sessionTokenRef.current, revision);
  };
  // Suggestions contain labels; fetch full address/coordinates before notifying
  // the parent. Ignore those details if the user starts another search meanwhile.
  const handleSelectVenue = async (item: PlaceSuggestion) => {
    const revision = ++revisionRef.current;
    debouncedFetch.cancel();
    abortControllerRef.current?.abort();
    onSelectionCleared?.();
    setQuery(item.full);
    setSuggestions([]);
    setIsLoading(true);
    Keyboard.dismiss();
    const details = await fetchPlaceDetails(item.placeId, sessionTokenRef.current);
    if (revision !== revisionRef.current) return;
    setIsLoading(false);
    if (details) {
      onVenueSelected(details);
      // A completed selection ends this Maps session; later searches use a new token.
      sessionTokenRef.current = createSessionToken();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Location Address / Venue*</Text>
      <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={query}
          onChangeText={handleTextChange}
          placeholder="Search venues, bars, or stadiums..."
          placeholderTextColor={colors.muted}
          style={[styles.fieldInput, { color: colors.text }]}
          clearButtonMode="while-editing" 
        />
        {isLoading && <ActivityIndicator style={styles.loader} color={colors.primary} />}
      </View>

      {suggestions.length > 0 && (
        <View style={[styles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {suggestions.map((item) => (
            <TouchableOpacity 
              key={item.placeId} 
              style={[styles.dropdownItem, { borderBottomColor: colors.border }]} 
              onPress={() => handleSelectVenue(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.primaryText, { color: colors.text }]}>{item.primary}</Text>
              {item.secondary ? <Text style={[styles.secondaryText, { color: colors.muted }]}>{item.secondary}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14, position: 'relative', zIndex: 999 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, height: 44, paddingHorizontal: 14 },
  fieldInput: { flex: 1, height: '100%', fontSize: 12, fontWeight: '600', padding: 0 },
  loader: { marginRight: 10 },
  dropdownList: { 
    position: 'absolute', 
    top: 65, 
    left: 0, 
    right: 0, 
    maxHeight: 180, 
    borderWidth: 1, 
    borderRadius: 14, 
    zIndex: 9999, 
    elevation: 5, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 4,
    overflow: 'hidden'
  },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },
  primaryText: { fontSize: 13, fontWeight: '600' },
  secondaryText: { fontSize: 11, marginTop: 2 },
});