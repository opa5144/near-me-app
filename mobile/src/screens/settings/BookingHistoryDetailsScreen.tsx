import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isAxiosError } from 'axios';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PhotoCollection } from '../../components/PhotoCollection';
import { fetchBookingHistoryDetails } from '../../api/events';
import type { BookingHistoryItem } from '../../api/events';
import { useTheme } from '../../context/ThemeContext';

type BookingHistoryDetailsScreenProps = {
  navigation: any;
  route: { params?: unknown };
};

function savedTimestamp(value: string, timeZone?: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return 'Unavailable';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(instant);
  } catch {
    return instant.toLocaleString();
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return <View style={[styles.infoRow, { borderColor: colors.border }]}>
    <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
    <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
  </View>;
}

// History has its own read-only view: no RSVP, sharing, maps, or host-follow actions.
export function BookingHistoryDetailsScreen({ navigation, route }: BookingHistoryDetailsScreenProps) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const params = route.params as { bookingId?: unknown } | undefined;
  const bookingId = typeof params?.bookingId === 'string' ? params.bookingId : undefined;
  const [booking, setBooking] = useState<BookingHistoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Reload by the private selection ID on every visit; never trust a passed event copy.
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setBooking(null);
    setIsLoading(true);
    setError(null);
    if (!bookingId) {
      setError('This history entry is unavailable.');
      setIsLoading(false);
      return () => { active = false; controller.abort(); };
    }
    void fetchBookingHistoryDetails(bookingId, controller.signal)
      .then(saved => { if (active) setBooking(saved); })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const status = isAxiosError(reason) ? reason.response?.status : undefined;
        setError(status === 400 || status === 404
          ? 'This history entry is unavailable.'
          : 'Unable to load this history entry. Please try again.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [bookingId, attempt]));

  const event = booking?.event;
  const host = event && typeof event.hostId === 'object' ? event.hostId : null;
  const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(' ') : '';
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <AppButton title="Back to Booking History" variant="quiet" alignment="left" onPress={() => navigation.goBack()} />
      <ScreenHeader title="Past event details" subtitle="Your saved history. Event choices cannot be changed." />
      {isLoading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loading} /> : error || !event || !booking ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={[styles.message, { color: errorColor }]}>{error || 'This history entry is unavailable.'}</Text>
          <AppButton title="Retry" variant="secondary" onPress={() => setAttempt(current => current + 1)} />
        </View>
      ) : <>
        <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
          emoji={event.emoji} accent={event.accent} mode="hero" />
        <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>
        <DetailRow label="Category" value={event.category} />
        <DetailRow label="Price" value={event.price} />
        <DetailRow label="Starts" value={savedTimestamp(event.startsAt, event.timeZone)} />
        <DetailRow label="Ends" value={savedTimestamp(event.endsAt, event.timeZone)} />
        {event.timeZone && <DetailRow label="Time zone" value={event.timeZone} />}
        <DetailRow label="Venue" value={event.venue} />
        <DetailRow label="Address" value={event.address || event.location || event.venue} />
        {typeof event.latitude === 'number' && typeof event.longitude === 'number' &&
          <DetailRow label="Coordinates" value={event.latitude.toFixed(5) + ', ' + event.longitude.toFixed(5)} />}
        {host?.username && <DetailRow label="Host" value={'@' + host.username + (hostName ? ' (' + hostName + ')' : '')} />}
        <DetailRow label="History section" value={booking.attending ? 'Attended' : 'Interested'} />
        <Text style={[styles.section, { color: colors.text }]}>About this event</Text>
        <Text style={[styles.description, { color: colors.muted }]}>{event.description}</Text>
        <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
          emoji={event.emoji} accent={event.accent} mode="gallery" />
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  loading: { marginTop: 24 },
  notice: { paddingVertical: 16 },
  message: { fontSize: 13, lineHeight: 20, marginVertical: 16 },
  title: { fontSize: 23, fontWeight: '800', marginBottom: 12 },
  infoRow: { borderBottomWidth: 1, paddingVertical: 12 },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 14, lineHeight: 20 },
  section: { fontSize: 16, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 22 },
});
