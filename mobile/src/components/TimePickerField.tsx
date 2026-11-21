import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppText } from './AppText';
import { FieldError } from './FieldError';
import { SelectionOverlay } from './SelectionOverlay';

interface TimePickerFieldProps {
  label: string;
  time: Date;
  onTimeChange: (time: Date) => void;
  minuteInterval?: 15 | 30;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  error?: string | null;
  onBlur?: (time: Date) => void;
  disabled?: boolean;
}

const ITEM_HEIGHT = 44;
const WHEEL_HEIGHT = ITEM_HEIGHT * 5;
const SIDE_PADDING = ITEM_HEIGHT * 2;

export const formatPickerTime = (time: Date) => time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

function Wheel({ data, initialIndex, onChange, label }: { data: string[]; initialIndex: number; onChange: (index: number) => void; label: string }) {
  const { colors } = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const lastCommitted = useRef(initialIndex);
  const interacted = useRef(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const position = () => { if (!interacted.current) scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false }); };
  const commit = (index: number) => {
    setActiveIndex(index);
    if (lastCommitted.current !== index) { lastCommitted.current = index; onChange(index); }
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interacted.current) commit(Math.max(0, Math.min(data.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT))));
  };

  return <View style={styles.wheel}>
    <AppText style={[styles.wheelLabel, { color: colors.muted }]}>{label}</AppText>
    <ScrollView ref={scrollRef} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={ITEM_HEIGHT} decelerationRate="fast"
      onLayout={position} onContentSizeChange={position} onScrollBeginDrag={() => { interacted.current = true; }} onScroll={onScroll}
      contentContainerStyle={{ paddingVertical: SIDE_PADDING }} style={{ height: WHEEL_HEIGHT }} scrollEventThrottle={16} bounces={false} overScrollMode="never">
      {data.map((item, index) => <TouchableOpacity key={`${item}-${index}`} accessibilityRole="button" accessibilityLabel={`${label}: ${item}`}
        accessibilityState={{ selected: activeIndex === index }} style={styles.wheelItem}
        onPress={() => { interacted.current = true; commit(index); scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false }); }}>
        <AppText style={[styles.wheelText, { color: activeIndex === index ? colors.primary : colors.text, opacity: activeIndex === index ? 1 : 0.5, fontWeight: activeIndex === index ? '800' : '500' }]}>{item}</AppText>
      </TouchableOpacity>)}
    </ScrollView>
  </View>;
}

// Reused inside the hours overlay without opening another native Modal. Only the
// edited clock part changes; opening/confirming never rounds a saved date/time.
export function TimePickerContent({ time, onTimeChange, minuteInterval = 15 }: { time: Date; onTimeChange: (time: Date) => void; minuteInterval?: 15 | 30 }) {
  const { colors } = useTheme();
  const latest = useRef(time);
  latest.current = time;
  const [initial] = useState(() => new Date(time));
  const [minuteValues] = useState(() => [...new Set([...Array.from({ length: 60 / minuteInterval }, (_, index) => index * minuteInterval), initial.getMinutes()])].sort((a, b) => a - b));
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1));
  const update = (part: 'hour' | 'minute' | 'period', index: number) => {
    const next = new Date(latest.current);
    if (part === 'hour') next.setHours(((index + 1) % 12) + (next.getHours() >= 12 ? 12 : 0));
    if (part === 'minute') next.setMinutes(minuteValues[index]);
    if (part === 'period') next.setHours(next.getHours() % 12 + (index === 1 ? 12 : 0));
    next.setSeconds(0, 0);
    latest.current = next;
    onTimeChange(next);
  };
  return <View style={styles.wheelsRow}>
    <View pointerEvents="none" style={[styles.selectionBand, { backgroundColor: colors.primary }]} />
    <Wheel label="Hour" data={hours} initialIndex={(initial.getHours() % 12 || 12) - 1} onChange={index => update('hour', index)} />
    <Wheel label="Minute" data={minuteValues.map(value => String(value).padStart(2, '0'))} initialIndex={minuteValues.indexOf(initial.getMinutes())} onChange={index => update('minute', index)} />
    <Wheel label="Period" data={['AM', 'PM']} initialIndex={initial.getHours() >= 12 ? 1 : 0} onChange={index => update('period', index)} />
  </View>;
}

export function TimePickerField({ label, time, onTimeChange, minuteInterval = 15, open, onOpenChange, error, onBlur, disabled = false }: TimePickerFieldProps) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const visible = open ?? internalOpen;
  const [draft, setDraft] = useState(() => new Date(time));
  const wasOpen = useRef(false);
  useEffect(() => { if (visible && !wasOpen.current) setDraft(new Date(time)); wasOpen.current = visible; }, [visible, time]);
  const setVisible = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };
  const cancel = () => { setVisible(false); onBlur?.(time); };
  const done = () => { const next = new Date(draft); onTimeChange(next); setVisible(false); onBlur?.(next); };

  return <View style={styles.fieldGroup}>
    <AppText style={[styles.fieldLabel, { color: colors.text }]}>{label}</AppText>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${formatPickerTime(time)}`} accessibilityState={{ expanded: visible, disabled }} disabled={disabled}
      onPress={() => { setDraft(new Date(time)); setVisible(true); }} activeOpacity={0.8}
      style={[styles.fieldInputButton, { borderColor: colors.border, backgroundColor: colors.surface }, disabled && styles.disabled]}>
      <Ionicons name="time-outline" size={17} color={colors.primary} />
      <AppText style={[styles.fieldInputText, { color: colors.text }]}>{formatPickerTime(time)}</AppText>
      <Ionicons name="chevron-down" size={15} color={colors.muted} />
    </TouchableOpacity>
    <FieldError message={error} />
    <SelectionOverlay visible={visible && !disabled} title={label.replace(/\*$/, '')} onCancel={cancel} onDone={done}>
      {visible && <TimePickerContent time={draft} onTimeChange={setDraft} minuteInterval={minuteInterval} />}
      <FieldError message={error} />
    </SelectionOverlay>
  </View>;
}

const styles = StyleSheet.create({
  fieldGroup: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInputText: { flex: 1, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  wheelsRow: { flexDirection: 'row', position: 'relative' },
  selectionBand: { position: 'absolute', left: 0, right: 0, top: SIDE_PADDING + 24, height: ITEM_HEIGHT, opacity: 0.12, borderRadius: 10 },
  wheel: { flex: 1 },
  wheelLabel: { height: 24, fontSize: 12, textAlign: 'center', fontWeight: '600' },
  wheelItem: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  wheelText: { fontSize: 18 },
});
