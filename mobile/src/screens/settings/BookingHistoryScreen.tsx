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

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <AppButton title="Back to Settings" variant="quiet" alignment="left" onPress={() => navigation.goBack()} />
      <ScreenHeader title="Booking History" subtitle="Past events you marked Interested or Attending." />
      {isLoading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loading} /> : error ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={[styles.message, { color: errorColor }]}>{error}</Text>
          <AppButton title="Retry" variant="secondary" onPress={() => setAttempt(current => current + 1)} />
        </View>
      ) : bookings.length ? bookings.map(booking => (
        <View key={booking.id} style={styles.entry}>
          <EventCard event={booking.event} horizontal
            onPress={() => navigation.navigate('BookingHistoryDetails', { bookingId: booking.id })} />
          <Text style={[styles.savedState, { color: colors.muted }]}>
            {booking.interested && booking.attending ? 'Interested and attending' : booking.attending ? 'Attending' : 'Interested'}
          </Text>
        </View>
      )) : <Text style={[styles.message, { color: colors.muted }]}>
        No past events yet. Your Interested or Attending events appear here after they end.
      </Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  loading: { marginTop: 24 },
  notice: { paddingVertical: 16 },
  message: { fontSize: 13, lineHeight: 20, marginVertical: 16 },
  entry: { marginBottom: 12 },
  savedState: { fontSize: 12, marginTop: -4, marginLeft: 4 },
});
