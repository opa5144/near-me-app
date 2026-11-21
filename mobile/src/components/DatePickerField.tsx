import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppText } from './AppText';
import { FieldError } from './FieldError';
import { SelectionOverlay } from './SelectionOverlay';
import { formatCalendarDate } from '../utils/dateFormat';

interface DatePickerFieldProps {
  label: string;
  date: string;
  onDateChange: (date: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  clearable?: boolean;
  emptyLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  error?: string | null;
  onBlur?: (date: string) => void;
  disabled?: boolean;
}

export function DatePickerField({ label, date, onDateChange, minimumDate, maximumDate, clearable = false, emptyLabel = 'Select a date', open, onOpenChange, error, onBlur, disabled = false }: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const visible = open ?? internalOpen;
  const [draft, setDraft] = useState(date);
  const [calendarMonth, setCalendarMonth] = useState(date || maximumDate || minimumDate || new Date().toISOString().slice(0, 10));
  const [choosingYear, setChoosingYear] = useState(false);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible && !wasOpen.current) {
      setDraft(date);
      setCalendarMonth(date || maximumDate || minimumDate || new Date().toISOString().slice(0, 10));
      setChoosingYear(false);
      setCalendarVersion(version => version + 1);
    }
    wasOpen.current = visible;
  }, [visible, date, maximumDate, minimumDate]);

  const setVisible = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };
  const cancel = () => { setVisible(false); onBlur?.(date); };
  const done = () => { onDateChange(draft); setVisible(false); onBlur?.(draft); };
  const firstYear = minimumDate ? Number(minimumDate.slice(0, 4)) : new Date().getFullYear() - 120;
  const lastYear = maximumDate ? Number(maximumDate.slice(0, 4)) : Math.max(new Date().getFullYear() + 20, Number(calendarMonth.slice(0, 4)));
  const years = Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, index) => lastYear - index);

  return (
    <View style={styles.formGroup}>
      <AppText style={[styles.fieldLabel, { color: colors.text }]}>{label}</AppText>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${date ? formatCalendarDate(date) : emptyLabel}`} accessibilityState={{ expanded: visible, disabled }}
        style={[styles.fieldInputButton, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && styles.disabled]}
        onPress={() => { setDraft(date); setVisible(true); }} disabled={disabled} activeOpacity={0.8}>
        <Ionicons name="calendar-outline" size={17} color={colors.primary} />
        <AppText style={[styles.fieldInputText, { color: date ? colors.text : colors.muted }]}>{date ? formatCalendarDate(date) : emptyLabel}</AppText>
        <Ionicons name="chevron-down" size={15} color={colors.muted} />
      </TouchableOpacity>
      <FieldError message={error} />
      <SelectionOverlay visible={visible && !disabled} title={label.replace(/\*$/, '')} onCancel={cancel} onDone={done} doneDisabled={choosingYear}>
        <TouchableOpacity accessibilityRole="button" onPress={() => setChoosingYear(value => !value)} style={styles.yearButton}>
          <AppText style={{ color: colors.primary, fontWeight: '700' }}>{choosingYear ? 'Back to calendar' : `Choose year (${calendarMonth.slice(0, 4)})`}</AppText>
        </TouchableOpacity>
        {choosingYear ? <View style={styles.yearGrid}>
          {years.map(year => <TouchableOpacity key={year} accessibilityRole="button" accessibilityLabel={`Year ${year}`}
            onPress={() => {
              let month = `${year}-${calendarMonth.slice(5, 7)}-01`;
              if (minimumDate && month < minimumDate) month = minimumDate;
              if (maximumDate && month > maximumDate) month = maximumDate;
              setCalendarMonth(month);
              setCalendarVersion(version => version + 1);
              setChoosingYear(false);
            }} style={[styles.yearChoice, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{year}</Text>
          </TouchableOpacity>)}
        </View> : <Calendar key={calendarVersion} current={calendarMonth} minDate={minimumDate} maxDate={maximumDate}
          hideExtraDays enableSwipeMonths
          onMonthChange={(month: { dateString: string }) => setCalendarMonth(month.dateString)}
          theme={{ calendarBackground: colors.surface, textSectionTitleColor: colors.text, monthTextColor: colors.text, dayTextColor: colors.text,
            textDisabledColor: colors.border, todayTextColor: colors.primary, arrowColor: colors.primary,
            selectedDayBackgroundColor: colors.primary, selectedDayTextColor: '#FFFFFF', textMonthFontWeight: '800', textDayFontWeight: '600' }}
          onDayPress={(day: { dateString: string }) => setDraft(day.dateString)}
          markedDates={draft ? { [draft]: { selected: true, selectedColor: colors.primary } } : {}} />}
        {clearable && <TouchableOpacity accessibilityRole="button" onPress={() => setDraft('')} style={styles.clearButton}>
          <AppText style={{ color: colors.primary, fontWeight: '700' }}>Clear date</AppText>
        </TouchableOpacity>}
        <FieldError message={error} />
      </SelectionOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldInputText: { flex: 1, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  clearButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  yearButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearChoice: { width: '22%', minHeight: 44, borderWidth: 1, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});
