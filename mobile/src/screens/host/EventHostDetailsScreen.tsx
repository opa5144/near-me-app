import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { EventItem } from '../../data/events';
import { AppText } from '../../components/AppText';
import { AppButton } from '../../components/AppButton';
import { PhotoCollection } from '../../components/PhotoCollection';
import { useTheme } from '../../context/ThemeContext';
import { FieldError } from '../../components/FieldError';
import { openEventMaps } from '../../utils/eventMaps';
import { EventRatingSummary } from '../../components/EventRatingSummary';
import { InviteFriendsModal } from '../../components/InviteFriendsModal';
import { addEventToCalendar } from '../../utils/eventCalendar';
import { estimatedRevenueCents, formatCurrency, formatEventPrice } from '../../utils/eventPrice';
import { archiveEvent, cancelEvent, eventPhotoHeaders } from '../../api/events';
import { hostRequestError } from './hostFormUtils';

// Host details screen modeled after EventDetailsScreen, adding analytics and host management actions.
export function EventHostDetailsScreen({ event, onEditEvent, onRescheduleEvent, onChanged, onBack, onRefresh, refreshing, refreshError, ratingRefreshKey }: {
  event: EventItem;
  onEditEvent: () => void;
  onRescheduleEvent: () => void;
  onChanged: (event: EventItem) => void;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string | null;
  ratingRefreshKey?: number | string;
}) {
  const { colors, theme } = useTheme();
  const revenueColor = theme === 'dark' ? '#69F0AE' : '#1B873F';
  const [mapError, setMapError] = useState<string | null>(null);
  const [openingMap, setOpeningMap] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [openingCalendar, setOpeningCalendar] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  usePreventRemove(changing, () => {});
  const changingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [hasEnded, setHasEnded] = useState(() => Date.parse(event.endsAt) <= Date.now());
  const [registrationClosed, setRegistrationClosed] = useState(() => Date.parse(event.registrationClosesAt || event.endsAt) <= Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      const remaining = Date.parse(event.endsAt) - Date.now();
      const untilClosing = Date.parse(event.registrationClosesAt || event.endsAt) - Date.now();
      setHasEnded(Number.isFinite(remaining) && remaining <= 0);
      setRegistrationClosed(!Number.isFinite(untilClosing) || untilClosing <= 0);
      if (remaining > 0) timer = setTimeout(update, Math.min(remaining, untilClosing > 0 ? untilClosing : 60000, 60000));
    }
    update();
    return () => { if (timer) clearTimeout(timer); };
  }, [event.endsAt, event.startsAt, event.registrationClosesAt]);
  const cancelled = event.status === 'cancelled';
  const archived = event.status === 'archived';
  const isDraft = event.status === 'draft';
  const readOnly = cancelled || archived || hasEnded || event.storage === 'past';
  const invitationsDisabled = readOnly || isDraft || registrationClosed || !Number.isFinite(Date.parse(event.endsAt));
  useEffect(() => { if (invitationsDisabled) setShowInviteModal(false); }, [invitationsDisabled]);
  // These are saved choices across active accounts, not the host's personal flags.
  const interestedCount = event.interestedCount ?? 0;
  const attendingCount = event.attendingCount ?? 0;
  const revenueCents = cancelled || archived || isDraft ? 0 : estimatedRevenueCents(event, attendingCount);

  const changeLifecycle = async (action: 'archive' | 'cancel') => {
    if (changingRef.current || readOnly || isDraft) return;
    changingRef.current = true; setChanging(true); setActionError(null);
    try {
      const saved = action === 'archive' ? await archiveEvent(event.id) : await cancelEvent(event.id);
      if (mounted.current) onChanged(saved);
    } catch (reason) {
      if (mounted.current) {
        const feedback = hostRequestError(reason, 'The event could not be updated. Please try again.');
        setActionError(feedback.message || Object.values(feedback.errors).find(Boolean) || 'The event could not be updated.');
      }
    } finally { changingRef.current = false; if (mounted.current) setChanging(false); }
  };
  const confirmLifecycle = (action: 'archive' | 'cancel') => {
    if (changingRef.current || readOnly || isDraft) return;
    Alert.alert(action === 'archive' ? 'Archive event?' : 'Cancel event?',
      'Registration will stop. Interested and attending users will be notified, and the event will remain in Archived.',
      [{ text: 'Keep Event', style: 'cancel' }, { text: action === 'archive' ? 'Archive' : 'Cancel Event', style: 'destructive', onPress: () => { void changeLifecycle(action); } }]);
  };

  // Function to share event details via native share sheet
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${event.title} hosted by me on NearMe! Happening at ${event.venue} on ${event.date} from ${event.time}.`,
      });
    } catch {
      Alert.alert('Unable to share', 'The event could not be shared. Please try again.');
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
    if (openingCalendar) return;
    setCalendarError(null); setOpeningCalendar(true);
    try { await addEventToCalendar(event); }
    catch (error) { setCalendarError(error instanceof Error ? error.message : 'The calendar could not be opened. Please try again.'); }
    finally { setOpeningCalendar(false); }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
        tintColor={colors.primary} colors={[colors.primary]} />}>
      {/* Top Header Bar with Back Link, In-App Invite & Share Button */}
      <View style={styles.topBar}>
        <AppText onPress={onBack} style={[styles.back, { color: colors.primary }]}>‹  Back to dashboard</AppText>
        {!isDraft && <View style={styles.topBarActions}>
          <Pressable
            onPress={() => setShowInviteModal(true)}
            disabled={invitationsDisabled}
            style={[styles.invitePillButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="person-add-outline" size={14} color={colors.primary} />
            <AppText style={[styles.invitePillText, { color: colors.primary }]}>Invite</AppText>
          </Pressable>
          <Pressable onPress={handleShare} style={[styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="share-social-outline" size={16} color={colors.primary} />
          </Pressable>
        </View>}
      </View>
      {refreshError && <View style={{ marginBottom: 12 }}>
        <AppText accessibilityRole="alert" style={{ color: colors.text }}>{refreshError}</AppText>
        <Pressable accessibilityRole="button" onPress={onRefresh} style={{ paddingVertical: 8 }}>
          <AppText style={{ color: colors.primary }}>Retry</AppText>
        </Pressable>
      </View>}

      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="hero" getImageHeaders={uri => eventPhotoHeaders(uri, isDraft)} />
      <View style={styles.categoryList}>
        {event.categories.map(category => <AppText key={category} style={[styles.photoCategory, { color: colors.primary, borderColor: colors.primary }]}>{category.toUpperCase()}</AppText>)}
        <AppText style={{ color: colors.muted, fontSize: 11 }}>EVENT • HOST VIEW</AppText>
      </View>
      <AppText style={{ color: colors.primary, fontWeight: '800', marginBottom: 12 }}>
        {isDraft ? 'Private draft' : cancelled ? 'Cancelled' : archived ? 'Archived' : hasEnded ? 'Completed' : 'Active'}
      </AppText>

      {/* Host Analytics Performance Summary */}
      {!isDraft && <View style={[styles.metricsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.metricItem}>
          <AppText style={[styles.metricValue, { color: revenueColor }]}>
            {refreshing ? '…' : refreshError || revenueCents === null ? '—' : formatCurrency(revenueCents / 100)}
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
      </View>}

      <View style={styles.titleRow}>
        <AppText style={[styles.title, { color: colors.text }]}>{event.title || 'Untitled draft'}</AppText>
        <AppText style={[styles.price, { color: colors.primary }]}>{formatEventPrice(event)}</AppText>
      </View>

      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} style={styles.infoIcon} />
        <View style={styles.infoText}>
          <AppText style={[styles.infoMain, { color: colors.text }]}>{event.date || 'Not scheduled'}</AppText>
          <AppText style={[styles.infoSub, { color: colors.muted }]}>{event.time}</AppText>
        </View>
        <Pressable
          onPress={handleAddToCalendar}
          disabled={openingCalendar || cancelled || archived || isDraft || !event.startsAt}
          style={[styles.mapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="calendar" size={14} color={colors.primary} />
          <AppText style={[styles.mapButtonText, { color: colors.primary }]}>{openingCalendar ? 'Opening...' : 'Add to Calendar'}</AppText>
        </Pressable>
      </View>
      <FieldError message={calendarError} />

      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Ionicons name="location-outline" size={20} color={colors.primary} style={styles.infoIcon} />
        <View style={styles.infoText}>
          <AppText style={[styles.infoMain, { color: colors.text }]}>{event.venue}</AppText>
          <AppText style={[styles.infoSub, { color: colors.muted }]}>{event.address || event.location}</AppText>
        </View>
        <Pressable
          onPress={handleOpenMaps}
          disabled={openingMap || !event.address}
          style={[styles.mapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="navigate-outline" size={13} color={colors.primary} />
          <AppText style={[styles.mapButtonText, { color: colors.primary }]}>{openingMap ? 'Opening...' : 'Map'}</AppText>
        </Pressable>
      </View>
      <FieldError message={mapError} />

      {/* Host Action Control */}
      {!readOnly && <Pressable
        onPress={onEditEvent}
        disabled={changing || refreshing}
        style={[styles.editButton, { backgroundColor: colors.primary }]}>
        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
        <AppText style={styles.editButtonText}>{isDraft ? 'Edit Draft / Publish' : 'Edit Event Details'}</AppText>
      </Pressable>}
      {hasEnded && !cancelled && !archived && !isDraft && <AppButton title="Reschedule as New Event" onPress={onRescheduleEvent}
        style={{ marginTop: 16, marginBottom: 12 }} disabled={refreshing} />}
      {!readOnly && !isDraft && <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <AppButton title={changing ? 'Updating...' : 'Archive Event'} variant="secondary" onPress={() => confirmLifecycle('archive')} disabled={changing || refreshing} style={{ flex: 1 }} />
        <AppButton title="Cancel Event" variant="secondary" onPress={() => confirmLifecycle('cancel')} disabled={changing || refreshing} style={{ flex: 1 }} />
      </View>}
      <FieldError message={actionError} />
      {cancelled && <AppText accessibilityRole="alert" color={colors.muted}>
        This event has been cancelled.{event.cancellationReason ? ' ' + event.cancellationReason : ''}
      </AppText>}
      {archived && <AppText color={colors.muted}>This event is archived and registration is closed.{event.archiveReason ? ' ' + event.archiveReason : ''}</AppText>}

      {hasEnded && !isDraft && !cancelled && !archived && <EventRatingSummary eventId={event.id} refreshKey={ratingRefreshKey} />}
      <AppText style={[styles.section, { color: colors.text }]}>About event</AppText>
      <AppText style={[styles.description, { color: colors.muted }]}>{event.description}</AppText>
      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="gallery" getImageHeaders={uri => eventPhotoHeaders(uri, isDraft)} />

      {/* Direct In-App Friend Invites */}
      <InviteFriendsModal
        visible={showInviteModal && !invitationsDisabled}
        eventId={event.id}
        eventTitle={event.title}
        onClose={() => setShowInviteModal(false)}
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
