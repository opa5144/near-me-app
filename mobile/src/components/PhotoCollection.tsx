import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PersistedPhoto } from '../api/photos';
import { AppButton } from './AppButton';
import { useTheme } from '../context/ThemeContext';

export interface PhotoCollectionProps {
  photos: PersistedPhoto[];
  fallbackUri?: string;
  title?: string;
  emoji?: string;
  accent?: string;
  mode?: 'hero' | 'gallery' | 'both';
}

function PhotoImage({ uri, label, full = false }: { uri: string; label: string; full?: boolean }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return failed ? <View style={styles.unavailable}><Text style={{ color: colors.muted }}>Photo unavailable</Text></View>
    : <Image source={{ uri }} accessibilityLabel={label} onError={() => setFailed(true)} style={styles.image} resizeMode={full ? 'contain' : 'cover'} />;
}

// One display serves event/store details and read-only history without navigation params.
export function PhotoCollection({ photos, fallbackUri, title = 'Photos', emoji, accent, mode = 'both' }: PhotoCollectionProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const items = useMemo(() => photos.length ? photos : fallbackUri ? [{ id: 'legacy', url: fallbackUri }] : [], [photos, fallbackUri]);
  const signature = items.map(photo => photo.id + ':' + photo.url).join('|');
  const [heroWidth, setHeroWidth] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerHeight, setViewerHeight] = useState(0);
  const heroList = useRef<FlatList<PersistedPhoto>>(null);
  const viewerList = useRef<FlatList<PersistedPhoto>>(null);
  useEffect(() => {
    setHeroIndex(0);
    setViewerIndex(null);
    heroList.current?.scrollToOffset({ offset: 0, animated: false });
  }, [signature]);
  useEffect(() => {
    // Paging offsets belong to the measured viewport, not the previous rotation.
    setHeroIndex(0);
    heroList.current?.scrollToOffset({ offset: 0, animated: false });
  }, [heroWidth]);

  const clampIndex = (index: number) => Math.max(0, Math.min(items.length - 1, index));
  const moveViewer = (index: number) => {
    const next = clampIndex(index);
    setViewerIndex(next);
    viewerList.current?.scrollToIndex({ index: next, animated: true });
  };

  if (mode === 'gallery' && !items.length) return null;
  return <View style={styles.collection}>
    {mode !== 'gallery' && <>
      <View onLayout={event => setHeroWidth(event.nativeEvent.layout.width)} style={[styles.hero, { backgroundColor: accent || colors.surface }]}>
        {items.length && heroWidth > 0 ? <FlatList ref={heroList} data={items} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: heroWidth, height: 220 }}
          keyExtractor={photo => photo.id} getItemLayout={(_, index) => ({ index, length: heroWidth, offset: heroWidth * index })}
          onMomentumScrollEnd={event => setHeroIndex(clampIndex(Math.round(event.nativeEvent.contentOffset.x / heroWidth)))}
          renderItem={({ item, index }) => <Pressable accessibilityRole="button" accessibilityLabel={title + ', photo ' + (index + 1) + ' of ' + items.length + '. Open full screen'}
            onPress={() => setViewerIndex(index)} style={{ width: heroWidth, height: 220 }}>
            <PhotoImage uri={item.url} label={title + ', photo ' + (index + 1)} />
          </Pressable>} /> : !items.length ? <Text style={[styles.emoji, { color: colors.text }]}>{emoji || 'No photos'}</Text> : null}
        {items.length > 0 && <View pointerEvents="none" style={styles.count}><Text style={styles.countText}>{heroIndex + 1} / {items.length}</Text></View>}
      </View>
      {items.length > 1 && <View style={styles.dots}>{items.map((photo, index) => <View key={photo.id} style={[styles.dot, { backgroundColor: index === heroIndex ? colors.primary : colors.border }]} />)}</View>}
    </>}
    {mode !== 'hero' && items.length > 0 && <>
      <Text style={[styles.heading, { color: colors.text }]}>Photo gallery</Text>
      <View style={styles.thumbnails}>{items.map((photo, index) => <Pressable key={photo.id} onPress={() => setViewerIndex(index)}
        accessibilityRole="button" accessibilityLabel={'Open photo ' + (index + 1) + ' of ' + items.length} style={styles.thumbnail}>
        <PhotoImage uri={photo.url} label={title + ', photo ' + (index + 1)} />
      </Pressable>)}</View>
    </>}
    <Modal visible={viewerIndex !== null && items.length > 0} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setViewerIndex(null)}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.viewer, { backgroundColor: colors.background }]}>
        <View style={styles.viewerHeader}>
          <Text numberOfLines={1} style={[styles.viewerTitle, { color: colors.text }]}>{title}</Text>
          <AppButton title="Close" variant="quiet" onPress={() => setViewerIndex(null)} />
        </View>
        <View style={styles.viewerPages} onLayout={event => setViewerHeight(event.nativeEvent.layout.height)}>
        {viewerIndex !== null && items.length > 0 && viewerHeight > 0 && <FlatList key={'viewer-' + screenWidth + '-' + viewerHeight} ref={viewerList} data={items}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false} initialScrollIndex={clampIndex(viewerIndex)}
          keyExtractor={photo => photo.id} style={{ width: screenWidth, height: viewerHeight }}
          getItemLayout={(_, index) => ({ index, length: screenWidth, offset: screenWidth * index })}
          onMomentumScrollEnd={event => setViewerIndex(clampIndex(Math.round(event.nativeEvent.contentOffset.x / screenWidth)))}
          renderItem={({ item, index }) => <View style={{ width: screenWidth, height: viewerHeight }}><PhotoImage full uri={item.url} label={title + ', photo ' + (index + 1)} /></View>} />}
        </View>
        <View style={styles.viewerFooter}>
          <AppButton title="Previous" variant="quiet" disabled={viewerIndex === null || viewerIndex === 0} onPress={() => moveViewer((viewerIndex ?? 0) - 1)} />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{(viewerIndex ?? 0) + 1} / {items.length}</Text>
          <AppButton title="Next" variant="quiet" disabled={viewerIndex === null || viewerIndex >= items.length - 1} onPress={() => moveViewer((viewerIndex ?? 0) + 1)} />
        </View>
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  collection: { marginBottom: 18 },
  hero: { height: 220, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  emoji: { fontSize: 48 },
  count: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#00000099', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbnail: { width: 88, height: 66, borderRadius: 10, overflow: 'hidden' },
  viewer: { flex: 1 },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  viewerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  viewerPages: { flex: 1 },
  viewerFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8 },
});
