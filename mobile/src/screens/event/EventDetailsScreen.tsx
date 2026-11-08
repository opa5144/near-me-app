import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';

// AppNavigator fetches the event by ID and handles loading/missing states first.
// This display component receives a valid record and callbacks for user actions.
export function EventDetailsScreen({ event, interested, onToggleInterested, onBack }: { event: EventItem; interested: boolean; onToggleInterested: () => void; onBack: () => void }) {
  const { colors } = useTheme();
  
  // Display the uploaded image URL when available, with the emoji as a fallback.
  const [imageFailed, setImageFailed] = useState(false);

  // Try again when a different event image URL is supplied.
  useEffect(() => setImageFailed(false), [event.bannerImage]);

  // Function to share event details via native share sheet
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${event.title} event on NearMe! Happening at ${event.venue} on ${event.date} at ${event.time}.`,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  // Function to jump out of your app directly into native Maps (Google Maps app / Apple Maps app / browser fallback)
  const handleOpenMaps = async () => {
    const query = encodeURIComponent(`${event.venue}, ${event.address || event.location}`);
    const googleMapsAppUrl = `comgooglemaps://?q=${query}`;
    const appleMapsUrl = `maps:0,0?q=${query}`;
    const webMapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

    try {
      if (await Linking.canOpenURL(googleMapsAppUrl)) {
        await Linking.openURL(googleMapsAppUrl);
        return;
      }
      if (Platform.OS === 'ios' && (await Linking.canOpenURL(appleMapsUrl))) {
        await Linking.openURL(appleMapsUrl);
        return;
      }
      await Linking.openURL(webMapsUrl);
    } catch (err) {
      console.error('An error occurred opening maps', err);
    }
  };

  // Function to open the device's native calendar app directly via system intents
  const handleAddToCalendar = async () => {
    const nativeCalendarUrl = Platform.select({
      ios: 'calshow:',
      android: 'content://com.android.calendar/time/',
    });

    try {
      if (nativeCalendarUrl && (await Linking.canOpenURL(nativeCalendarUrl))) {
        await Linking.openURL(nativeCalendarUrl);
      } else {
        const title = encodeURIComponent(event.title);
        const details = encodeURIComponent(event.description);
        const location = encodeURIComponent(`${event.venue}, ${event.address || event.location}`);
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('An error occurred opening calendar', err);
    }
  };
  
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      {/* Top Header Bar with Back Link & Share Button */}
      <View style={styles.topBar}>
        <AppText onPress={onBack} style={[styles.back, { color: colors.primary }]}>‹  Back to events</AppText>
        <Pressable onPress={handleShare} style={[styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="share-social-outline" size={16} color={colors.primary} />
        </Pressable>
      </View>
      
      <View style={[styles.hero, { backgroundColor: event.accent }]}>
        {event.bannerImage && !imageFailed ? (
          <Image source={{ uri: event.bannerImage }} style={styles.heroImage}
            accessibilityLabel={event.title} onError={() => setImageFailed(true)} />
        ) : (
          <AppText style={styles.heroEmoji}>{event.emoji}</AppText>
        )}
        <AppText style={styles.heroTag}>{event.category.toUpperCase()} EVENT</AppText>
      </View>

      <View style={styles.titleRow}>
        <AppText style={[styles.title, { color: colors.text }]}>{event.title}</AppText>
        <AppText style={[styles.price, { color: colors.primary }]}>{event.price}</AppText>
      </View>

      {/* See event host */}
      {event.hostId && typeof event.hostId === 'object' && event.hostId.username && (
        <AppText style={[styles.infoSub, { color: colors.muted, marginBottom: 8, fontWeight: '700' }]}>
          👤 Hosted by @{event.hostId.username}
        </AppText>
      )}

      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} style={styles.infoIcon} />
        <View style={styles.infoText}>
          <AppText style={[styles.infoMain, { color: colors.text }]}>{event.date}</AppText>
          <AppText style={[styles.infoSub, { color: colors.muted }]}>{event.time}</AppText>
        </View>
        <Pressable 
          onPress={handleAddToCalendar}
          style={[styles.mapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="calendar" size={14} color={colors.primary} />
          <AppText style={[styles.mapButtonText, { color: colors.primary }]}>Add to Calendar</AppText>
        </Pressable>
      </View>

      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Ionicons name="location-outline" size={20} color={colors.primary} style={styles.infoIcon} />
        <View style={styles.infoText}>
          <AppText style={[styles.infoMain, { color: colors.text }]}>{event.venue}</AppText>
          <AppText style={[styles.infoSub, { color: colors.muted }]}>{event.address || event.location}</AppText>
        </View>
        <Pressable 
          onPress={handleOpenMaps}
          style={[styles.mapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="navigate-outline" size={13} color={colors.primary} />
          <AppText style={[styles.mapButtonText, { color: colors.primary }]}>Map</AppText>
        </Pressable>
      </View>

      <AppButton title={interested ? '♥  Interested' : '♡  I’m Interested'} onPress={onToggleInterested} style={styles.button} />
      
      <AppText style={[styles.section, { color: colors.text }]}>About Event</AppText>
      <AppText style={[styles.description, { color: colors.muted }]}>{event.description}</AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28, flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  back: { fontWeight: '800', fontSize: 13 },
  shareButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 210, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden', position: 'relative' },
  heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  heroEmoji: { fontSize: 78 },
  heroTag: { position: 'absolute', bottom: 14, color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, zIndex: 2 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 17 },
  title: { flex: 1, fontSize: 23, fontWeight: '900', lineHeight: 28 },
  price: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  infoIcon: { width: 24, textAlign: 'center' },
  infoText: { flex: 1 },
  infoMain: { fontSize: 12, fontWeight: '800' },
  infoSub: { fontSize: 11, marginTop: 3 },
  button: { marginTop: 17, marginBottom: 22 },
  section: { fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  description: { fontSize: 12, lineHeight: 19, marginBottom: 20 },
  mapButton: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapButtonText: { fontSize: 11, fontWeight: '800' },
});