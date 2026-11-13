import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppText } from './AppText';
import { FieldError } from './FieldError';
import { formatCalendarDate } from '../utils/dateFormat';

interface DatePickerFieldProps {
  label: string;
  date: string;
  onDateChange: (date: string) => void;
  minimumDate?: string; // <--- Add optional minimumDate prop here
  open?: boolean; // <--- Optional controlled state so the parent can keep one picker open at a time
  onOpenChange?: (open: boolean) => void;
  error?: string | null;
  onBlur?: (date: string) => void;
  disabled?: boolean;
}

export function DatePickerField({ label, date, onDateChange, minimumDate, open, onOpenChange, error, onBlur, disabled = false }: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const showDatePicker = open ?? internalOpen;
  const wasOpen = useRef(showDatePicker);
  // A picker close/selection is the field's blur equivalent, not each date change.
  useEffect(() => {
    if (wasOpen.current && !showDatePicker) onBlur?.(date);
    wasOpen.current = showDatePicker;
  }, [showDatePicker, date, onBlur]);

  const setShowDatePicker = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };

  // Defined inside component so calendar theme can dynamically react to theme colors
  const calendarTheme = {
    calendarBackground: colors.surface,
    textSectionTitleColor: colors.text,
    monthTextColor: colors.text,
    dayTextColor: colors.text,
    textDisabledColor: colors.border,
    todayTextColor: colors.primary,
    arrowColor: colors.primary,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor: '#fff',
    textMonthFontWeight: '800' as const,
    textDayHeaderFontWeight: '700' as const,
    textDayFontWeight: '600' as const,
    textMonthFontSize: 15,
    textDayFontSize: 13,
    textDayHeaderFontSize: 11,
    // textDayFontFamily: 'YourFont', // <--- Set these to your app font
    // textMonthFontFamily: 'YourFont',
    // textDayHeaderFontFamily: 'YourFont',
  };

  return (
    <View style={styles.formGroup}>
      <AppText style={[styles.fieldLabel, { color: colors.text }]}>{label}</AppText>
      <TouchableOpacity 
        style={[styles.fieldInputButton, styles.rowButton, { backgroundColor: colors.surface, borderColor: colors.border }]} 
        onPress={() => setShowDatePicker(!showDatePicker)}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <View style={styles.leftContent}>
          <Ionicons name="calendar-outline" size={16} color={colors.text} style={styles.iconStyle} />
          <AppText style={[styles.fieldInputText, { color: colors.text }]}>{formatCalendarDate(date)}</AppText>
        </View>
        <Ionicons name={showDatePicker ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
      </TouchableOpacity>
      <FieldError message={error} />
      {showDatePicker && (
        <View style={[styles.calendarDropdownContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Calendar
            current={date}
            minDate={minimumDate} // <--- Pass to react-native-calendars minDate prop
            theme={calendarTheme}
            hideExtraDays // <--- Hides the faded days from adjacent months
            enableSwipeMonths // <--- Swipe left/right to change month
            onDayPress={(day: { dateString: string }) => {
              if (disabled) return;
              onDateChange(day.dateString);
              setShowDatePicker(false);
            }}
            markedDates={{ [date]: { selected: true, selectedColor: colors.primary } }}
          />
          <TouchableOpacity onPress={() => setShowDatePicker(false)} accessibilityRole="button" style={{ padding: 12, alignItems: 'center' }}>
            <AppText style={{ color: colors.primary, fontWeight: '700' }}>Done</AppText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  rowButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconStyle: { marginRight: 2 },
  fieldInputText: { fontSize: 12, fontWeight: '600' },
  calendarDropdownContainer: { marginTop: 6, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
});
