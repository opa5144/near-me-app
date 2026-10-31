import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../context/ThemeContext';

interface DatePickerFieldProps {
  label: string;
  date: string;
  onDateChange: (date: string) => void;
  minimumDate?: string; // <--- Add optional minimumDate prop here
  open?: boolean; // <--- Optional controlled state so the parent can keep one picker open at a time
  onOpenChange?: (open: boolean) => void;
}

// Adds st / nd / rd / th (11th, 12th, 13th are the exceptions)
const getOrdinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

// "2026-10-24" -> "October 24th, 2026" (display only)
const formatDisplayDate = (dateString: string) => {
  const d = new Date(dateString + 'T00:00:00'); // Local midnight avoids the off-by-one-day timezone shift
  if (isNaN(d.getTime())) return dateString;
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  return `${month} ${getOrdinal(d.getDate())}, ${d.getFullYear()}`;
};

export function DatePickerField({ label, date, onDateChange, minimumDate, open, onOpenChange }: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const showDatePicker = open ?? internalOpen;

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
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity style={[styles.fieldInputButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowDatePicker(!showDatePicker)}>
        <Text style={[styles.fieldInputText, { color: colors.text }]}>📅 {formatDisplayDate(date)}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <View style={[styles.calendarDropdownContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Calendar
            current={date}
            minDate={minimumDate} // <--- Pass to react-native-calendars minDate prop
            theme={calendarTheme}
            hideExtraDays // <--- Hides the faded days from adjacent months
            enableSwipeMonths // <--- Swipe left/right to change month
            onDayPress={(day: { dateString: string }) => {
              onDateChange(day.dateString);
              setShowDatePicker(false);
            }}
            markedDates={{ [date]: { selected: true, selectedColor: colors.primary } }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  fieldInputText: { fontSize: 12, fontWeight: '600' },
  calendarDropdownContainer: { marginTop: 6, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
});