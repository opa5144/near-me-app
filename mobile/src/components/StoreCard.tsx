
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoreItem } from '../api/stores';
import { useTheme } from '../context/ThemeContext';

export function StoreCard({ store, onPress, horizontal = false }: {
  store: StoreItem
  onPress: () => void
  horizontal?: boolean
}) {
  const { colors } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  const imageUri = store.bannerImage || store.photos[0]?.url;

  useEffect(() => setImageFailed(false), [imageUri]);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        horizontal && styles.horizontal
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

      <View style={styles.details}>
        <View style={styles.categories}>
          <View style={[
            styles.categoryBadge,
            { backgroundColor: colors.surface, borderColor: colors.border }
          ]}>
            <Text style={[styles.categoryText, { color: colors.text }]}>
              {store.categories.join(' · ')}
            </Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {store.name}
        </Text>

        <Text style={[styles.description, { color: colors.muted }]} numberOfLines={2}>
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
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 11 },
  horizontal: { flexDirection: 'row', alignItems: 'center', padding: 9, gap: 11 },
  art: { height: 128, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  horizontalArt: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden' },
  bannerImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  emoji: { fontSize: 45 },
  artBadge: { position: 'absolute', left: 9, top: 9, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, zIndex: 2 },
  artBadgeText: { fontSize: 9, fontWeight: '700' },
  details: { padding: 11, flex: 1 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 5 },
  categoryBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  categoryText: { fontSize: 9, fontWeight: '700' },
  title: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  description: { fontSize: 10, marginTop: 5, lineHeight: 15 },
  address: { fontSize: 10, marginTop: 5 },
});
