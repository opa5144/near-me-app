import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  style?: ViewStyle;
  disabled?: boolean;
};

export function AppButton({ title, onPress, variant = 'primary', style, disabled = false }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'primary' 
          ? { backgroundColor: colors.primary } 
          : variant === 'secondary' 
          ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border } 
          : { backgroundColor: colors.primaryLight },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, variant !== 'primary' && { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});