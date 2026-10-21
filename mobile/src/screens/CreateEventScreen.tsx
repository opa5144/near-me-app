import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { colors } from '../data/theme';

export function CreateEventScreen({ onBack }: { onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text onPress={onBack} style={styles.backLink}>‹  Back to Dashboard</Text>
        <ScreenHeader eyebrow="Blueprint Mode" title="Create Event" subtitle="Tell us about your event details and entry rules." />
        
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Event Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g., Hardcore Synthwave Experience" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Date Picker</Text>
          <TextInput value={date} onChangeText={setDate} placeholder="Jun 18, 2026" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.splitRow}>
          <View style={styles.splitInput}>
            <Text style={styles.fieldLabel}>Start Time</Text>
            <TextInput value={startTime} onChangeText={setStartTime} placeholder="11:00 PM" placeholderTextColor={colors.muted} style={styles.fieldInput} />
          </View>
          <View style={styles.splitInput}>
            <Text style={styles.fieldLabel}>End Time</Text>
            <TextInput value={endTime} onChangeText={setEndTime} placeholder="3:00 AM" placeholderTextColor={colors.muted} style={styles.fieldInput} />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Ticket Price</Text>
          <TextInput value={price} onChangeText={setPrice} placeholder="e.g., 25 or Free" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Location Address / Venue</Text>
          <TextInput value={location} onChangeText={setLocation} placeholder="e.g., The Matrix Sub-Basement" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Upload Banner Image</Text>
          <View style={styles.imagePlaceholderFrame}>
            <Text style={styles.placeholderGlyph}>🖼️</Text>
            <Text style={styles.placeholderText}>Drop banner image here or browse files</Text>
          </View>
        </View>

        <AppButton title="Next" onPress={() => alert('Event Blueprint Formulated.')} style={styles.submitButton} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  backLink: { color: colors.primary, fontWeight: '800', fontSize: 13, marginBottom: 12 },
  formGroup: { marginBottom: 14 },
  splitRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  splitInput: { flex: 1 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, fontSize: 12, color: colors.text },
  imagePlaceholderFrame: { height: 110, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  placeholderGlyph: { fontSize: 24 },
  placeholderText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  submitButton: { marginTop: 12 },
});
