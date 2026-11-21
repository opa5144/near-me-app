
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { StoreItem } from '../api/stores';
import { useTheme } from '../context/ThemeContext';

export function StoreCard({ store, onPress, horizontal = false }: {
  store: StoreItem
  onPress: () => void
  horizontal?: boolean
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [imageFailed, setImageFailed] = useState(false);

  const imageUri = store.bannerImage || store.photos[0]?.url;
  // Match the shared event rows without clipping larger accessibility text.
  const cardHeight = Math.ceil(108 + (Math.max(1, fontScale) - 1) * 92);
  const summary = [store.name, 'Store', store.categories.join(', '), store.description, store.address].filter(Boolean).join('. ');

  useEffect(() => setImageFailed(false), [imageUri]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={summary}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        horizontal && [styles.horizontal, { height: cardHeight }]
      ]}
    >
      <View style={[
        styles.art,
        { backgroundColor: colors.border },
        horizontal && styles.horizontalArt
      ]}>
        {imageUri && !imageFailed ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.bannerImage}
            accessibilityLabel={store.name}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={styles.emoji}>🏪</Text>
        )}

        <View style={[styles.artBadge, { backgroundColor: colors.surface }]}>
          <Text style={[styles.artBadgeText, { color: colors.text }]}>STORE</Text>
        </View>
      </View>

      <View style={[styles.details, horizontal && styles.horizontalDetails]}>
        <View style={styles.categories}>
          <View style={[
            styles.categoryBadge,
            { backgroundColor: colors.surface, borderColor: colors.border }
          ]}>
            <Text style={[styles.categoryText, { color: colors.text }]} numberOfLines={1}>
              {store.categories.join(' · ')}
            </Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={horizontal ? 1 : 2}>
          {store.name}
        </Text>

        <Text style={[styles.description, { color: colors.muted }]} numberOfLines={horizontal ? 1 : 2}>
          {store.description}
        </Text>

        <Text style={[styles.address, { color: colors.primary }]} numberOfLines={1}>
          ⌖ {store.address}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  horizontal: { flexDirection: 'row', alignItems: 'center', padding: 6, gap: 8 },
  art: { height: 104, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  horizontalArt: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  bannerImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  emoji: { fontSize: 36 },
  artBadge: { position: 'absolute', left: 4, top: 4, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6, zIndex: 2 },
  artBadgeText: { fontSize: 8, fontWeight: '700' },
  details: { padding: 8, flex: 1, minWidth: 0 },
  horizontalDetails: { padding: 0, justifyContent: 'center' },
  categories: { flexDirection: 'row', gap: 4, marginBottom: 2 },
  categoryBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, borderWidth: 1, flexShrink: 1 },
  categoryText: { fontSize: 9, lineHeight: 11, fontWeight: '700' },
  title: { fontSize: 13, fontWeight: '800', lineHeight: 16 },
  description: { fontSize: 10, marginTop: 2, lineHeight: 12 },
  address: { fontSize: 10, lineHeight: 12, marginTop: 2 },
});
