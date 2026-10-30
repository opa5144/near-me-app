import React, { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../data/events';
import { AppButton } from '../components/AppButton';
import { colors } from '../data/theme';

export function EventDetailsScreen({ event, interested, onToggleInterested, onBack }: { event: EventItem; interested: boolean; onToggleInterested: () => void; onBack: () => void }) {
  
  // Track Page View automatically when the screen mounts/opens
  useEffect(() => {
      console.log(`[Analytics] Page view recorded for event: ${event.id}`);
      // fetch(`https://your-api.com/events/${event.id}/view`, { method: 'POST' }).catch(() => {});
  }, [event.id]);
  
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text onPress={onBack} style={styles.back}>‹  Back to events</Text>
      <View style={[styles.hero, { backgroundColor: event.accent }]}>
        {event.bannerImage ? (
          <Image source={{ uri: event.bannerImage }} style={styles.heroImage} />
        ) : (
          <Text style={styles.heroEmoji}>{event.emoji}</Text>
        )}
        <Text style={styles.heroTag}>{event.category.toUpperCase()} EVENT</Text>
      </View>
      <View style={styles.titleRow}><Text style={styles.title}>{event.title}</Text><Text style={styles.price}>{event.price}</Text></View>
      <View style={styles.info}><Text style={styles.infoIcon}>▦</Text><View style={styles.infoText}><Text style={styles.infoMain}>{event.date}</Text><Text style={styles.infoSub}>{event.time}</Text></View></View>
      <View style={styles.info}><Text style={styles.infoIcon}>⌖</Text><View style={styles.infoText}><Text style={styles.infoMain}>{event.venue}</Text><Text style={styles.infoSub}>{event.location}</Text></View></View>
      <AppButton title={interested ? '♥  Interested' : '♡  I’m interested'} onPress={onToggleInterested} style={styles.button} />
      <Text style={styles.section}>About event</Text><Text style={styles.description}>{event.description}</Text>
      <Text style={styles.section}>Location</Text><View style={styles.map}><Text style={styles.mapEmoji}>📍</Text><Text style={styles.mapLabel}>{event.venue}</Text><Text style={styles.mapSub}>Map preview placeholder</Text></View>
      <Text style={styles.section}>FAQ</Text><Text style={styles.description}>This is sample event content for the UI prototype. More details will be added later.</Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28 },
  back: { color: colors.primary, fontWeight: '800', fontSize: 13, marginBottom: 13 },
  hero: { height: 210, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden', position: 'relative' },
  heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  heroEmoji: { fontSize: 78 },
  heroTag: { position: 'absolute', bottom: 14, color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, zIndex: 2 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 17 },
  title: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '900', lineHeight: 28 },
  price: { color: colors.primary, fontSize: 15, fontWeight: '900', marginTop: 4 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoIcon: { color: colors.primary, fontSize: 21, width: 28, textAlign: 'center' },
  infoText: { flex: 1 },
  infoMain: { color: colors.text, fontSize: 12, fontWeight: '800' },
  infoSub: { color: colors.muted, fontSize: 11, marginTop: 3 },
  button: { marginTop: 17, marginBottom: 22 },
  section: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 20 },
  map: { height: 130, borderRadius: 16, backgroundColor: '#E7EEDC', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  mapEmoji: { fontSize: 25 },
  mapLabel: { color: colors.text, fontWeight: '800', fontSize: 11, marginTop: 5 },
  mapSub: { color: colors.muted, fontSize: 10, marginTop: 3 },
});