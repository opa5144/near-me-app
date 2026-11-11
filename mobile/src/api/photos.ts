import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PersistedPhoto { id: string; url: string }
export interface EditablePhoto { id?: string; uri: string; imageBase64?: string }
export type PhotoInput = { id: string } | { imageBase64: string };
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 1024 * 1024;

// An ordered list is the desired complete collection: first is the cover, [] clears.
export function toPhotoInput(photos: EditablePhoto[]): PhotoInput[] {
  if (photos.length > MAX_PHOTOS) throw new Error('Choose up to five photos.');
  return photos.map(photo => {
    if (photo.imageBase64) return { imageBase64: photo.imageBase64 };
    if (photo.id) return { id: photo.id };
    throw new Error('A photo could not be prepared. Remove it and add it again.');
  });
}

export function toEditablePhotos(photos?: PersistedPhoto[], fallbackUri?: string): EditablePhoto[] {
  if (photos !== undefined) return photos.map(photo => ({ id: photo.id, uri: photo.url }));
  // Existing single-photo events retain the legacy image until explicitly removed.
  return fallbackUri ? [{ id: 'legacy', uri: fallbackUri }] : [];
}

export async function preparePhoto(uri: string): Promise<EditablePhoto> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const original = await context.renderAsync();
    try {
      const { width, height } = original;
      if (width < 1 || height < 1) throw new Error('The selected photo could not be read.');
      const cropWidth = Math.min(width, Math.floor(height * 16 / 9));
      const cropHeight = Math.min(height, Math.floor(cropWidth * 9 / 16));
      if (cropWidth < 1 || cropHeight < 1) throw new Error('Choose a photo with larger dimensions.');
      context.crop({ originX: Math.floor((width - cropWidth) / 2), originY: Math.floor((height - cropHeight) / 2), width: cropWidth, height: cropHeight });
      context.resize({ width: Math.min(1280, cropWidth) });
      const rendered = await context.renderAsync();
      try {
        const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
        if (!result.base64) throw new Error('The selected photo could not be prepared.');
        const bytes = result.base64.length * 3 / 4 - (result.base64.endsWith('==') ? 2 : result.base64.endsWith('=') ? 1 : 0);
        if (bytes > MAX_PHOTO_BYTES) throw new Error('This photo is larger than 1 MiB. Choose a simpler or smaller photo.');
        return { uri: result.uri, imageBase64: result.base64 };
      } finally { rendered.release(); }
    } finally { original.release(); }
  } finally { context.release(); }
}
