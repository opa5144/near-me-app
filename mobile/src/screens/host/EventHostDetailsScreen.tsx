import React, { useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar/legacy';
import { EventItem } from '../../data/events';
import { AppText } from '../../components/AppText';
import { PhotoCollection } from '../../components/PhotoCollection';
import { useTheme } from '../../context/ThemeContext';
import { FieldError } from '../../components/FieldError';
import { openEventMaps } from '../../utils/eventMaps';
import { InviteFriendsModal } from '../../components/InviteFriendsModal';
import { FriendItem } from '../../api/friends';

// Helper to format prices as whole dollars without decimals or cents
function formatWholeDollarPrice(price?: string | number | null): string {
  if (price === undefined || price === null) return 'Free';
  const raw = String(price).trim();
  if (!raw || raw.toLowerCase().includes('free')) return 'Free';
  const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Free';
  return `$${Math.round(numeric).toLocaleString()}`;
}

function parseEventPrice(price?: string): number {
  if (!price || price.toLowerCase().includes('free')) return 0;
  const numeric = parseFloat(price.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

// Host details screen modeled after EventDetailsScreen, adding analytics and host management actions.
export function EventHostDetailsScreen({ event, onEditEvent, onBack, onRefresh, refreshing, refreshError, onInviteFriend }: {
  event: EventItem;
  onEditEvent: () => void;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string | null;
  onInviteFriend?: (friend: FriendItem, eventId: string) => Promise<void> | void;
}) {
  const { colors, theme } = useTheme();
  const revenueColor = theme === 'dark' ? '#69F0AE' : '#1B873F';
  const [mapError, setMapError] = useState<string | null>(null);
  const [openingMap, setOpeningMap] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // These are saved choices across active accounts, not the host's personal flags.
  const interestedCount = event.interestedCount ?? 0;
  const attendingCount = event.attendingCount ?? 0;
  const estRevenue = parseEventPrice(event.price) * attendingCount;

  // Function to share event details via native share sheet
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${event.title} hosted by me on NearMe! Happening at ${event.venue} on ${event.date} from ${event.time}.`,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  // Open the saved venue through the shared Maps link and show action failures here.
  const handleOpenMaps = async () => {
    if (openingMap) return;
    setMapError(null); setOpeningMap(true);
    try {
      await openEventMaps(event);
    } catch (reason) { setMapError(reason instanceof Error ? reason.message : 'Maps could not be opened. Please try again.'); }
    finally { setOpeningMap(false); }
  };

  const handleAddToCalendar = async () => {
    // Build the event times from the saved start/end (assumes event.startsAt / event.endsAt are ISO strings)
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    const hasTimes = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime());
    const location = `${event.venue}, ${event.address || event.location}`;

    try {
      if (hasTimes) {
        // Opens the native calendar's "new event" screen pre-filled; user only has to press Add/Save
        await Calendar.createEventInCalendarAsync({
          title: event.title,
          notes: event.description,
          location,
          startDate: start,
          endDate: end,
        });
      } else {
        // Fallback if the saved times can't be parsed: Google Calendar template link
        const title = encodeURIComponent(event.title);
        const details = encodeURIComponent(event.description);
        const loc = encodeURIComponent(location);
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${loc}`;
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('An error occurred opening calendar', err);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
        tintColor={colors.primary} colors={[colors.primary]} />}>
      {/* Top Header Bar with Back Link, In-App Invite & Share Button */}
      <View style={styles.topBar}>
        <AppText onPress={onBack} style={[styles.back, { color: colors.primary }]}>‹  Back to dashboard</AppText>
        <View style={styles.topBarActions}>
          <Pressable
            onPress={() => setShowInviteModal(true)}
            style={[styles.invitePillButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="person-add-outline" size={14} color={colors.primary} />
            <AppText style={[styles.invitePillText, { color: colors.primary }]}>Invite</AppText>
          </Pressable>
          <Pressable onPress={handleShare} style={[styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="share-social-outline" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>
      {refreshError && <View style={{ marginBottom: 12 }}>
        <AppText accessibilityRole="alert" style={{ color: colors.text }}>{refreshError}</AppText>
        <Pressable accessibilityRole="button" onPress={onRefresh} style={{ paddingVertical: 8 }}>
          <AppText style={{ color: colors.primary }}>Retry</AppText>
        </Pressable>
      </View>}

      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="hero" />
      <View style={styles.categoryList}>
        {event.categories.map(category => <AppText key={category} style={[styles.photoCategory, { color: colors.primary, borderColor: colors.primary }]}>{category.toUpperCase()}</AppText>)}
        <AppText style={{ color: colors.muted, fontSize: 11 }}>EVENT • HOST VIEW</AppText>
      </View>

      {/* Host Analytics Performance Summary */}
      <View style={[styles.metricsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.metricItem}>
          <AppText style={[styles.metricValue, { color: revenueColor }]}>
            {refreshing ? '…' : refreshError ? '—' : `$${estRevenue.toLocaleString()}`}
          </AppText>
          <AppText style={[styles.metricLabel, { color: colors.muted }]}>EST. REVENUE</AppText>
        </View>
        <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
        <View style={styles.metricItem}>
          <AppText style={[styles.metricValue, { color: colors.text }]}>{refreshing ? '…' : refreshError ? '—' : attendingCount}</AppText>
          <AppText style={[styles.metricLabel, { color: colors.muted }]}>ATTENDING</AppText>
        </View>
        <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
        <View style={styles.metricItem}>
          <AppText style={[styles.metricValue, { color: colors.text }]}>{refreshing ? '…' : refreshError ? '—' : interestedCount}</AppText>
          <AppText style={[styles.metricLabel, { color: colors.muted }]}>INTERESTED</AppText>
        </View>
      </View>

      <View style={styles.titleRow}>
        <AppText style={[styles.title, { color: colors.text }]}>{event.title}</AppText>
        <AppText style={[styles.price, { color: colors.primary }]}>{formatWholeDollarPrice(event.price)}</AppText>
      </View>

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
          disabled={openingMap}
          style={[styles.mapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="navigate-outline" size={13} color={colors.primary} />
          <AppText style={[styles.mapButtonText, { color: colors.primary }]}>{openingMap ? 'Opening...' : 'Map'}</AppText>
        </Pressable>
      </View>
      <FieldError message={mapError} />

      {/* Host Action Control */}
      <Pressable
        onPress={onEditEvent}
        style={[styles.editButton, { backgroundColor: colors.primary }]}>
        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
        <AppText style={styles.editButtonText}>Edit Event Details</AppText>
      </Pressable>

      <AppText style={[styles.section, { color: colors.text }]}>About event</AppText>
      <AppText style={[styles.description, { color: colors.muted }]}>{event.description}</AppText>
      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="gallery" />

      {/* Direct In-App Friend Invites */}
      <InviteFriendsModal
        visible={showInviteModal}
        eventTitle={event.title}
        onClose={() => setShowInviteModal(false)}
        onSendInvite={async (friend) => {
          if (onInviteFriend) {
            await onInviteFriend(friend, event.id);
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28, flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { fontWeight: '800', fontSize: 13 },
  invitePillButton: { height: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  invitePillText: { fontSize: 12, fontWeight: '800' },
  shareButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 },
  photoCategory: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metricsContainer: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 18, alignItems: 'center' },
  metricItem: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 18, fontWeight: '900' },
  metricLabel: { fontSize: 9, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  metricDivider: { width: 1, height: 28 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 17 },
  title: { flex: 1, fontSize: 23, fontWeight: '900', lineHeight: 28 },
  price: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  infoIcon: { width: 24, textAlign: 'center' },
  infoText: { flex: 1 },
  infoMain: { fontSize: 12, fontWeight: '800' },
  infoSub: { fontSize: 11, marginTop: 3 },
  editButton: { height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 17, marginBottom: 22 },
  editButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  section: { fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  description: { fontSize: 12, lineHeight: 19, marginBottom: 20 },
  mapButton: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapButtonText: { fontSize: 11, fontWeight: '800' },
});