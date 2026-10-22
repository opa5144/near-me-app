import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { colors } from '../data/theme';

interface DatePickerFieldProps {
  label: string;
  date: string;
  onDateChange: (date: string) => void;
}

export function DatePickerField({ label, date, onDateChange }: DatePickerFieldProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <View style={styles.formGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.fieldInputButton} onPress={() => setShowDatePicker(!showDatePicker)}>
        <Text style={styles.fieldInputText}>📅 {date}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <View style={styles.calendarDropdownContainer}>
          <Calendar
            current={date}
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
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, justifyContent: 'center' },
  fieldInputText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  calendarDropdownContainer: { marginTop: 6, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});