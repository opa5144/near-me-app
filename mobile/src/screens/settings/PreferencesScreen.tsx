import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

const CATEGORIES = ['Live Music', 'Food & Drinks', 'Outdoor & Nature', 'Arts & Culture', 'Sports & Fitness', 'Tech'];
const CITIES = ['New York', 'Los Angeles', 'Chicago', 'Austin', 'Seattle'];

export function PreferencesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [selectedCategories, setSelectedCategories] = useState(['Live Music', 'Food & Drinks']);
  const [selectedCities, setSelectedCities] = useState(['New York']);

  const toggleCategory = (item: string) => {
    setSelectedCategories(prev => prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="My Preferences" subtitle="Manage your subscribed cities and categories." />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferred Categories</Text>
      <View style={styles.chipContainer}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity 
            key={cat} 
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, selectedCategories.includes(cat) && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => toggleCategory(cat)}
          >
            <Text style={[styles.chipText, { color: colors.text }, selectedCategories.includes(cat) && styles.activeChipText]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Subscribed Cities</Text>
      <View style={styles.chipContainer}>
        {CITIES.map(city => (
          <TouchableOpacity 
            key={city} 
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, selectedCities.includes(city) && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city])}
          >
            <Text style={[styles.chipText, { color: colors.text }, selectedCities.includes(city) && styles.activeChipText]}>{city}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  chipText: { fontSize: 12 },
  activeChipText: { color: '#fff', fontWeight: '700' },
});