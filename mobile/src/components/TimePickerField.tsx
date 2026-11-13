import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Keyboard, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppText } from './AppText';
import { FieldError } from './FieldError';

interface TimePickerFieldProps {
  label: string;
  time: Date;
  onTimeChange: (time: Date) => void;
  minuteInterval?: 15 | 30; // <--- Optional, defaults to 15
  open?: boolean; // <--- Optional controlled state so the parent can keep one picker open at a time
  onOpenChange?: (open: boolean) => void;
  error?: string | null;
  onBlur?: (time: Date) => void;
  disabled?: boolean;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const SIDE_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

function Wheel({ data, initialIndex, onChange, textColor, activeColor }: { data: string[]; initialIndex: number; onChange: (index: number) => void; textColor: string; activeColor: string }) {
  const scrollRef = useRef<any>(null);
  const lastCommitted = useRef(initialIndex);
  const interacted = useRef(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!interacted.current) scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => {
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indexFromOffset = (y: number) => Math.min(data.length - 1, Math.max(0, Math.round(y / ITEM_HEIGHT)));

  const commit = (idx: number) => {
    if (idx === lastCommitted.current) return;
    lastCommitted.current = idx;
    onChange(idx);
  };

  // Keep the selected value current so closing immediately cannot discard a wheel edit.
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Initial positioning is display setup, not a user edit to the clock.
    if (!interacted.current) return;
    const idx = indexFromOffset(e.nativeEvent.contentOffset.y);
    setActiveIndex(idx);
    commit(idx);
  };

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        overScrollMode="never" // <--- Removes the Android edge glow
        bounces={false}
        onScroll={handleScroll}
        onScrollBeginDrag={() => { interacted.current = true; }}
        contentContainerStyle={{ paddingVertical: SIDE_PADDING }}
      >
        {data.map((item, idx) => (
          <TouchableOpacity
            key={`${item}-${idx}`}
            activeOpacity={0.6}
            style={styles.wheelItem}
            onPress={() => {
              interacted.current = true;
              setActiveIndex(idx); commit(idx);
              scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
            }}
          >
            <AppText style={[styles.wheelText, { color: textColor }, idx === activeIndex ? [styles.wheelTextActive, { color: activeColor }] : styles.wheelTextDim]}>{item}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimePickerField({ label, time, onTimeChange, minuteInterval = 15, open, onOpenChange, error, onBlur, disabled = false }: TimePickerFieldProps) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const isPickerVisible = open ?? internalOpen;
  const latestTime = useRef(time);
  latestTime.current = time;
  const wasOpen = useRef(isPickerVisible);
  useEffect(() => {
    if (wasOpen.current && !isPickerVisible) onBlur?.(time);
    wasOpen.current = isPickerVisible;
  }, [isPickerVisible, time, onBlur]);

  const setIsPickerVisible = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 / minuteInterval }, (_, i) => String(i * minuteInterval).padStart(2, '0'));
  const periods = ['AM', 'PM'];

  // Round minutes to clean 15-minute intervals
  const snapToInterval = (selectedDate: Date, intervalMinutes: number) => {
    const roundedDate = new Date(selectedDate);
    const roundedMinutes = Math.round(roundedDate.getMinutes() / intervalMinutes) * intervalMinutes;

    roundedDate.setMinutes(roundedMinutes);
    roundedDate.setSeconds(0);
    roundedDate.setMilliseconds(0);
    return roundedDate;
  };

  const formatTime = (selectedTime: Date) => {
    return selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const snapped = snapToInterval(time, minuteInterval);
  const h24 = snapped.getHours();
  const hourIndex = (h24 % 12 || 12) - 1;
  const minuteIndex = (snapped.getMinutes() / minuteInterval) % minutes.length;
  const periodIndex = h24 >= 12 ? 1 : 0;

  const updateTime = (part: 'hour' | 'minute' | 'period', index: number) => {
    if (disabled) return;
    // Separate wheels may report before a render. Change only that wheel's part
    // against the latest clock, so one edit cannot overwrite another's value.
    const result = snapToInterval(latestTime.current, minuteInterval);
    if (part === 'hour') result.setHours(((index + 1) % 12) + (result.getHours() >= 12 ? 12 : 0));
    else if (part === 'minute') result.setMinutes(index * minuteInterval);
    else result.setHours((result.getHours() % 12) + (index === 1 ? 12 : 0));
    result.setSeconds(0, 0);
    latestTime.current = result;
    onTimeChange(result);
  };

  return (
    <View style={styles.splitInput}>
      <AppText style={[styles.fieldLabel, { color: colors.text }]}>{label}</AppText>
      <TouchableOpacity
        style={[styles.fieldInputButton, styles.rowButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => {
          Keyboard.dismiss(); // Force-closes any software keyboard
          setIsPickerVisible(!isPickerVisible);
        }}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <View style={styles.leftContent}>
          <Ionicons name="time-outline" size={16} color={colors.text} style={styles.iconStyle} />
          <AppText style={[styles.fieldInputText, { color: colors.text }]}>{formatTime(snapped)}</AppText>
        </View>
        <Ionicons name={isPickerVisible ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
      </TouchableOpacity>
      <FieldError message={error} />
      {isPickerVisible && (
        <View style={[styles.timeDropdownContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.wheelsRow}>
            <View pointerEvents="none" style={[styles.selectionBand, { backgroundColor: colors.primary }]} />
            <Wheel data={hours} initialIndex={hourIndex} onChange={(i) => updateTime('hour', i)} textColor={colors.text} activeColor={colors.primary} />
            <View style={styles.colonWrap} pointerEvents="none">
              <AppText style={[styles.colon, { color: colors.primary }]}>:</AppText>
            </View>
            <Wheel data={minutes} initialIndex={minuteIndex} onChange={(i) => updateTime('minute', i)} textColor={colors.text} activeColor={colors.primary} />
            <Wheel data={periods} initialIndex={periodIndex} onChange={(i) => updateTime('period', i)} textColor={colors.text} activeColor={colors.primary} />
          </View>
          <TouchableOpacity onPress={() => setIsPickerVisible(false)} accessibilityRole="button" style={{ padding: 12, alignItems: 'center' }}>
            <AppText style={{ color: colors.primary, fontWeight: '700' }}>Done</AppText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splitInput: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  rowButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconStyle: { marginRight: 2 },
  fieldInputText: { fontSize: 12, fontWeight: '600' },
  timeDropdownContainer: { marginTop: 6, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  wheelsRow: { flexDirection: 'row', alignItems: 'center', height: WHEEL_HEIGHT, paddingHorizontal: 8 },
  selectionBand: { position: 'absolute', left: 8, right: 8, top: SIDE_PADDING, height: ITEM_HEIGHT, borderRadius: 10, opacity: 0.12 },
  wheel: { flex: 1, height: WHEEL_HEIGHT },
  wheelItem: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  wheelText: { fontSize: 15 }, // <--- Add fontFamily here to match your app font
  wheelTextActive: { fontWeight: '800' },
  wheelTextDim: { opacity: 0.35, fontWeight: '500' },
  colonWrap: { width: 8, alignItems: 'center', justifyContent: 'center' },
  colon: { fontSize: 15, fontWeight: '800' },
});
