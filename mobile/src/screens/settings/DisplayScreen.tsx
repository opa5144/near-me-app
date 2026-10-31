import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

const themeOptions = [
  { id: 'system', title: 'System Default', subtitle: 'Match your device appearance' },
  { id: 'light', title: 'Light Mode', subtitle: 'Clean bright interface with high contrast' },
  { id: 'dark', title: 'Dark Mode', subtitle: 'Easy on the eyes in low-light environments' },
];

export function DisplayScreen({ navigation }: any) {
  const { theme, setTheme, colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="Display & Theme" subtitle="Customize how Near Me looks on your device." />

      <View style={styles.sectionContainer}>
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>Appearance Mode</Text>

        {themeOptions.map((option) => {
          const isSelected = theme === option.id;

          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.8}
              onPress={() => setTheme(option.id as any)}
              style={[
                styles.item,
                { backgroundColor: colors.surface, borderColor: colors.border },
                isSelected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
              ]}
            >
              <View style={styles.textContainer}>
                <Text style={[styles.itemTitle, { color: colors.text }, isSelected && { color: colors.primary }]}>
                  {option.title}
                </Text>
                <Text style={[styles.itemSubtitle, { color: colors.muted }]}>{option.subtitle}</Text>
              </View>

              <View style={[styles.radioCircle, { borderColor: colors.border, backgroundColor: colors.surface }, isSelected && { borderColor: colors.primary }]}>
                {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.bannerNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.bannerNoteText, { color: colors.muted }]}>
          💡 Changing your theme here now updates the entire app globally.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  sectionContainer: { marginBottom: 20 },
  sectionHeader: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 15, marginBottom: 10 },
  textContainer: { flex: 1, paddingRight: 12 },
  itemTitle: { fontSize: 13, fontWeight: '800' },
  itemSubtitle: { fontSize: 10, marginTop: 3, lineHeight: 14 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  bannerNote: { borderRadius: 14, borderWidth: 1, padding: 14 },
  bannerNoteText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
});