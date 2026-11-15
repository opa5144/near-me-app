import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { PhotoCollection } from '../../components/PhotoCollection';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfileScreen } from '../settings/PublicProfileScreen'; 
import { fetchUserProfile } from '../../api/client';
import { fetchFriendsNetwork } from '../../api/friends';
import type { FriendsNetworkResponse } from '../../api/friends';
import { FieldError } from '../../components/FieldError';
import { openEventMaps } from '../../utils/eventMaps';
import { EventRatingForm } from '../../components/EventRatingForm';
import { FriendAvatarStack } from '../../components/FriendAvatarStack';
import { InviteFriendsModal } from '../../components/InviteFriendsModal';
import { FriendshipStatus } from '../../components/FriendActionButton';
import { addEventToCalendar } from '../../utils/eventCalendar';
import { formatEventPrice } from '../../utils/eventPrice';

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
  const [mapError, setMapError] = useState<string | null>(null);
  const [openingMap, setOpeningMap] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [openingCalendar, setOpeningCalendar] = useState(false);
  const [friendNetworkError, setFriendNetworkError] = useState<string | null>(null);
  const friendRequest = useRef<AbortController | null>(null);
  const friendRequestVersion = useRef(0);

  // Store full friend network so host relationship is ready before opening modal
  const [friendNetwork, setFriendNetwork] = useState<FriendsNetworkResponse>({
    friends: [],
    pendingRequests: [],
    sentRequests: [],
  });
  
  // A screen left open becomes read-only as soon as the saved end time passes.
  const [hasEnded, setHasEnded] = useState(() => {
    const end = Date.parse(event.endsAt);
    return !Number.isFinite(end) || end <= Date.now();
  });
  const [registrationClosed, setRegistrationClosed] = useState(() => Date.parse(event.registrationClosesAt || event.startsAt) <= Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkEnd = () => {
      const remaining = Date.parse(event.endsAt) - Date.now();
      const untilClosing = Date.parse(event.registrationClosesAt || event.startsAt) - Date.now();
      setHasEnded(!Number.isFinite(remaining) || remaining <= 0);
      setRegistrationClosed(!Number.isFinite(untilClosing) || untilClosing <= 0);
      if (remaining > 0) timer = setTimeout(checkEnd, Math.min(remaining, untilClosing > 0 ? untilClosing : 60000, 60000));
    };
    checkEnd();
    return () => { if (timer) clearTimeout(timer); };
  }, [event.endsAt, event.startsAt, event.registrationClosesAt]);
  const cancelled = event.status === 'cancelled';
  const selectionDisabled = cancelled || hasEnded || !selectionsReady || selectionsLoading || selectionSaving;
  const invitationsDisabled = cancelled || hasEnded || registrationClosed;

  // Fetch friends, incoming requests, and sent requests on mount
  const loadFriendNetwork = useCallback(() => {
    friendRequest.current?.abort();
    const controller = new AbortController();
    friendRequest.current = controller;
    const version = ++friendRequestVersion.current;
    setFriendNetworkError(null);
    void fetchFriendsNetwork(controller.signal)
      .then(res => {
        if (controller.signal.aborted || version !== friendRequestVersion.current) return;
        setFriendNetwork({
          friends: res.friends || [],
          pendingRequests: res.pendingRequests || [],
          sentRequests: res.sentRequests || [],
        });
      })
      .catch(() => {
        if (!controller.signal.aborted && version === friendRequestVersion.current) {
          setFriendNetworkError('Unable to load friendship status. Please try again.');
        }
      });
  }, []);

  useEffect(() => {
    loadFriendNetwork();
    return () => { ++friendRequestVersion.current; friendRequest.current?.abort(); };
  }, [event.id, loadFriendNetwork]);

  useEffect(() => { if (invitationsDisabled) setShowInviteModal(false); }, [invitationsDisabled]);

  // Modal state for viewing host profile popup
  const [showHostModal, setShowHostModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileAttempt, setProfileAttempt] = useState(0);

  // Fetch current user ID on mount to check if the host is yourself
  useEffect(() => {
    const controller = new AbortController();
    setProfileError(null);
    void fetchUserProfile(controller.signal)
      .then(res => {
        if (controller.signal.aborted) return;
        setCurrentUserId(res.user._id);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfileError('Unable to load your profile. Please try again.');
      });
    return () => controller.abort();
  }, [profileAttempt]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${event.title} event on NearMe! Happening at ${event.venue} on ${event.date} at ${event.time}.`,
      });
    } catch {
      Alert.alert('Unable to share', 'The event could not be shared. Please try again.');
    }
  };

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

  const hostUserId = (event.hostId as any)?._id || (event.hostId as any)?.id || event.hostId;

  // Compute exact relationship status with the host before opening the modal
  const getHostRelationship = (): {
    status: FriendshipStatus;
    requestId?: string;
    isFriend: boolean;
  } => {
    if (!hostUserId) return { status: 'none', isFriend: false };
    const targetId = String(hostUserId);

    const matchedFriend = friendNetwork.friends.find(f => String(f.id) === targetId);
    if (matchedFriend) {
      return { status: 'accepted', isFriend: true };
    }

    const matchedReceived = friendNetwork.pendingRequests.find(r => String(r.id) === targetId);
    if (matchedReceived) {
      return {
        status: 'pending_received',
        requestId: matchedReceived.requestId,
        isFriend: false,
      };
    }

    const matchedSent = friendNetwork.sentRequests.find(s => String(s.id) === targetId);
    if (matchedSent) {
      return { status: 'pending_sent', isFriend: false };
    }

    return { status: 'none', isFriend: false };
  };

  const hostRelationship = getHostRelationship();

  // Handle host row click: If it's your own event, go straight to your profile tab. Otherwise, open the modal.
  const handlePressHost = () => {
    if (currentUserId && hostUserId && String(currentUserId) === String(hostUserId)) {
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
        <View style={styles.topBarActions}>
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
        </View>
      </View>
      
      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="hero" />
      <View style={styles.categoryList}>
        {event.categories.map(category => <AppText key={category} style={[styles.photoCategory, { color: colors.primary, borderColor: colors.primary }]}>{category.toUpperCase()}</AppText>)}
        <AppText style={{ color: colors.muted, fontSize: 11 }}>EVENT</AppText>
      </View>

      {/* Social Proof Avatar Stack */}
      <FriendAvatarStack friendsAttending={event.friendsAttending ?? []}
        onPress={invitationsDisabled ? undefined : () => setShowInviteModal(true)} />
      <FieldError message={friendNetworkError} />
      {friendNetworkError && <AppButton title="Retry friendship status" variant="quiet" onPress={loadFriendNetwork} />}

      <View style={styles.titleRow}>
        <AppText style={[styles.title, { color: colors.text }]}>{event.title}</AppText>
        <AppText style={[styles.price, { color: colors.primary }]}>{formatEventPrice(event)}</AppText>
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
      <FieldError message={profileError} />
      {profileError && <AppButton title="Retry profile" variant="quiet" onPress={() => setProfileAttempt(value => value + 1)} />}

      <View style={[styles.info, { borderBottomColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} style={styles.infoIcon} />
        <View style={styles.infoText}>
          <AppText style={[styles.infoMain, { color: colors.text }]}>{event.date}</AppText>
          <AppText style={[styles.infoSub, { color: colors.muted }]}>{event.time}</AppText>
        </View>
        <Pressable 
          onPress={handleAddToCalendar}
          disabled={openingCalendar || cancelled}
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
          disabled={openingMap}
          style={[styles.mapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="navigate-outline" size={13} color={colors.primary} />
          <AppText style={[styles.mapButtonText, { color: colors.primary }]}>{openingMap ? 'Opening...' : 'Map'}</AppText>
        </Pressable>
      </View>
      <FieldError message={mapError} />

      {selectionError && <View style={styles.selectionNotice}>
        <AppText accessibilityRole="alert" style={{ color: errorColor }}>{selectionError}</AppText>
        <AppButton title="Reload saved choices" variant="quiet" onPress={onRetrySelections} disabled={selectionsLoading || selectionSaving} />
      </View>}
      {selectionsLoading && <AppText style={[styles.selectionNotice, { color: colors.muted }]}>Loading your saved choices...</AppText>}
      {hasEnded && <AppText style={[styles.selectionNotice, { color: colors.muted }]}>This event has ended. Your saved choices are read-only.</AppText>}
      {!hasEnded && !cancelled && registrationClosed && <AppText style={[styles.selectionNotice, { color: colors.muted }]}>Registration for this event has closed.</AppText>}
      {cancelled && <AppText accessibilityRole="alert" style={[styles.selectionNotice, { color: errorColor }]}>
        This event has been cancelled.{event.cancellationReason ? ' ' + event.cancellationReason : ''}
      </AppText>}
      <View style={styles.selectionRow}>
        <AppButton title={interested ? 'Interested' : "I'm Interested"} onPress={onToggleInterested}
          disabled={selectionDisabled} variant={interested ? 'primary' : 'secondary'} style={styles.selectionButton}
          textStyle={styles.selectionButtonText} />
        <AppButton title={attending ? 'Attending' : "I'll Attend"}
          onPress={onToggleAttending} disabled={selectionDisabled || (!attending && registrationClosed)} variant={attending ? 'primary' : 'secondary'}
          style={styles.selectionButton} textStyle={styles.selectionButtonText} />
      </View>
      {selectionSaving && <AppText accessibilityLiveRegion="polite" style={{ color: colors.muted, marginBottom: 12 }}>Saving choices...</AppText>}
      {hasEnded && attending && !cancelled && currentUserId && currentUserId !== hostUserId && <EventRatingForm eventId={event.id} />}
      
      <AppText style={[styles.section, { color: colors.text }]}>About Event</AppText>
      <AppText style={[styles.description, { color: colors.muted }]}>{event.description}</AppText>
      <PhotoCollection photos={event.photos ?? []} fallbackUri={event.bannerImage} title={event.title}
        emoji={event.emoji} accent={event.accent} mode="gallery" />

      {/* --- HOST PROFILE POPUP MODAL (Only opens for other users) --- */}
      <Modal
        visible={showHostModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowHostModal(false);
          loadFriendNetwork(); // Refresh network state when closing modal
        }}
      >
        <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText style={[styles.modalTitle, { color: colors.text }]}>Host Profile</AppText>
            <TouchableOpacity
              onPress={() => {
                setShowHostModal(false);
                loadFriendNetwork();
              }}
              style={styles.closeBtn}
            >
              <Ionicons name="close-circle" size={28} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <PublicProfileScreen
            publicUser={event.hostId}
            events={[]}
            initialFriendshipStatus={hostRelationship.status}
            pendingRequestId={hostRelationship.requestId}
            isFriend={hostRelationship.isFriend}
            onOpenEvent={(e) => {
              setShowHostModal(false);
              if (navigation) navigation.navigate('EventDetails', { eventId: e.id });
            }}
          />
        </View>
      </Modal>

      {/* --- IN-APP FRIEND INVITES MODAL --- */}
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
  selectionRow: { flexDirection: 'row', gap: 10, marginTop: 17, marginBottom: 22 },
  selectionButton: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  selectionButtonText: { fontSize: 13, textAlign: 'center' },
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
