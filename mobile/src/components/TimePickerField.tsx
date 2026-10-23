import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Keyboard, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { colors } from '../data/theme';

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

function Wheel({ data, initialIndex, onChange }: { data: string[]; initialIndex: number; onChange: (index: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
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
            <Text style={[styles.wheelText, idx === activeIndex ? styles.wheelTextActive : styles.wheelTextDim]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimePickerField({ label, time, onTimeChange, minuteInterval = 15, open, onOpenChange }: TimePickerFieldProps) {
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
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.fieldInputButton}
        onPress={() => {
          Keyboard.dismiss(); // Force-closes any software keyboard
          setIsPickerVisible(!isPickerVisible);
        }}
      >
        <Text style={styles.fieldInputText}>🕒 {formatTime(snapped)}</Text>
      </TouchableOpacity>
      {isPickerVisible && (
        <View style={styles.timeDropdownContainer}>
          <View style={styles.wheelsRow}>
            <View pointerEvents="none" style={styles.selectionBand} />
            <Wheel data={hours} initialIndex={hourIndex} onChange={(i) => updateTime(i, minuteIndex, periodIndex)} />
            <View style={styles.colonWrap} pointerEvents="none">
              <Text style={styles.colon}>:</Text>
            </View>
            <Wheel data={minutes} initialIndex={minuteIndex} onChange={(i) => updateTime(hourIndex, i, periodIndex)} />
            <Wheel data={periods} initialIndex={periodIndex} onChange={(i) => updateTime(hourIndex, minuteIndex, i)} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splitInput: { flex: 1 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, justifyContent: 'center' },
  fieldInputText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  timeDropdownContainer: { marginTop: 6, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  wheelsRow: { flexDirection: 'row', alignItems: 'center', height: WHEEL_HEIGHT, paddingHorizontal: 8 },
  selectionBand: { position: 'absolute', left: 8, right: 8, top: SIDE_PADDING, height: ITEM_HEIGHT, borderRadius: 10, backgroundColor: colors.primary, opacity: 0.12 },
  wheel: { flex: 1, height: WHEEL_HEIGHT },
  wheelItem: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  wheelText: { fontSize: 15, color: colors.text }, // <--- Add fontFamily here to match your app font
  wheelTextActive: { fontWeight: '800', color: colors.primary },
  wheelTextDim: { opacity: 0.35, fontWeight: '500' },
  colonWrap: { width: 8, alignItems: 'center', justifyContent: 'center' },
  colon: { fontSize: 15, fontWeight: '800', color: colors.primary },
});