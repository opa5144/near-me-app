import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isAxiosError } from 'axios';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { EventCard } from '../../components/EventCard';
import { fetchBookingHistory } from '../../api/events';
import type { BookingHistoryItem } from '../../api/events';
import { useTheme } from '../../context/ThemeContext';

export function BookingHistoryScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [bookings, setBookings] = useState<BookingHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The private endpoint supplies only ended events actually selected by this account.
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setBookings([]);
    void fetchBookingHistory(controller.signal)
      .then(saved => { if (active) setBookings(saved); })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const message = isAxiosError<{ message?: string }>(reason) ? reason.response?.data?.message : undefined;
        setError(typeof message === 'string' && message.trim() ? message : 'Unable to load your booking history. Please try again.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]));

  // Attendance takes display priority without changing either saved selection flag.
  const attended = bookings.filter(booking => booking.attending);
  const interested = bookings.filter(booking => booking.interested && !booking.attending);

  const section = (title: string, entries: BookingHistoryItem[], emptyMessage: string) => (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
        {title} · {entries.length}
      </Text>
      {entries.length ? entries.map(booking => (
        <View key={booking.id} style={styles.entry}>
          <EventCard event={booking.event} horizontal
            onPress={() => navigation.navigate('BookingHistoryDetails', { bookingId: booking.id })} />
        </View>
      )) : <Text style={[styles.message, { color: colors.muted }]}>{emptyMessage}</Text>}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <AppButton title="Back to Settings" variant="quiet" alignment="left" onPress={() => navigation.goBack()} />
      <ScreenHeader title="Booking History" subtitle="Past events you marked Interested or Attending." />
      {isLoading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loading} /> : error ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={[styles.message, { color: errorColor }]}>{error}</Text>
          <AppButton title="Retry" variant="secondary" onPress={() => setAttempt(current => current + 1)} />
        </View>
      ) : <>
        {section('Attended', attended, 'No past events marked as attending yet.')}
        {section('Interested', interested, 'No past events marked only as interested yet.')}
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  loading: { marginTop: 24 },
  notice: { paddingVertical: 16 },
  message: { fontSize: 13, lineHeight: 20, marginVertical: 16 },
  entry: { marginBottom: 12 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
});
