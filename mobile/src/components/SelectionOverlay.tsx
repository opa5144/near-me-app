import React, { useEffect } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

type SelectionOverlayProps = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onDone: () => void;
  doneDisabled?: boolean;
  scrollable?: boolean;
  children: React.ReactNode;
};

// Back, backdrop, and Cancel always discard the current picker draft.
export function SelectionOverlay({ visible, title, onCancel, onDone, doneDisabled = false, scrollable = true, children }: SelectionOverlayProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  useEffect(() => { if (visible) Keyboard.dismiss(); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel selection" />
        <View accessibilityViewIsModal onAccessibilityEscape={onCancel}
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: height - Math.max(insets.top, 16) - 12, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Pressable onPress={onCancel} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable onPress={onDone} disabled={doneDisabled} accessibilityRole="button" accessibilityState={{ disabled: doneDisabled }} style={[styles.action, doneDisabled && styles.disabled]}>
              <Text style={[styles.actionText, { color: colors.primary }]}>Done</Text>
            </Pressable>
          </View>
          {scrollable ? <ScrollView style={styles.scroll} contentContainerStyle={styles.body} nestedScrollEnabled keyboardShouldPersistTaps="handled">{children}</ScrollView>
            : <View style={styles.body}>{children}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.48)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, minHeight: 58 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center', paddingVertical: 12 },
  action: { minHeight: 48, minWidth: 64, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  scroll: { flexShrink: 1 },
  body: { padding: 16 },
});
