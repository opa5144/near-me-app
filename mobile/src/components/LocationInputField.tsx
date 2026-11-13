import React, { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import debounce from 'lodash.debounce';
import { fetchPlaceSuggestions, fetchPlaceDetails, createSessionToken, PlaceSuggestion, EventPlace } from '../api/maps';
import { useTheme } from '../context/ThemeContext';
import { FieldError } from './FieldError';

interface LocationComponentProps {
  initialValue?: string;
  onVenueSelected: (venue: EventPlace) => void;
  // Let a parent discard its old venue as soon as the search text changes.
  onSelectionCleared?: () => void;
  error?: string | null;
  onBlur?: () => void;
  disabled?: boolean;
}

export function LocationComponent({ initialValue, onVenueSelected, onSelectionCleared, error, onBlur, disabled = false }: LocationComponentProps) {
  const { colors } = useTheme();
  // State controls the search field, suggestion list and loading indicator.
  const [query, setQuery] = useState(initialValue || '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // Keep one Maps session token for a search/selection cycle without rerendering.
  const sessionTokenRef = useRef(createSessionToken());
  // Abort cancels old autocomplete work; a revision number also ignores late results
  // from searches or place-detail requests that are no longer current.
  const abortControllerRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const selectionPressed = useRef(false);
  const detailsPending = useRef(false);
  const deferredBlur = useRef(false);
  const latestBlur = useRef(onBlur);
  latestBlur.current = onBlur;
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
          setLookupError('Unable to search locations. Check your connection and try again.');
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
  useEffect(() => {
    if (!disabled) return;
    ++revisionRef.current;
    debouncedFetch.cancel(); abortControllerRef.current?.abort();
    setSuggestions([]); setIsLoading(false);
    selectionPressed.current = false; detailsPending.current = false; deferredBlur.current = false;
  }, [disabled, debouncedFetch]);
  // Changing even one character invalidates the parent's previously selected venue;
  // the host must select a fresh result before that venue can be used to save.
  const handleTextChange = (text: string) => {
    if (disabled) return;
    const revision = ++revisionRef.current;
    debouncedFetch.cancel();
    abortControllerRef.current?.abort();
    detailsPending.current = false; selectionPressed.current = false; deferredBlur.current = false;
    setQuery(text);
    setLookupError(null);
    setSuggestions([]);
    onSelectionCleared?.();
    if (text.trim().length < 3) { setIsLoading(false); return; }
    setIsLoading(true);
    debouncedFetch(text, sessionTokenRef.current, revision);
  };
  // Suggestions contain labels; fetch full address/coordinates before notifying
  // the parent. Ignore those details if the user starts another search meanwhile.
  const handleSelectVenue = async (item: PlaceSuggestion) => {
    if (disabled) return;
    setLookupError(null);
    detailsPending.current = true;
    const revision = ++revisionRef.current;
    debouncedFetch.cancel();
    abortControllerRef.current?.abort();
    onSelectionCleared?.();
    setQuery(item.full);
    setSuggestions([]);
    setIsLoading(true);
    Keyboard.dismiss();
    try {
      const details = await fetchPlaceDetails(item.placeId, sessionTokenRef.current);
      if (revision !== revisionRef.current) return;
      onVenueSelected(details);
      // A completed selection ends this Maps session; later searches use a new token.
      sessionTokenRef.current = createSessionToken();
    } catch {
      if (revision === revisionRef.current) setLookupError('Unable to load that location. Select it again or choose another result.');
    } finally {
      if (revision === revisionRef.current) {
        detailsPending.current = false; selectionPressed.current = false; deferredBlur.current = false;
        setIsLoading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Location Address / Venue*</Text>
      <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={query}
          onChangeText={handleTextChange}
          onBlur={() => {
            // Tapping a result blurs the keyboard before its details arrive.
            // Validate that completed selection, not the temporary empty venue.
            if (selectionPressed.current || detailsPending.current) deferredBlur.current = true;
            else onBlur?.();
          }}
          editable={!disabled}
          placeholder="Search venues, bars, or stadiums..."
          placeholderTextColor={colors.muted}
          style={[styles.fieldInput, { color: colors.text }]}
          clearButtonMode="while-editing" 
        />
        {isLoading && <ActivityIndicator style={styles.loader} color={colors.primary} />}
      </View>
      <FieldError message={lookupError || error} />

      {suggestions.length > 0 && (
        <View style={[styles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {suggestions.map((item) => (
            <TouchableOpacity 
              key={item.placeId} 
              style={[styles.dropdownItem, { borderBottomColor: colors.border }]} 
              onPress={() => handleSelectVenue(item)}
              onPressIn={() => { selectionPressed.current = true; }}
              onPressOut={() => {
                // A canceled press still counts as leaving the input. Wait for
                // onPress to begin details before deciding whether it canceled.
                const revision = revisionRef.current;
                setTimeout(() => {
                  if (revision !== revisionRef.current || detailsPending.current) return;
                  selectionPressed.current = false;
                  if (deferredBlur.current) { deferredBlur.current = false; latestBlur.current?.(); }
                }, 0);
              }}
              disabled={disabled}
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
    marginTop: 6,
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
