import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { EventItem } from '../../data/events';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { PhotoCollection } from '../../components/PhotoCollection';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';
import { useUserData } from '../../context/UserDataContext';
import { PublicProfileScreen } from '../settings/PublicProfileScreen';
import { friendshipFromNetwork } from '../../api/friends';
import { FieldError } from '../../components/FieldError';
import { openEventMaps } from '../../utils/eventMaps';
import { EventRatingForm } from '../../components/EventRatingForm';
import { FriendAvatarStack } from '../../components/FriendAvatarStack';
import { InviteFriendsModal } from '../../components/InviteFriendsModal';
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
  const { events: globalEvents } = useEvents();
  const { user: currentUserProfile, friends, friendRequests, sentRequests, profileError,
    friendsError: friendNetworkError, refreshProfile, refreshFriends } = useUserData();
  const friendNetwork = { friends, pendingRequests: friendRequests, sentRequests };
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [mapError, setMapError] = useState<string | null>(null);
  const [openingMap, setOpeningMap] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [openingCalendar, setOpeningCalendar] = useState(false);
  
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

  // Reuse the authenticated cache; explicit retries bypass its freshness window.
  const loadFriendNetwork = useCallback(() => {
    void refreshFriends(true);
  }, [refreshFriends]);
  useFocusEffect(useCallback(() => {
    void refreshProfile();
    void refreshFriends();
  }, [refreshProfile, refreshFriends]));

  useEffect(() => { if (invitationsDisabled) setShowInviteModal(false); }, [invitationsDisabled]);

  // Modal state for viewing host profile popup
  const [showHostModal, setShowHostModal] = useState(false);
  const closeHostModal = () => {
    setShowHostModal(false);
    // A request accepted/sent in the popup must update the host's relationship.
    void refreshFriends(true);
  };

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

  // Keep the host's immutable ID authoritative while filling sparse display data.
  const getResolvedHost = () => {
    const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';
    const hostRaw = event.hostId;
    if (!hostRaw) return { avatar: DEFAULT_AVATAR, username: 'member', _id: '' };

    const hostObj = typeof hostRaw === 'object' ? (hostRaw as any) : {};
    const hostIdStr = typeof hostRaw === 'object' ? String(hostObj._id || hostObj.id || '') : String(hostRaw);
    const hostUsername = hostObj.username;

    const currentUserId = currentUserProfile?._id;
    const isSelf = currentUserId && hostIdStr && String(currentUserId) === hostIdStr;

    // 1. If host is current user, pull from currentUserProfile
    if (isSelf && currentUserProfile) {
      const avatar = currentUserProfile.avatarUrl || DEFAULT_AVATAR;
      return {
        _id: hostIdStr,
        username: currentUserProfile.username || 'member',
        firstName: currentUserProfile.firstName,
        lastName: currentUserProfile.lastName,
        bio: currentUserProfile.bio,
        avatar,
        avatarUrl: avatar,
      };
    }

    // 2. Look for matching friend in network
    const matchedFriend = friendNetwork.friends.find(friend =>
      hostIdStr ? friend.id === hostIdStr : Boolean(hostUsername && friend.username.toLowerCase() === hostUsername.toLowerCase())
    );

    const resolvedAvatar =
      hostObj.avatarUrl ||
      hostObj.avatar ||
      hostObj.profilePicture ||
      hostObj.picture ||
      hostObj.photo ||
      matchedFriend?.avatar ||
      DEFAULT_AVATAR;

    const resolvedUsername = hostObj.username || matchedFriend?.username || 'member';
    const resolvedId = hostIdStr || (matchedFriend ? String(matchedFriend.id) : '');

    return {
      _id: resolvedId,
      username: resolvedUsername,
      firstName: hostObj.firstName,
      lastName: hostObj.lastName,
      name: matchedFriend?.name,
      bio: hostObj.bio,
      avatar: resolvedAvatar,
      avatarUrl: resolvedAvatar,
    };
  };

  const resolvedHost = getResolvedHost();
  const currentUserId = currentUserProfile?._id;
  const hostUserId = resolvedHost._id;

  const hostRelationship = friendshipFromNetwork(friendNetwork, hostUserId);

  // Handle host row click: If it's your own event, go straight to your profile tab. Otherwise, open the modal.
  const handlePressHost = () => {
    if (currentUserId && resolvedHost._id && String(currentUserId) === String(resolvedHost._id)) {
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
      {resolvedHost.username && (
        <Pressable
          onPress={handlePressHost}
          style={styles.hostInlineRow}
        >
          <Image
            source={{ uri: resolvedHost.avatar }}
            style={styles.hostInlineAvatar}
          />
          <AppText style={[styles.infoSub, { color: colors.muted, marginBottom: 0, fontWeight: '700' }]}>
            Hosted by @{resolvedHost.username}
          </AppText>
        </Pressable>
      )}
      <FieldError message={profileError} />
      {profileError && <AppButton title="Retry profile" variant="quiet" onPress={() => { void refreshProfile(true); }} />}

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

      {/* --- HOST PROFILE POPUP MODAL --- */}
      <Modal
        visible={showHostModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeHostModal}
      >
        <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText style={[styles.modalTitle, { color: colors.text }]}>Host Profile</AppText>
            <TouchableOpacity
              onPress={closeHostModal}
              style={styles.closeBtn}
            >
              <Ionicons name="close-circle" size={28} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <PublicProfileScreen
            publicUser={resolvedHost}
            events={globalEvents}
            initialFriendshipStatus={hostRelationship.status}
            pendingRequestId={hostRelationship.requestId}
            isFriend={hostRelationship.status === 'accepted'}
            onOpenEvent={(e) => {
              closeHostModal();
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
