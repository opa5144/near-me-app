import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { colors } from '../data/theme';

interface TimePickerFieldProps {
  label: string;
  time: string;
  onTimeChange: (timeString: string) => void;
}

export function TimePickerField({ label, time, onTimeChange }: TimePickerFieldProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const formatTime = (selectedTime: Date) => {
    return selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.splitInput}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.fieldInputButton} onPress={() => setIsPickerVisible(true)}>
        <Text style={styles.fieldInputText}>🕒 {time}</Text>
      </TouchableOpacity>
      <DateTimePickerModal
        isVisible={isPickerVisible}
        mode="time"
        onConfirm={(selectedTime: Date) => {
          onTimeChange(formatTime(selectedTime));
          setIsPickerVisible(false);
        }}
        onCancel={() => setIsPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  splitInput: { flex: 1 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, justifyContent: 'center' },
  fieldInputText: { fontSize: 12, color: colors.text, fontWeight: '600' },
});