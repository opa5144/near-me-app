import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors } from '../data/theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  style?: ViewStyle;
  disabled?: boolean;
};

export function AppButton({ title, onPress, variant = 'primary', style, disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'primary' ? styles.primary : variant === 'secondary' ? styles.secondary : styles.quiet,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, variant !== 'primary' && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  quiet: { backgroundColor: colors.primaryLight },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryText: { color: colors.primary },
  disabled: { opacity: 0.5 },
});
