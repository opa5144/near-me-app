import React, { useRef } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { TimePickerField } from './TimePickerField';
import { useTheme } from '../context/ThemeContext';
import { FieldError } from './FieldError';

export const businessDays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const;

export type BusinessDay = typeof businessDays[number];

export type BusinessHours = {
  open: boolean;
  openTime: Date;
  closeTime: Date;
};

export type BusinessHoursData = Record<BusinessDay, BusinessHours>;

interface BusinessHoursEditorProps {
  hours: BusinessHoursData;
  onChange: (hours: BusinessHoursData) => void;
  error?: string | null;
  dayErrors?: Partial<Record<BusinessDay, string>>;
  onBlur?: (hours: BusinessHoursData) => void;
  disabled?: boolean;
}

export function BusinessHoursEditor({
  hours,
  onChange, error, dayErrors, onBlur, disabled = false
}: BusinessHoursEditorProps) {
  const { colors } = useTheme();
  const latestHours = useRef(hours);
  latestHours.current = hours;

  const updateDay = (day: BusinessDay, changes: Partial<BusinessHours>) => {
    if (disabled) return;
    const next = {
      ...latestHours.current,
      [day]: {
        ...latestHours.current[day],
        ...changes
      }
    };
    latestHours.current = next;
    onChange(next);
    return next;
  };

  return (
    <View>
      {businessDays.map(day => (
        <View key={day} style={styles.dayContainer}>
          <View style={styles.dayHeader}>
            <Text style={[styles.dayLabel, { color: colors.text }]}>
              {day}
            </Text>

            <View style={styles.dayToggle}>
              <Switch
                value={hours[day].open}
                onValueChange={open => { const next = updateDay(day, { open }); if (next) onBlur?.(next); }}
                disabled={disabled}
                trackColor={{
                  false: colors.border,
                  true: colors.primary
                }}
              />

              <Text style={[styles.openLabel, { color: colors.text }]}>
                {hours[day].open ? 'Open' : 'Closed'}
              </Text>
            </View>
          </View>

          {hours[day].open && (
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <TimePickerField
                  label="Opens at"
                  time={hours[day].openTime}
                  onTimeChange={openTime => updateDay(day, { openTime })}
                  minuteInterval={15}
                  disabled={disabled}
                  onBlur={openTime => onBlur?.({ ...latestHours.current, [day]: { ...latestHours.current[day], openTime } })}
                />
              </View>

              <View style={styles.timeField}>
                <TimePickerField
                  label="Closes at"
                  time={hours[day].closeTime}
                  onTimeChange={closeTime => updateDay(day, { closeTime })}
                  minuteInterval={15}
                  disabled={disabled}
                  onBlur={closeTime => onBlur?.({ ...latestHours.current, [day]: { ...latestHours.current[day], closeTime } })}
                />
              </View>
            </View>
          )}
          <FieldError message={dayErrors?.[day]} />
        </View>
      ))}
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  dayContainer: {
    marginBottom: 18
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '800'
  },
  dayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  openLabel: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 42
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12
  },
  timeField: {
    flex: 1
  }
});
