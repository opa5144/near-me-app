import { Pressable, StyleSheet, Text, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  alignment?: 'center' | 'left';
  minHeight?: number;
};

export function AppButton({ title, onPress, variant = 'primary', style, textStyle, disabled = false, alignment = 'center', minHeight = 46 }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { minHeight, alignItems: alignment === 'left' ? 'flex-start' : 'center' },
        variant === 'primary'
          ? { backgroundColor: colors.primary }
          : variant === 'secondary'
          ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
          : { backgroundColor: 'transparent' },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, { color: variant === 'primary' ? '#FFFFFF' : colors.primary }, textStyle]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 14, justifyContent: 'center', paddingHorizontal: 18 },
  text: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
