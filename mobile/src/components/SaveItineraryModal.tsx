import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { AppText } from './AppText';
import { FieldError } from './FieldError';

interface SaveItineraryModalProps {
  visible: boolean;
  value: string;
  isSaving: boolean;
  error?: string | null;
  canSave?: boolean;
  colors: { surface: string; border: string; background: string; primary: string; text: string; muted: string };
  onChangeText: (text: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

// Modal dialog for naming and saving the current itinerary.
export function SaveItineraryModal({
  visible, value, isSaving, error, canSave = true, colors, onChangeText, onCancel, onConfirm,
}: SaveItineraryModalProps) {
  const cancel = () => { if (!isSaving) onCancel(); };
  const confirm = () => { if (!isSaving && canSave) onConfirm(); };
  const saveDisabled = isSaving || !canSave;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={[styles.title, { color: colors.text }]}>Save Itinerary</AppText>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Itinerary name"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            maxLength={60}
            editable={!isSaving}
            accessibilityLabel="Itinerary name"
            autoFocus
          />
          <FieldError message={error} />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btnSecondary, { borderColor: colors.border }, isSaving && styles.disabled]} onPress={cancel} disabled={isSaving}
              accessibilityRole="button" accessibilityState={{ disabled: isSaving }}>
              <AppText style={[styles.btnSecondaryText, { color: colors.text }]}>Cancel</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.primary }, saveDisabled && styles.disabled]} onPress={confirm} disabled={saveDisabled}
              accessibilityRole="button" accessibilityLabel="Save itinerary" accessibilityState={{ disabled: saveDisabled, busy: isSaving }}>
              {isSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <AppText style={styles.btnPrimaryText}>Save</AppText>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Flattened styles for the itinerary save modal.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '900' },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 13, fontWeight: '700' },
  btnPrimary: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
