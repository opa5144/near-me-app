import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchEventRatingSummary } from '../api/eventRatings';
import type { RatingSummary } from '../api/eventRatings';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';

export function EventRatingSummary({ eventId, refreshKey }: { eventId: string; refreshKey?: number | string }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  const [model, setModel] = useState<RatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const longestCount = Math.max(1, ...(model?.counts.map(option => String(option.count).length) || []));
  const optionWidth = Math.max(Math.max(52, longestCount * 9 + 8) * Math.max(1, fontScale), (rowWidth - 16) / 5);
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
    <View style={styles.header}>
      <Text style={[styles.heading, { color: colors.text }]}>Attendee feedback</Text>
      {!loading && !error && model && <Text style={[styles.total, { color: colors.muted }]}>{model.totalRatings} {model.totalRatings === 1 ? 'rating' : 'ratings'}</Text>}
    </View>
    {loading ? <ActivityIndicator color={colors.primary} /> : error || !model ? <>
      <FieldError message={error || 'Feedback is unavailable.'} />
      <AppButton title="Retry feedback" variant="quiet" onPress={() => setAttempt(value => value + 1)} />
    </> : <>
      <ScrollView horizontal onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
        showsHorizontalScrollIndicator={false} style={styles.rowViewport} contentContainerStyle={styles.options}>
        {model.counts.map(option => <View key={option.score} accessible accessibilityLabel={`${option.label}: ${option.count} ratings`}
          style={[styles.option, { width: optionWidth, borderColor: colors.border }]}>
        <Text style={styles.emoji}>{option.emoji}</Text>
        <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
        <Text style={[styles.count, { color: colors.primary }]}>{option.count}</Text>
      </View>)}</ScrollView>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8, marginVertical: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: 15, fontWeight: '800' }, total: { fontSize: 12 },
  rowViewport: { flexGrow: 0 }, options: { flexDirection: 'row', gap: 4 },
  option: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 3, alignItems: 'center', flexShrink: 0, gap: 3 },
  emoji: { fontSize: 22 }, label: { fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' }, count: { fontSize: 16, lineHeight: 20, fontWeight: '900' },
});
