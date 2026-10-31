import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function BookingHistoryScreen({ navigation }: any) {
  const { colors } = useTheme();

  const bookings = [
    { id: '1', title: 'Downtown Live Jazz Night', date: 'Oct 12, 2026', location: 'Blue Note Cafe' },
    { id: '2', title: 'Artisan Food Truck Fest', date: 'Sep 28, 2026', location: 'City Park' },
  ];

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="Booking History" subtitle="Review events you have previously booked." />

      {bookings.map(item => (
        <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.eventTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.eventDetails, { color: colors.muted }]}>{item.date} · {item.location}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  eventTitle: { fontSize: 13, fontWeight: '700' },
  eventDetails: { fontSize: 11, marginTop: 4 },
});