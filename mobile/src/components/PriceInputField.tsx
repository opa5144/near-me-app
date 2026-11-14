import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { FieldError } from './FieldError';

interface PriceInputFieldProps {
  label: string;
  price: string;
  onPriceChange: (price: string) => void;
  placeholder?: string;
  error?: string | null;
  onBlur?: () => void;
  disabled?: boolean;
}

// Keeps whole digits only (no decimal point or cents)
const sanitizePrice = (text: string) => {
  const cleaned = text.replace(/[^0-9]/g, '');
  return cleaned.slice(0, 7);
};

export function PriceInputField({ label, price, onPriceChange, placeholder = '0', error, onBlur, disabled = false }: PriceInputFieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.formGroup}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.fieldInputButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.currencySymbol, { color: colors.muted }]}>$</Text>
        <TextInput
          value={price}
          onChangeText={(text) => onPriceChange(sanitizePrice(text))}
          onBlur={onBlur}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad" // <--- Numeric keyboard for whole numbers only
          style={[styles.fieldInputText, { color: colors.text }]}
        />
      </View>
      <FieldError message={error} />
      <Text style={[styles.helperText, { color: colors.muted }]}>Leave blank for a free event.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInputButton: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  fieldInputText: { flex: 1, fontSize: 12, fontWeight: '600', padding: 0 },
  currencySymbol: { fontSize: 12, fontWeight: '700', marginRight: 6 },
  helperText: { fontSize: 10, fontWeight: '600', marginTop: 4, paddingHorizontal: 4 },
});