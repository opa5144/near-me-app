import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { PhotoCollection } from '../../components/PhotoCollection';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfileScreen } from '../settings/PublicProfileScreen'; 
import { fetchUserProfile } from '../../api/client';

type EventDetailsScreenProps = {
  event: EventItem;
  interested: boolean;
  attending: boolean;
  onToggleInterested: () => void;
  onToggleAttending: () => void;
  selectionsLoading: boolean;
  selectionsReady: boolean;
  selectionSaving: boolean;
  selectionError: string | null;
  onRetrySelections: () => void;
  onBack: () => void;
  navigation?: any;
};

export function EventDetailsScreen({ event, interested, attending, onToggleInterested, onToggleAttending,
  selectionsLoading, selectionsReady, selectionSaving, selectionError, onRetrySelections,
  onBack, navigation }: EventDetailsScreenProps) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  
  // A screen left open becomes read-only as soon as the saved end time passes.
  const [hasEnded, setHasEnded] = useState(() => {
    const end = Date.parse(event.endsAt);
    return !Number.isFinite(end) || end <= Date.now();
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkEnd = () => {
      const remaining = Date.parse(event.endsAt) - Date.now();
      setHasEnded(!Number.isFinite(remaining) || remaining <= 0);
      if (remaining > 0) timer = setTimeout(checkEnd, Math.min(remaining, 60000));
    };
    checkEnd();
    return () => { if (timer) clearTimeout(timer); };
  }, [event.endsAt]);
  const selectionDisabled = hasEnded || !selectionsReady || selectionsLoading || selectionSaving;

  // Modal state for viewing host profile popup
  const [showHostModal, setShowHostModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch current user ID on mount to check if the host is yourself
  useEffect(() => {
    fetchUserProfile()
      .then((res: any) => {
        const profileData = res?.user || res;
        setCurrentUserId(profileData?._id || profileData?.id);
      })
      .catch(() => {});
  }, []);


  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${event.title} event on NearMe! Happening at ${event.venue} on ${event.date} at ${event.time}.`,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

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

  const hostUserId = (event.hostId as any)?._id || (event.hostId as any)?.id || event.hostId;
  const hostObject = typeof event.hostId === 'object' ? event.hostId : null;

  // Handle host row click: If it's your own event, go straight to your profile tab. Otherwise, open the modal.
  const handlePressHost = () => {
    if (currentUserId && hostUserId && currentUserId === hostUserId) {
      if (navigation) {
        navigation.navigate('MainTabs', { screen: 'Profile' });
      }
    } else {
      setShowHostModal(true);
    }
  };
  
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <AppText onPress={onBack} style={[styles.back, { color: colors.primary }]}>‹  Back to events</AppText>
        <Pressable onPress={handleShare} style={[styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="share-social-outline" size={16} color={colors.primary} />
        </Pressable>
      </View>
      
      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="hero" />
        <AppText style={[styles.photoCategory, { color: colors.primary }]}>{event.category.toUpperCase()} EVENT</AppText>


      <View style={styles.titleRow}>
        <AppText style={[styles.title, { color: colors.text }]}>{event.title}</AppText>
        <AppText style={[styles.price, { color: colors.primary }]}>{event.price}</AppText>
      </View>

      {/* See event host - Navigates to own profile tab if self, or opens popup modal if other */}
      {event.hostId && typeof event.hostId === 'object' && event.hostId.username && (
        <Pressable
          onPress={handlePressHost}
          style={styles.hostInlineRow}
        >
          <Image
            source={{
              uri:
                (event.hostId as any).avatarUrl ||
                'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg',
            }}
            style={styles.hostInlineAvatar}
          />
          <AppText style={[styles.infoSub, { color: colors.muted, marginBottom: 0, fontWeight: '700' }]}>
            Hosted by @{event.hostId.username}
          </AppText>
        </Pressable>
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

      {selectionError && <View style={styles.selectionNotice}>
        <AppText accessibilityRole="alert" style={{ color: errorColor }}>{selectionError}</AppText>
        <AppButton title="Reload saved choices" variant="quiet" onPress={onRetrySelections} disabled={selectionsLoading || selectionSaving} />
      </View>}
      {selectionsLoading && <AppText style={[styles.selectionNotice, { color: colors.muted }]}>Loading your saved choices...</AppText>}
      {hasEnded && <AppText style={[styles.selectionNotice, { color: colors.muted }]}>This event has ended. Your saved choices are read-only.</AppText>}
      <AppButton title={interested ? 'Interested' : "I'm Interested"} onPress={onToggleInterested}
        disabled={selectionDisabled} variant={interested ? 'primary' : 'secondary'} style={styles.button} />
      <AppButton title={selectionSaving ? 'Saving choices...' : attending ? 'Attending' : "I'll Attend"}
        onPress={onToggleAttending} disabled={selectionDisabled} variant={attending ? 'primary' : 'secondary'}
        style={styles.attendingButton} />
      
      <AppText style={[styles.section, { color: colors.text }]}>About Event</AppText>
      <AppText style={[styles.description, { color: colors.muted }]}>{event.description}</AppText>
      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="gallery" />

      {/* --- HOST PROFILE POPUP MODAL (Only opens for other users) --- */}
      <Modal
        visible={showHostModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHostModal(false)}
      >
        <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText style={[styles.modalTitle, { color: colors.text }]}>Host Profile</AppText>
            <TouchableOpacity onPress={() => setShowHostModal(false)} style={styles.closeBtn}>
              <Ionicons name="close-circle" size={28} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <PublicProfileScreen
            publicUser={event.hostId}
            events={[]}
            onOpenEvent={(e) => {
              setShowHostModal(false);
              if (navigation) navigation.navigate('EventDetails', { eventId: e.id });
            }}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28, flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  back: { fontWeight: '800', fontSize: 13 },
  shareButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  photoCategory: { fontSize: 11, fontWeight: '700', marginBottom: 12 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 17 },
  title: { flex: 1, fontSize: 23, fontWeight: '900', lineHeight: 28 },
  price: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  hostInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  hostInlineAvatar: { width: 22, height: 22, borderRadius: 11 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  infoIcon: { width: 24, textAlign: 'center' },
  infoText: { flex: 1 },
  infoMain: { fontSize: 12, fontWeight: '800' },
  infoSub: { fontSize: 11, marginTop: 3 },
  button: { marginTop: 17, marginBottom: 10 },
  attendingButton: { marginBottom: 22 },
  selectionNotice: { marginTop: 12, marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  description: { fontSize: 12, lineHeight: 19, marginBottom: 20 },
  mapButton: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapButtonText: { fontSize: 11, fontWeight: '800' },
  modalWrapper: { flex: 1, paddingTop: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '900' },
  closeBtn: { padding: 4 },
});