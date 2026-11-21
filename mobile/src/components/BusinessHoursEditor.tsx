import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TimePickerContent, formatPickerTime } from './TimePickerField';
import { useTheme } from '../context/ThemeContext';
import { FieldError } from './FieldError';
import { SelectionOverlay } from './SelectionOverlay';

export const businessDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type BusinessDay = typeof businessDays[number];
export type BusinessHours = { open: boolean; openTime: Date; closeTime: Date };
export type BusinessHoursData = Record<BusinessDay, BusinessHours>;

interface BusinessHoursEditorProps {
  hours: BusinessHoursData;
  onChange: (hours: BusinessHoursData) => void;
  error?: string | null;
  dayErrors?: Partial<Record<BusinessDay, string>>;
  onBlur?: (hours: BusinessHoursData) => void;
  disabled?: boolean;
}

const copyHours = (hours: BusinessHoursData): BusinessHoursData => Object.fromEntries(businessDays.map(day => [day, {
  ...hours[day], openTime: new Date(hours[day].openTime), closeTime: new Date(hours[day].closeTime),
}])) as BusinessHoursData;

export function BusinessHoursEditor({ hours, onChange, error, dayErrors, onBlur, disabled = false }: BusinessHoursEditorProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(() => copyHours(hours));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [clock, setClock] = useState<{ day: BusinessDay; part: 'openTime' | 'closeTime'; value: Date } | null>(null);
  const openDays = businessDays.filter(day => hours[day].open);
  const summary = openDays.length ? openDays.map(day => `${day.slice(0, 3)} ${formatPickerTime(hours[day].openTime)}–${formatPickerTime(hours[day].closeTime)}`).join(' · ') : 'All days closed';

  const updateDay = (day: BusinessDay, changes: Partial<BusinessHours>) => {
    const next = { ...draftRef.current, [day]: { ...draftRef.current[day], ...changes } };
    draftRef.current = next; setDraft(next);
    return next;
  };
  const cancel = () => {
    if (clock) { setClock(null); return; }
    setVisible(false); onBlur?.(hours);
  };
  const done = () => {
    if (clock) {
      const next = updateDay(clock.day, { [clock.part]: new Date(clock.value) });
      setClock(null); onBlur?.(copyHours(next)); return;
    }
    const next = copyHours(draftRef.current); onChange(next); setVisible(false); onBlur?.(next);
  };

  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit business hours. ${summary}`} accessibilityState={{ expanded: visible, disabled }} disabled={disabled}
      onPress={() => { const next = copyHours(hours); draftRef.current = next; setDraft(next); setClock(null); setVisible(true); }}
      style={[styles.summaryField, { borderColor: colors.border, backgroundColor: colors.surface }, disabled && styles.disabled]}>
      <Ionicons name="time-outline" size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Edit weekly hours</Text>
        <Text style={[styles.summary, { color: colors.muted }]} numberOfLines={2}>{summary}</Text>
      </View>
      <Ionicons name="chevron-down" size={16} color={colors.muted} />
    </Pressable>
    <FieldError message={error || businessDays.map(day => dayErrors?.[day] ? `${day}: ${dayErrors[day]}` : '').filter(Boolean).join('\n')} />
    <SelectionOverlay visible={visible && !disabled} title={clock ? `${clock.day}: ${clock.part === 'openTime' ? 'opens' : 'closes'}` : 'Business hours'} onCancel={cancel} onDone={done}>
      {clock ? <TimePickerContent key={`${clock.day}-${clock.part}`} time={clock.value} onTimeChange={value => setClock(current => current ? { ...current, value } : null)} />
        : <>
          <Text style={[styles.note, { color: colors.muted }]}>Set one opening and closing time for each day. A closing time before opening means the following day.</Text>
          {businessDays.map(day => <View key={day} style={[styles.day, { borderColor: colors.border }]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayLabel, { color: colors.text }]}>{day}</Text>
              <Text style={[styles.state, { color: colors.muted }]}>{draft[day].open ? 'Open' : 'Closed'}</Text>
              <Switch value={draft[day].open} onValueChange={open => { updateDay(day, { open }); }} accessibilityLabel={`${day} open`}
                trackColor={{ false: colors.border, true: colors.primary }} />
            </View>
            {draft[day].open && <View style={styles.timeRow}>
              {(['openTime', 'closeTime'] as const).map(part => <Pressable key={part} accessibilityRole="button"
                accessibilityLabel={`${day} ${part === 'openTime' ? 'opens' : 'closes'} at ${formatPickerTime(draft[day][part])}`}
                onPress={() => setClock({ day, part, value: new Date(draftRef.current[day][part]) })}
                style={[styles.timeButton, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[styles.timeLabel, { color: colors.muted }]}>{part === 'openTime' ? 'Opens at' : 'Closes at'}</Text>
                <Text style={[styles.timeText, { color: colors.text }]}>{formatPickerTime(draft[day][part])}</Text>
              </Pressable>)}
            </View>}
            <FieldError message={dayErrors?.[day]} />
          </View>)}
          <FieldError message={error} />
        </>}
    </SelectionOverlay>
  </View>;
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  summaryField: { minHeight: 70, padding: 12, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  summary: { fontSize: 11, lineHeight: 17 },
  disabled: { opacity: 0.5 },
  note: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  day: { borderBottomWidth: 1, paddingBottom: 12, marginBottom: 12 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 },
  dayLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  state: { fontSize: 12 },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeButton: { flex: 1, minHeight: 56, padding: 10, borderWidth: 1, borderRadius: 10 },
  timeLabel: { fontSize: 11, marginBottom: 4 },
  timeText: { fontSize: 13, fontWeight: '700' },
});
