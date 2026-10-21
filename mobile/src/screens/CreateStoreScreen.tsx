import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, Switch, TouchableOpacity } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { colors } from '../data/theme';

export function CreateStoreScreen({ onBack }: { onBack: () => void }) {
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress] = useState('');
  const [mondayOpen, setMondayOpen] = useState(true);
  const [tuesdayOpen, setTuesdayOpen] = useState(true);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text onPress={onBack} style={styles.backLink}>‹  Back to Dashboard</Text>
        <ScreenHeader eyebrow="Directory Mode" title="Create Store" subtitle="Tell us about your business location parameters." />
        
        <TouchableOpacity style={styles.googleMapLinkBanner} activeOpacity={0.85} onPress={() => alert('Opening Native Google Maps API Linker Integration...')}>
          <Text style={styles.bannerLinkText}>🗺️  Import from Google Maps Link</Text>
        </TouchableOpacity>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Legal Store Name</Text>
          <TextInput value={storeName} onChangeText={setStoreName} placeholder="e.g., Caffe Milano Plaza" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Vendor Category</Text>
          <TextInput value={category} onChangeText={setCategory} placeholder="e.g., Coffee Shop, Restaurants, Bar" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Operational Hours</Text>
          <View style={styles.hoursRow}>
            <Text style={styles.dayLabel}>Monday</Text>
            <Switch value={mondayOpen} onValueChange={setMondayOpen} trackColor={{ true: colors.primary }} />
          </View>
          <View style={styles.hoursRow}>
            <Text style={styles.dayLabel}>Tuesday</Text>
            <Switch value={tuesdayOpen} onValueChange={setTuesdayOpen} trackColor={{ true: colors.primary }} />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Location Address</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder="e.g., Nairobi Square Block, Downtown" placeholderTextColor={colors.muted} style={styles.fieldInput} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Upload Store Image</Text>
          <View style={styles.imagePlaceholderFrame}>
            <Text style={styles.placeholderGlyph}>🏬</Text>
            <Text style={styles.placeholderText}>Drop your layouts here or browse files</Text>
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
  backLink: { color: colors.primary, fontWeight: '800', fontSize: 13, marginBottom: 12 },
  googleMapLinkBanner: { height: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  bannerLinkText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  formGroup: { marginBottom: 14 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  fieldInput: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, fontSize: 12, color: colors.text },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 },
  dayLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  imagePlaceholderFrame: { height: 110, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  placeholderGlyph: { fontSize: 24 },
  placeholderText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  submitButton: { marginTop: 12 },
});
