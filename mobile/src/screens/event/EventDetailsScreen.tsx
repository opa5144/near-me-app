import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar/legacy';
import { EventItem } from '../../data/events';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { PhotoCollection } from '../../components/PhotoCollection';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfileScreen } from '../settings/PublicProfileScreen'; 
import { fetchUserProfile, fetchFriendsNetwork } from '../../api/client';
import { FieldError } from '../../components/FieldError';
import { openEventMaps } from '../../utils/eventMaps';
import { FriendAvatarStack } from '../../components/FriendAvatarStack';
import { InviteFriendsModal } from '../../components/InviteFriendsModal';
import { FriendItem } from '../../api/friends';
import { FriendshipStatus } from '../../components/FriendActionButton';

// Helper to format prices as whole dollars without decimals or cents
function formatWholeDollarPrice(price?: string | number | null): string {
  if (price === undefined || price === null) return 'Free';
  const raw = String(price).trim();
  if (!raw || raw.toLowerCase().includes('free')) return 'Free';
  const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Free';
  return `$${Math.round(numeric).toLocaleString()}`;
}

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
  onInviteFriend?: (friend: FriendItem, eventId: string) => Promise<void> | void;
};

export function EventDetailsScreen({ event, interested, attending, onToggleInterested, onToggleAttending,
  selectionsLoading, selectionsReady, selectionSaving, selectionError, onRetrySelections,
  onBack, navigation, onInviteFriend }: EventDetailsScreenProps) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [mapError, setMapError] = useState<string | null>(null);
  const [openingMap, setOpeningMap] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  // Store full friend network so host relationship is ready before opening modal
  const [friendNetwork, setFriendNetwork] = useState<{
    friends: FriendItem[];
    pendingRequests: any[];
    sentRequests: any[];
  }>({
    friends: [],
    pendingRequests: [],
    sentRequests: [],
  });
  
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

  // Fetch friends, incoming requests, and sent requests on mount
  const loadFriendNetwork = () => {
    fetchFriendsNetwork()
      .then((res: any) => {
        setFriendNetwork({
          friends: res.friends || [],
          pendingRequests: res.pendingRequests || [],
          sentRequests: res.sentRequests || [],
        });
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadFriendNetwork();
  }, [event.id]);

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
    if (openingMap) return;
    setMapError(null); setOpeningMap(true);
    try {
      await openEventMaps(event);
    } catch (reason) { setMapError(reason instanceof Error ? reason.message : 'Maps could not be opened. Please try again.'); }
    finally { setOpeningMap(false); }
  };

  const handleAddToCalendar = async () => {
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    const hasTimes = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime());
    const location = `${event.venue}, ${event.address || event.location}`;

    try {
      if (hasTimes) {
        await Calendar.createEventInCalendarAsync({
          title: event.title,
          notes: event.description,
          location,
          startDate: start,
          endDate: end,
        });
      } else {
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
      <FriendAvatarStack friendsAttending={friendNetwork.friends} onPress={() => setShowInviteModal(true)} />

      <View style={styles.titleRow}>
        <AppText style={[styles.title, { color: colors.text }]}>{event.title}</AppText>
        <AppText style={[styles.price, { color: colors.primary }]}>{formatWholeDollarPrice(event.price)}</AppText>
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
      <View style={styles.selectionRow}>
        <AppButton title={interested ? 'Interested' : "I'm Interested"} onPress={onToggleInterested}
          disabled={selectionDisabled} variant={interested ? 'primary' : 'secondary'} style={styles.selectionButton}
          textStyle={styles.selectionButtonText} />
        <AppButton title={attending ? 'Attending' : "I'll Attend"}
          onPress={onToggleAttending} disabled={selectionDisabled} variant={attending ? 'primary' : 'secondary'}
          style={styles.selectionButton} textStyle={styles.selectionButtonText} />
      </View>
      {selectionSaving && <AppText accessibilityLiveRegion="polite" style={{ color: colors.muted, marginBottom: 12 }}>Saving choices...</AppText>}
      
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