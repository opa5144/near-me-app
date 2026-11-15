import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EditablePhoto } from '../api/photos';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';
import { PhotoPickerField } from './PhotoPickerField';

export interface ImageUploaderProps {
  label?: string;
  disabled?: boolean;
  // The caller supplies persistence. Selecting a preview alone never uploads it.
  onUpload?: (photo: EditablePhoto) => void | Promise<void>;
}

// Native single-photo selection, preview and reset, using the shared preparation rules.
export default function ImageUploader({ label = 'Upload an image', disabled = false, onUpload }: ImageUploaderProps) {
  const { colors } = useTheme();
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const mounted = useRef(true);
  const uploadingRef = useRef(false);
  const preparingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function reset() {
    if (disabled || uploadingRef.current || preparingRef.current) return;
    setPhotos([]); setError(null); setUploaded(false);
  }

  async function upload() {
    const photo = photos[0];
    if (!onUpload || !photo || disabled || uploadingRef.current || preparingRef.current) return;
    uploadingRef.current = true;
    setUploading(true); setError(null); setUploaded(false);
    try {
      await onUpload(photo);
      if (mounted.current) { setPhotos([]); setUploaded(true); }
    } catch (reason: unknown) {
      if (mounted.current) setError(settingsErrorMessage(reason, 'Unable to upload this image. Please try again.'));
    } finally {
      uploadingRef.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  return <View style={styles.container}>
    <PhotoPickerField label={label} photos={photos} maxPhotos={1}
      disabled={disabled || uploading} onChange={next => { setPhotos(next); setError(null); setUploaded(false); }}
      onBusyChange={busy => { preparingRef.current = busy; setPreparing(busy); }} />
    {photos.length > 0 && <AppButton title="Reset image" variant="quiet" onPress={reset}
      disabled={disabled || preparing || uploading} />}
    {onUpload ? <AppButton title={uploading ? 'Uploading...' : 'Upload image'} onPress={() => void upload()}
      disabled={disabled || preparing || uploading || photos.length === 0} />
      : <Text style={[styles.note, { color: colors.muted }]}>Photo preview only. Uploading is not connected.</Text>}
    <FieldError message={error} />
    {uploaded && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.primary }]}>Image uploaded.</Text>}
  </View>;
}

const styles = StyleSheet.create({ container: { gap: 8 }, note: { fontSize: 12, lineHeight: 18 } });
