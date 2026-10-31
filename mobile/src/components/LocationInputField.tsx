import React, { useState, useCallback, useRef, useEffect } from 'react'; // 1. Added useEffect
import { StyleSheet, Text, TextInput, View, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import debounce from 'lodash.debounce';
import { fetchPlaceSuggestions, fetchPlaceDetails, createSessionToken, PlaceSuggestion, EventPlace } from '../api/maps';
import { useTheme } from '../context/ThemeContext';

interface LocationComponentProps {
  onVenueSelected: (venue: EventPlace) => void;
}

export function LocationComponent({ onVenueSelected }: LocationComponentProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const sessionTokenRef = useRef(createSessionToken());
  const abortControllerRef = useRef<AbortController | null>(null);

  const debouncedFetch = useCallback(
    debounce(async (text: string, token: string) => {
      if (text.trim().length < 3) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      try {
        const results = await fetchPlaceSuggestions(text, token, abortControllerRef.current.signal);
        setSuggestions(results);
      } catch (error: any) {
        if (error?.name !== 'AbortError' && error?.message !== 'canceled') {
          console.error("Autocomplete fetch error:", error);
        }
      } finally {
        setIsLoading(false);
      }
    }, 350),
    []
  );

  // 2. MINIMAL ADDITION: Cancels pending debounce triggers if the user leaves the screen
  useEffect(() => {
    return () => {
      debouncedFetch.cancel();
    };
  }, [debouncedFetch]);

  const handleTextChange = (text: string) => {
    setQuery(text);
    setIsLoading(true);
    debouncedFetch(text, sessionTokenRef.current);
  };

  const handleSelectVenue = async (item: PlaceSuggestion) => {
    setQuery(item.full);
    setSuggestions([]);
    setIsLoading(true);
    Keyboard.dismiss(); 

    const details = await fetchPlaceDetails(item.placeId, sessionTokenRef.current);
    setIsLoading(false);

    if (details) {
      onVenueSelected(details);
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