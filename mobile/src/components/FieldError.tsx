import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// Keep field-specific feedback immediately below its control across all forms.
export function FieldError({ message }: { message?: string | null }) {
  const { theme } = useTheme();
  if (!message) return null;
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
    style={[styles.error, { color: theme === 'dark' ? '#FF8A80' : '#C62828' }]}>{message}</Text>;
}

const styles = StyleSheet.create({ error: { fontSize: 12, lineHeight: 17, marginTop: 6 } });
