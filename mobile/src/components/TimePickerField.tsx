import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Keyboard, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppText } from './AppText';

interface TimePickerFieldProps {
  label: string;
  time: Date;
  onTimeChange: (time: Date) => void;
  minuteInterval?: 15 | 30; // <--- Optional, defaults to 15
  open?: boolean; // <--- Optional controlled state so the parent can keep one picker open at a time
  onOpenChange?: (open: boolean) => void;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const SIDE_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

function Wheel({ data, initialIndex, onChange, textColor, activeColor }: { data: string[]; initialIndex: number; onChange: (index: number) => void; textColor: string; activeColor: string }) {
  const scrollRef = useRef<any>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(initialIndex);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false }), 0);
    return () => {
      clearTimeout(t);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indexFromOffset = (y: number) => Math.min(data.length - 1, Math.max(0, Math.round(y / ITEM_HEIGHT)));

  const commit = (idx: number) => {
    if (idx === lastCommitted.current) return;
    lastCommitted.current = idx;
    onChange(idx);
  };

  // Commits once the wheel has stopped moving
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = indexFromOffset(e.nativeEvent.contentOffset.y);
    setActiveIndex(idx);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => commit(idx), 150);
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
        contentContainerStyle={{ paddingVertical: SIDE_PADDING }}
      >
        {data.map((item, idx) => (
          <TouchableOpacity
            key={`${item}-${idx}`}
            activeOpacity={0.6}
            style={styles.wheelItem}
            onPress={() => scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true })}
          >
            <AppText style={[styles.wheelText, { color: textColor }, idx === activeIndex ? [styles.wheelTextActive, { color: activeColor }] : styles.wheelTextDim]}>{item}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimePickerField({ label, time, onTimeChange, minuteInterval = 15, open, onOpenChange }: TimePickerFieldProps) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const isPickerVisible = open ?? internalOpen;

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

  const updateTime = (h: number, m: number, p: number) => {
    const result = new Date(time);
    result.setHours(((h + 1) % 12) + (p === 1 ? 12 : 0), m * minuteInterval, 0, 0);
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
      >
        <View style={styles.leftContent}>
          <Ionicons name="time-outline" size={16} color={colors.text} style={styles.iconStyle} />
          <AppText style={[styles.fieldInputText, { color: colors.text }]}>{formatTime(snapped)}</AppText>
        </View>
        <Ionicons name={isPickerVisible ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
      </TouchableOpacity>
      {isPickerVisible && (
        <View style={[styles.timeDropdownContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.wheelsRow}>
            <View pointerEvents="none" style={[styles.selectionBand, { backgroundColor: colors.primary }]} />
            <Wheel data={hours} initialIndex={hourIndex} onChange={(i) => updateTime(i, minuteIndex, periodIndex)} textColor={colors.text} activeColor={colors.primary} />
            <View style={styles.colonWrap} pointerEvents="none">
              <AppText style={[styles.colon, { color: colors.primary }]}>:</AppText>
            </View>
            <Wheel data={minutes} initialIndex={minuteIndex} onChange={(i) => updateTime(hourIndex, i, periodIndex)} textColor={colors.text} activeColor={colors.primary} />
            <Wheel data={periods} initialIndex={periodIndex} onChange={(i) => updateTime(hourIndex, minuteIndex, i)} textColor={colors.text} activeColor={colors.primary} />
          </View>
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