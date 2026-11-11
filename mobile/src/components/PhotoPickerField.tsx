import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MAX_PHOTOS, preparePhoto } from '../api/photos';
import type { EditablePhoto } from '../api/photos';
import { AppButton } from './AppButton';
import { useTheme } from '../context/ThemeContext';

export interface PhotoPickerFieldProps {
  photos: EditablePhoto[];
  onChange: (photos: EditablePhoto[]) => void;
  disabled?: boolean;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}

export function PhotoPickerField({ photos, onChange, disabled = false, label = 'Photos', onBusyChange }: PhotoPickerFieldProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ photos, onChange, disabled, onBusyChange });
  latest.current = { photos, onChange, disabled, onBusyChange };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function addPhoto() {
    if (busyRef.current || latest.current.disabled || latest.current.photos.length >= MAX_PHOTOS) return;
    busyRef.current = true;
    setBusy(true);
    latest.current.onBusyChange?.(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        if (mounted.current) Alert.alert('Photo Permission', 'Allow access to your photo library to add a photo.');
        return;
      }
      // Add one cropped photo at a time; Expo cannot crop a multiple selection.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 });
      if (result.canceled || !result.assets?.length || !mounted.current) return;
      const prepared = await preparePhoto(result.assets[0].uri);
      if (mounted.current && latest.current.photos.length < MAX_PHOTOS) {
        latest.current.onChange([...latest.current.photos, prepared]);
      }
    } catch (error: unknown) {
      if (mounted.current) Alert.alert('Photo Error', error instanceof Error ? error.message : 'This photo could not be prepared.');
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        latest.current.onBusyChange?.(false);
      }
    }
  }

  function changeOrder(index: number, target: number) {
    if (busyRef.current || disabled || target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    const [photo] = reordered.splice(index, 1);
    reordered.splice(target, 0, photo);
    onChange(reordered);
  }

  const blocked = busy || disabled;
  return <View style={styles.container}>
    <Text style={[styles.label, { color: colors.text }]}>{label} ({photos.length}/{MAX_PHOTOS})</Text>
    <Text style={[styles.help, { color: colors.muted }]}>Optional. The first photo is the cover. Add up to five photos.</Text>
    {photos.map((photo, index) => <View key={photo.id || photo.uri} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityLabel={index === 0 ? 'Cover photo' : 'Photo ' + (index + 1)} />
      <View style={styles.controls}>
        <Text style={[styles.photoLabel, { color: colors.text }]}>{index === 0 ? 'Cover photo' : 'Photo ' + (index + 1)}</Text>
        <View style={styles.actions}>
          {index > 0 && <Pressable disabled={blocked} onPress={() => changeOrder(index, 0)} accessibilityRole="button" style={styles.action}>
            <Text style={{ color: blocked ? colors.muted : colors.primary }}>Make cover</Text>
          </Pressable>}
          <Pressable disabled={blocked || index === 0} onPress={() => changeOrder(index, index - 1)} accessibilityRole="button" accessibilityLabel={'Move photo ' + (index + 1) + ' earlier'} style={styles.action}>
            <Text style={{ color: blocked || index === 0 ? colors.muted : colors.primary }}>Earlier</Text>
          </Pressable>
          <Pressable disabled={blocked || index === photos.length - 1} onPress={() => changeOrder(index, index + 1)} accessibilityRole="button" accessibilityLabel={'Move photo ' + (index + 1) + ' later'} style={styles.action}>
            <Text style={{ color: blocked || index === photos.length - 1 ? colors.muted : colors.primary }}>Later</Text>
          </Pressable>
          <Pressable disabled={blocked} onPress={() => { if (!busyRef.current && !disabled) onChange(photos.filter((_, itemIndex) => itemIndex !== index)); }} accessibilityRole="button" accessibilityLabel={'Remove photo ' + (index + 1)} style={styles.action}>
            <Text style={{ color: blocked ? colors.muted : colors.primary }}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>)}
    {busy && <ActivityIndicator color={colors.primary} style={styles.busy} accessibilityLabel="Preparing photo" />}
    <AppButton title={busy ? 'Preparing photo...' : 'Add photo'} variant="secondary" onPress={addPhoto} disabled={blocked || photos.length >= MAX_PHOTOS} />
  </View>;
}

const styles = StyleSheet.create({
  container: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  help: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 10 },
  preview: { width: '100%', height: 150, resizeMode: 'cover' },
  controls: { padding: 10 },
  photoLabel: { fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  action: { paddingVertical: 10, paddingHorizontal: 8 },
  busy: { marginVertical: 10 },
});
