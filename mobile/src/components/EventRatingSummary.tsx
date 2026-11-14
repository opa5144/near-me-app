import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchEventRatingSummary } from '../api/eventRatings';
import type { RatingSummary } from '../api/eventRatings';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';

export function EventRatingSummary({ eventId, refreshKey }: { eventId: string; refreshKey?: number | string }) {
  const { colors } = useTheme();
  const [model, setModel] = useState<RatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    let controller: AbortController | undefined;
    let request = 0;
    function load() {
      const current = ++request;
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      setLoading(true); setError(null); setModel(null);
      void fetchEventRatingSummary(eventId, signal).then(response => {
        if (active && current === request && !signal.aborted) setModel(response);
      }).catch((reason: unknown) => {
        if (active && current === request && !signal.aborted) setError(settingsErrorMessage(reason, 'Unable to load feedback. Please try again.'));
      }).finally(() => { if (active && current === request) setLoading(false); });
    }
    load();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { active = false; controller?.abort(); listener.remove(); };
  }, [eventId, refreshKey, attempt]));
  return <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <Text style={[styles.heading, { color: colors.text }]}>Attendee feedback</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : error || !model ? <>
      <FieldError message={error || 'Feedback is unavailable.'} />
      <AppButton title="Retry feedback" variant="quiet" onPress={() => setAttempt(value => value + 1)} />
    </> : <>
      <Text style={{ color: colors.muted }}>{model.totalRatings} {model.totalRatings === 1 ? 'rating' : 'ratings'}</Text>
      <View style={styles.options}>{model.counts.map(option => <View key={option.score} style={[styles.option, { borderColor: colors.border }]}>
        <Text style={styles.emoji}>{option.emoji}</Text>
        <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
        <Text accessibilityLabel={`${option.label}: ${option.count} ratings`} style={[styles.count, { color: colors.primary }]}>{option.count}</Text>
      </View>)}</View>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12, marginVertical: 16 },
  heading: { fontSize: 17, fontWeight: '800' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center', flexGrow: 1, minWidth: 80, gap: 5 },
  emoji: { fontSize: 27 }, label: { fontSize: 12, fontWeight: '700' }, count: { fontSize: 20, fontWeight: '900' },
});
