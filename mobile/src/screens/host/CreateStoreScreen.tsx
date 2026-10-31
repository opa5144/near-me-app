import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Switch, TouchableOpacity } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';

export function CreateStoreScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress] = useState('');
  const [mondayOpen, setMondayOpen] = useState(true);
  const [tuesdayOpen, setTuesdayOpen] = useState(true);

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text onPress={onBack} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Dashboard</Text>
        <ScreenHeader eyebrow="Directory Mode" title="Create Store" subtitle="Tell us about your business location parameters." />
        
        <TouchableOpacity style={[styles.googleMapLinkBanner, { backgroundColor: colors.primary }]} activeOpacity={0.85} onPress={() => alert('Opening Native Google Maps API Linker Integration...')}>
          <Text style={styles.bannerLinkText}>🗺️  Import from Google Maps</Text>
        </TouchableOpacity>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Legal Store Name</Text>
          <TextInput value={storeName} onChangeText={setStoreName} placeholder="e.g., Caffe Milano Plaza" placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Vendor Category</Text>
          <TextInput value={category} onChangeText={setCategory} placeholder="e.g., Coffee Shop, Restaurants, Bar" placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Operational Hours</Text>
          <View style={[styles.hoursRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.dayLabel, { color: colors.text }]}>Monday</Text>
            <Switch value={mondayOpen} onValueChange={setMondayOpen} trackColor={{ true: colors.primary }} />
          </View>
          <View style={[styles.hoursRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.dayLabel, { color: colors.text }]}>Tuesday</Text>
            <Switch value={tuesdayOpen} onValueChange={setTuesdayOpen} trackColor={{ true: colors.primary }} />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Location Address</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder="e.g., Nairobi Square Block, Downtown" placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Upload Store Image</Text>
          <View style={[styles.imagePlaceholderFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.placeholderGlyph}>🏬</Text>
            <Text style={[styles.placeholderText, { color: colors.muted }]}>Drop your layouts here or browse files</Text>
          </View>
        </View>

        <AppButton title="Publish Store" onPress={() => alert('Store Node Catalogued.')} style={styles.submitButton} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  googleMapLinkBanner: { height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  bannerLinkText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  formGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 12 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 },
  dayLabel: { fontSize: 12, fontWeight: '700' },
  imagePlaceholderFrame: { height: 110, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  placeholderGlyph: { fontSize: 24 },
  placeholderText: { fontSize: 10, fontWeight: '700' },
  submitButton: { marginTop: 12 },
});