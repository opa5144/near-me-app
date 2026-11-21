import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { FieldError } from './FieldError';
import { SelectionOverlay } from './SelectionOverlay';

type CategoryPickerFieldProps = {
  label: string;
  categories: readonly string[];
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
  onBlur?: (categories: string[]) => void;
  error?: string | null;
  disabled?: boolean;
  emptyLabel?: string;
  allowAll?: boolean;
  multiple?: boolean;
};

export function CategoryPickerField({ label, categories, selectedCategories, onChange, onBlur, error, disabled = false, emptyLabel = 'Select categories', allowAll = false, multiple = true }: CategoryPickerFieldProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const choices = categories.filter(category => category !== 'All');
  const selected = selectedCategories.filter(category => choices.includes(category));
  const summary = selected.length ? selected.join(' · ') : allowAll ? 'All categories' : emptyLabel;
  useEffect(() => { if (disabled) setVisible(false); }, [disabled]);
  const cancel = () => { setVisible(false); onBlur?.([...selected]); };
  const done = () => { const next = [...draft]; onChange(next); setVisible(false); onBlur?.(next); };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`} accessibilityState={{ expanded: visible, disabled }} disabled={disabled}
        onPress={() => { Keyboard.dismiss(); setDraft([...selected]); setVisible(true); }}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && styles.disabled]}>
        <Ionicons name="grid-outline" size={17} color={colors.primary} />
        <Text style={[styles.summary, { color: selected.length || allowAll ? colors.text : colors.muted }]} numberOfLines={2}>{summary}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <FieldError message={error} />
      <SelectionOverlay visible={visible} title={label.replace(/\*$/, '')} onCancel={cancel} onDone={done}>
        {multiple && <Text style={[styles.note, { color: colors.muted }]}>Choose all that apply.</Text>}
        {(allowAll ? ['All', ...choices] : choices).map(category => {
          const checked = category === 'All' ? draft.length === 0 : draft.includes(category);
          return <Pressable key={category} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked }}
            onPress={() => setDraft(current => category === 'All' ? [] : multiple ? (current.includes(category) ? current.filter(value => value !== category) : [...current, category]) : [category])}
            style={[styles.choice, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.background : colors.surface }]}>
            <Text style={[styles.choiceText, { color: colors.text }]}>{category === 'All' ? 'All categories' : category}</Text>
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={23} color={checked ? colors.primary : colors.muted} />
          </Pressable>;
        })}
        <FieldError message={error} />
      </SelectionOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  field: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  summary: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  note: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  choice: { minHeight: 48, padding: 12, marginBottom: 8, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceText: { flex: 1, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
