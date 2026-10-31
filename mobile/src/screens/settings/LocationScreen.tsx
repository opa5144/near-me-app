import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function LocationScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [distance] = useState(25);

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="Location Settings" subtitle="Control activity distance search limits." />

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Search Radius</Text>
        <Text style={[styles.cardValue, { color: colors.muted }]}>{distance} miles around your current location</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700' },
  cardValue: { fontSize: 12, marginTop: 4 },
});