import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { FieldError } from './FieldError';

// This controls entry requirements; a ticket price does not implicitly enable QR entry.
export function EventTicketModeField({ value, onChange, disabled = false, locked = false, error }: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  error?: string;
}) {
  const { colors } = useTheme();
  return <View style={styles.container}>
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>Use QR tickets</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled || locked}
        accessibilityLabel="Use QR tickets" accessibilityHint="Require a host to check in registered attendees using a QR code or five-character code."
        trackColor={{ false: colors.border, true: colors.primary }} />
    </View>
    <Text style={[styles.note, { color: colors.muted }]}>{value
      ? 'Registered attendees receive a QR ticket and entry code. Host check-in is required to rate this event.'
      : 'No check-in is required. Registered attendees can rate this event after it ends.'}</Text>
    {locked && <Text style={[styles.note, { color: colors.muted }]}>The ticket setting is locked after the first registration.</Text>}
    <FieldError message={error} />
  </View>;
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  label: { flex: 1, fontSize: 13, fontWeight: '800' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 3 },
});
