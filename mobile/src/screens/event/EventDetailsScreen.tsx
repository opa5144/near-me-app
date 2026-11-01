import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../../data/events';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';

// AppNavigator fetches the event by ID and handles loading/missing states first.
// This display component receives a valid record and callbacks for user actions.
export function EventDetailsScreen({ event, interested, onToggleInterested, onBack }: { event: EventItem; interested: boolean; onToggleInterested: () => void; onBack: () => void }) {
  const { colors } = useTheme();
  
  // Display the uploaded image URL when available, with the emoji as a fallback.
  const [imageFailed, setImageFailed] = useState(false);
  // Try again when a different event image URL is supplied.
  useEffect(() => setImageFailed(false), [event.bannerImage]);
  // Views/attendance are not tracked by this template.
  
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={onBack} style={[styles.back, { color: colors.primary }]}>‹  Back to events</Text>
      <View style={[styles.hero, { backgroundColor: event.accent }]}>
        {event.bannerImage && !imageFailed ? (
          <Image source={{ uri: event.bannerImage }} style={styles.heroImage}
            accessibilityLabel={event.title} onError={() => setImageFailed(true)} />
        ) : (
          <Text style={styles.heroEmoji}>{event.emoji}</Text>
        )}
        <Text style={styles.heroTag}>{event.category.toUpperCase()} EVENT</Text>
      </View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>
        <Text style={[styles.price, { color: colors.primary }]}>{event.price}</Text>
      </View>
      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Text style={[styles.infoIcon, { color: colors.primary }]}>▦</Text>
        <View style={styles.infoText}>
          <Text style={[styles.infoMain, { color: colors.text }]}>{event.date}</Text>
          <Text style={[styles.infoSub, { color: colors.muted }]}>{event.time}</Text>
        </View>
      </View>
      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Text style={[styles.infoIcon, { color: colors.primary }]}>⌖</Text>
        <View style={styles.infoText}>
          <Text style={[styles.infoMain, { color: colors.text }]}>{event.venue}</Text>
          <Text style={[styles.infoSub, { color: colors.muted }]}>{event.location}</Text>
        </View>
      </View>
      <AppButton title={interested ? '♥  Interested' : '♡  I’m interested'} onPress={onToggleInterested} style={styles.button} />
      <Text style={[styles.section, { color: colors.text }]}>About event</Text>
      <Text style={[styles.description, { color: colors.muted }]}>{event.description}</Text>
      <Text style={[styles.section, { color: colors.text }]}>Location</Text>
      <View style={[styles.map, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={styles.mapEmoji}>📍</Text>
        <Text style={[styles.mapLabel, { color: colors.text }]}>{event.venue}</Text>
        <Text style={[styles.mapSub, { color: colors.muted }]}>Map preview placeholder</Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28, flexGrow: 1 },
  back: { fontWeight: '800', fontSize: 13, marginBottom: 13 },
  hero: { height: 210, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden', position: 'relative' },
  heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  heroEmoji: { fontSize: 78 },
  heroTag: { position: 'absolute', bottom: 14, color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, zIndex: 2 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 17 },
  title: { flex: 1, fontSize: 23, fontWeight: '900', lineHeight: 28 },
  price: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  infoIcon: { fontSize: 21, width: 28, textAlign: 'center' },
  infoText: { flex: 1 },
  infoMain: { fontSize: 12, fontWeight: '800' },
  infoSub: { fontSize: 11, marginTop: 3 },
  button: { marginTop: 17, marginBottom: 22 },
  section: { fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  description: { fontSize: 12, lineHeight: 19, marginBottom: 20 },
  map: { height: 130, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  mapEmoji: { fontSize: 25 },
  mapLabel: { fontWeight: '800', fontSize: 11, marginTop: 5 },
  mapSub: { fontSize: 10, marginTop: 3 },
});