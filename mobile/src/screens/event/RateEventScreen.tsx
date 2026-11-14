import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchEvent } from '../../api/events';
import type { EventItem } from '../../data/events';
import { settingsErrorMessage } from '../../api/settings';
import { AppButton } from '../../components/AppButton';
import { EventRatingForm } from '../../components/EventRatingForm';
import { FieldError } from '../../components/FieldError';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

// Reload by ID: ended events are intentionally absent from the discovery list.
export function RateEventScreen({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const { colors } = useTheme();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setEvent(null); setLoading(true); setError(null);
    if (!/^[a-f0-9]{24}$/i.test(eventId)) {
      setError('This event is unavailable.'); setLoading(false);
      return () => { active = false; controller.abort(); };
    }
    void fetchEvent(eventId, controller.signal).then(found => { if (active) setEvent(found); })
      .catch((reason: unknown) => { if (active && !controller.signal.aborted) setError(settingsErrorMessage(reason, 'Unable to load this event. Please try again.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [eventId, attempt]));
  return <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
    <AppButton title="Back" variant="quiet" alignment="left" onPress={onBack} />
    <ScreenHeader title="Rate your event" subtitle="Share how your event went." />
    {loading ? <ActivityIndicator color={colors.primary} /> : error || !event ? <>
      <FieldError message={error || 'This event is unavailable.'} />
      <AppButton title="Retry" variant="quiet" onPress={() => setAttempt(value => value + 1)} />
    </> : <>
      <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>
      <Text style={{ color: colors.muted }}>{event.date} · {event.venue}</Text>
      <EventRatingForm eventId={event.id} />
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: 16, flexGrow: 1 }, title: { fontSize: 21, fontWeight: '800', marginBottom: 8 } });
