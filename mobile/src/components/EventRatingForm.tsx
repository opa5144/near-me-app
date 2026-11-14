import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchEventRating, saveEventRating } from '../api/eventRatings';
import type { RatingResponse } from '../api/eventRatings';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';

export function EventRatingForm({ eventId }: { eventId: string }) {
  const { colors } = useTheme();
  const [model, setModel] = useState<RatingResponse | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  const pendingSave = useRef<Promise<RatingResponse> | null>(null);

  useFocusEffect(useCallback(() => {
    const current = ++version.current;
    const controller = new AbortController();
    setLoading(true); setLoadError(null); setSaveError(null); setSaved(false); setModel(null); setScore(null);
    async function load() {
      try {
        await pendingSave.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const response = await fetchEventRating(eventId, controller.signal);
        if (version.current === current && !controller.signal.aborted) { setModel(response); setScore(response.rating?.score ?? null); }
      } catch (reason: unknown) {
        if (version.current === current && !controller.signal.aborted) setLoadError(settingsErrorMessage(reason, 'Unable to load your rating. Please try again.'));
      } finally {
        if (version.current === current) { setLoading(false); setSaving(false); }
      }
    }
    void load();
    return () => { ++version.current; controller.abort(); };
  }, [eventId, attempt]));

  async function save() {
    if (!model?.eligibility.canRate || loading || saving || pendingSave.current) return;
    if (score === null) { setSaveError('Choose one of the five ratings.'); return; }
    const current = version.current;
    setSaving(true); setSaveError(null); setSaved(false);
    const request = saveEventRating(eventId, score);
    pendingSave.current = request;
    try {
      const response = await request;
      if (version.current === current) { setModel(response); setScore(response.rating?.score ?? null); setSaved(true); }
    } catch (reason: unknown) {
      if (version.current === current) setSaveError(settingsErrorMessage(reason, 'Unable to save your rating. Please try again.'));
    } finally {
      if (pendingSave.current === request) pendingSave.current = null;
      if (version.current === current) setSaving(false);
    }
  }

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.heading, { color: colors.text }]}>Your event rating</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : loadError || !model ? <>
      <FieldError message={loadError || 'Your rating is unavailable.'} />
      <AppButton title="Retry rating" variant="quiet" onPress={() => setAttempt(value => value + 1)} />
    </> : <>
      <Text style={[styles.note, { color: colors.muted }]}>{model.eligibility.canRate
        ? 'Choose how you felt about this event. You can update your rating later.'
        : model.eligibility.reason || 'Rating is currently unavailable.'}</Text>
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {model.scores.map(option => <Pressable key={option.score} accessibilityRole="radio"
          accessibilityLabel={`${option.label}, ${option.score} out of 5`} accessibilityState={{ checked: score === option.score, disabled: saving || !model.eligibility.canRate }}
          disabled={saving || !model.eligibility.canRate} onPress={() => { setScore(option.score); setSaveError(null); setSaved(false); }}
          style={[styles.choice, { borderColor: score === option.score ? colors.primary : colors.border,
            backgroundColor: score === option.score ? colors.primaryLight : colors.background }, (!model.eligibility.canRate || saving) && styles.disabled]}>
          <Text style={styles.emoji}>{option.emoji}</Text>
          <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
        </Pressable>)}
      </View>
      <FieldError message={saveError} />
      {saved && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.primary }]}>Your rating has been saved.</Text>}
      {model.eligibility.canRate && <AppButton title={saving ? 'Saving rating...' : model.rating ? 'Update Rating' : 'Submit Rating'}
        onPress={() => void save()} disabled={saving} />}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginVertical: 16, gap: 12 },
  heading: { fontSize: 17, fontWeight: '800' }, note: { fontSize: 12, lineHeight: 19 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', flexGrow: 1, minWidth: 80, gap: 6 },
  emoji: { fontSize: 28 }, label: { fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.55 },
});
