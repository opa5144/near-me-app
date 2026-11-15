import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Share, TouchableOpacity, StyleSheet, Image, ScrollView, Modal, FlatList, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { useUserData } from '../../context/UserDataContext';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { updateUserAvatar } from '../../api/client';
import { respondToFriendRequest } from '../../api/friends';
import type { FriendItem } from '../../api/friends';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import type { NotificationAction } from '../../api/notifications';
import { NotificationInbox } from '../../components/NotificationInbox';
import { useNotifications } from '../../context/NotificationsContext';
import { AcceptRequestCard } from '../../components/AcceptRequestCard';
import { FieldError } from '../../components/FieldError';
import { settingsErrorMessage } from '../../api/settings';
import { formatCalendarDate } from '../../utils/dateFormat';
import { PublicProfileScreen } from './PublicProfileScreen';
import { useEvents } from '../../context/EventsContext';

export function UserProfileScreen({ navigation, events, onOpenEvent, onOpenNotificationAction }: {
  navigation: any; events: EventItem[]; onOpenEvent: (event: EventItem) => void;
  onOpenNotificationAction?: (action: NotificationAction) => void;
}) {
  const { colors, theme } = useTheme();
  const { unreadCount } = useNotifications();
  const { events: availableEvents } = useEvents();
  const attendedErrorColor = theme === 'dark' ? '#FF8A80' : '#C62828';

  const {
    user,
    setUser,
    friends,
    friendRequests,
    attendedBookings,
    profileLoading,
    profileError,
    friendsLoading: loadingFriends,
    friendsError,
    attendedLoading: loadingAttended,
    attendedError,
    refreshProfile,
    refreshFriends,
    refreshAttended,
    refreshAll,
  } = useUserData();

  const [activeTab, setActiveTab] = useState<'interested' | 'attended'>('interested');
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const pullPending = useRef(false);
  const avatarPending = useRef(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

  const [avatarUri, setAvatarUri] = useState<string>(DEFAULT_AVATAR);
  const [selectedFriend, setSelectedFriend] = useState<FriendItem | null>(null);

  useEffect(() => {
    const savedAvatar = user?.avatarUrl;
    if (savedAvatar && typeof savedAvatar === 'string' && savedAvatar.trim() !== '') {
      setAvatarUri(`${savedAvatar}?t=${Date.now()}`);
    } else {
      setAvatarUri(DEFAULT_AVATAR);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    void refreshProfile(); void refreshFriends();
  }, [refreshProfile, refreshFriends]));

  useFocusEffect(useCallback(() => {
    if (activeTab !== 'attended') return;
    void refreshAttended();
  }, [activeTab, refreshAttended]));

  const onPullToRefresh = async () => {
    if (pullPending.current) return;
    pullPending.current = true;
    setRefreshing(true);
    try { await refreshAll(); }
    finally { pullPending.current = false; if (mounted.current) setRefreshing(false); }
  };

  const handleRequestResponse = async (requestId: string, action: 'accept' | 'reject') => {
    // The card owns saving/error feedback and supplies the Friendship ID.
    // Let failures reach it; successful changes refresh both list and counts.
    await respondToFriendRequest(requestId, action);
    await refreshFriends(true);
  };

  const handlePickAvatar = async () => {
    if (avatarPending.current) return;
    avatarPending.current = true; setSavingAvatar(true);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mounted.current) return;
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access photos is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!mounted.current) return;
      if (!result.canceled && result.assets[0]?.uri) {
        setAvatarUri(result.assets[0].uri);
        const response = await updateUserAvatar(result.assets[0].uri);
        if (response && response.user) {
          setUser(response.user);
        }
      }
    } catch (error: unknown) {
      if (mounted.current) {
        setAvatarUri(user?.avatarUrl || DEFAULT_AVATAR);
        Alert.alert('Error Saving Avatar', settingsErrorMessage(error, 'Unable to save your photo. Please try again.'));
      }
    } finally { avatarPending.current = false; if (mounted.current) setSavingAvatar(false); }
  };

  const displayName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    : 'Profile';

  const bioText = typeof user?.bio === 'string' ? user.bio.trim() : '';
  const formattedDob = user?.dob ? formatCalendarDate(user.dob) : '';
  const interestedEvents = events || [];

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [friendsSubTab, setFriendsSubTab] = useState<'friends' | 'requests'>('friends');
  const [inboxSubTab, setInboxSubTab] = useState<'notifications' | 'messages'>('notifications');

  const accentTint = theme === 'dark' ? 'rgba(105, 240, 174, 0.10)' : 'rgba(27, 135, 63, 0.08)';
  useEffect(() => {
    if (showFriendsModal) void refreshFriends(true);
  }, [showFriendsModal, refreshFriends]);
  const closeFriendProfile = () => { setSelectedFriend(null); void refreshFriends(true); };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} tintColor={colors.primary} />
      }
    >

      {/* Top Private Actions Row */}
      <View style={styles.topActionsRow}>
        <TouchableOpacity style={[styles.topIconButton, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8} onPress={() => navigation.navigate('Account')}>
          <Ionicons name="create-outline" size={16} color={colors.text} style={styles.editIcon} />
          <AppText variant="bodyMedium" style={styles.topIconText}>Edit</AppText>
        </TouchableOpacity>
        <View style={styles.rightActionIcons}>
          <TouchableOpacity
            style={[styles.topIconButtonCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={19} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topIconButtonCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.8}
            onPress={async () => {
              try {
                const profileId = user?.username || 'me';
                const developmentUrl = `exp://75.102.74.154:8081/--/profile/${profileId}`;
                await Share.share({ message: `Check out this profile on NearMe: ${developmentUrl}` });
              } catch (error: any) {
                console.error(error.message);
              }
            }}
          >
            <Ionicons name="share-outline" size={19} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <FieldError message={profileError} />
      {profileError && <AppButton title="Retry profile" variant="quiet" disabled={profileLoading} onPress={() => void refreshProfile(true)} />}
      {profileLoading && !user && <ActivityIndicator color={colors.primary} />}
      {/* Profile Avatar and Info */}
      <View style={styles.profileHeader}>
        <TouchableOpacity activeOpacity={0.8} onPress={handlePickAvatar} disabled={savingAvatar} style={[styles.avatarFrame, { borderColor: colors.border }]}>
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="camera" size={11} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <AppText variant="headerMedium" style={styles.userName}>{displayName}</AppText>

        {/* Username in Primary Color */}
        <AppText variant="bodyMedium" color={colors.primary} style={styles.userHandle}>
          {user?.username ? `@${user.username}` : '@member'}
        </AppText>

        {/* Wide Boxless Editorial Bio */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation.navigate('Account')}
          style={styles.bioSection}
        >
          {bioText ? (
            <View style={[styles.bioQuoteContainer, { borderLeftColor: colors.primary }]}>
              <AppText variant="bodyMedium" color={colors.text} style={styles.bioText}>
                {bioText}
              </AppText>
            </View>
          ) : (
            <View style={[styles.addBioPill, { backgroundColor: accentTint }]}>
              <Ionicons name="sparkles" size={13} color={colors.primary} />
              <AppText style={[styles.addBioText, { color: colors.primary }]}>
                Add a short bio to introduce yourself
              </AppText>
            </View>
          )}
        </TouchableOpacity>

        {/* Modern Inline Metadata Pills */}
        <View style={styles.metaPillsRow}>
          {formattedDob ? (
            <View style={styles.metaPill}>
              <Ionicons name="gift-outline" size={13} color={colors.primary} />
              <AppText style={[styles.metaPillText, { color: colors.muted }]}>Born {formattedDob}</AppText>
            </View>
          ) : null}
        </View>
      </View>

      {/* Private Dashboard Cards */}
      <View style={styles.tripleCardRow}>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('Tickets')}>
          <Ionicons name="ticket-outline" size={26} color={colors.primary} />
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Tickets</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => setShowFriendsModal(true)}>
          <Ionicons name="people-outline" size={26} color={colors.primary} />
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Friends ({friends.length})</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => setShowInboxModal(true)}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.primary} />
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Inbox{unreadCount > 0 ? ` · ${unreadCount > 99 ? '99+' : unreadCount}` : ''}</AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.bannerContainer}>
        <AppButton title="+  Create Event" onPress={() => navigation.navigate('CreateEvent')} />
      </View>

      {/* Tabs Row */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.tabButton} activeOpacity={0.8} onPress={() => setActiveTab('interested')}>
          <AppText variant="bodyLarge" color={activeTab === 'interested' ? colors.text : colors.muted} style={activeTab === 'interested' ? styles.activeTabText : styles.inactiveTabText}>Interested Events</AppText>
          {activeTab === 'interested' && <View style={[styles.activeIndicator, { backgroundColor: colors.text }]} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} activeOpacity={0.8} onPress={() => setActiveTab('attended')}>
          <AppText variant="bodyLarge" color={activeTab === 'attended' ? colors.text : colors.muted} style={activeTab === 'attended' ? styles.activeTabText : styles.inactiveTabText}>Attended Events</AppText>
          {activeTab === 'attended' && <View style={[styles.activeIndicator, { backgroundColor: colors.text }]} />}
        </TouchableOpacity>
      </View>

      {/* Tab Content Section */}
      {activeTab === 'interested' ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="heart" size={16} color="#E53935" />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>
              Interested · {interestedEvents.length} events
            </AppText>
          </View>
          {interestedEvents.length ? interestedEvents.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>No saved events yet.</AppText>}
        </>
      ) : (
        <>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="checkmark-done-circle" size={16} color={colors.primary} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>
              {loadingAttended || attendedError ? 'Attended events' : 'Attended - ' + attendedBookings.length + ' events'}
            </AppText>
          </View>
          {loadingAttended ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : attendedError ? (
            <>
              <AppText accessibilityRole="alert" color={attendedErrorColor} style={styles.empty}>{attendedError}</AppText>
              <AppButton title="Retry attended events" variant="quiet" onPress={() => void refreshAttended(true)} />
            </>
          ) : attendedBookings.length ? attendedBookings.map(booking => (
            <EventCard key={booking.id} event={booking.event} horizontal
              onPress={() => navigation.navigate('BookingHistoryDetails', { bookingId: booking.id })} />
          )) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>No attended events yet.</AppText>}
        </>
      )}

      {/* Friends Hub Modal */}
      <Modal visible={showFriendsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFriendsModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText variant="headerMedium" style={{ color: colors.text, fontWeight: '900' }}>Friends Hub</AppText>
            <TouchableOpacity onPress={() => setShowFriendsModal(false)}>
              <Ionicons name="close-circle" size={26} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.inviteBanner, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Share.share({ message: 'Join me on NearMe!' })}>
            <Ionicons name="person-add" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText style={{ fontWeight: '800', color: colors.text, fontSize: 13 }}>Invite Friends to NearMe</AppText>
              <AppText style={{ fontSize: 11, color: colors.muted }}>Share your invite link with friends</AppText>
            </View>
            <Ionicons name="share-outline" size={16} color={colors.primary} />
          </TouchableOpacity>

          <View style={[styles.modalSubTabs, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setFriendsSubTab('friends')} style={[styles.subTab, friendsSubTab === 'friends' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
              <AppText style={{ fontWeight: '800', color: friendsSubTab === 'friends' ? colors.primary : colors.muted }}>My Friends ({friends.length})</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFriendsSubTab('requests')} style={[styles.subTab, friendsSubTab === 'requests' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
              <AppText style={{ fontWeight: '800', color: friendsSubTab === 'requests' ? colors.primary : colors.muted }}>Friend Requests ({friendRequests.length})</AppText>
            </TouchableOpacity>
          </View>

          <FieldError message={friendsError} />
          {friendsError && <AppButton title="Retry friends and requests" variant="quiet"
            onPress={() => void refreshFriends(true)} disabled={loadingFriends} />}
          {loadingFriends ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          ) : friendsSubTab === 'friends' ? (
            <FlatList
              data={friends}
              keyExtractor={item => item.id}
              ListEmptyComponent={<AppText style={{ textAlign: 'center', color: colors.muted, marginTop: 20 }}>No friends added yet.</AppText>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedFriend(item)}
                  style={[styles.modalItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{item.name}</AppText>
                    <AppText style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>@{item.username}</AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </TouchableOpacity>
              )}
            />
          ) : (
            <FlatList
              data={friendRequests}
              keyExtractor={item => item.requestId}
              ListEmptyComponent={<AppText style={{ textAlign: 'center', color: colors.muted, marginTop: 20 }}>No pending friend requests.</AppText>}
              renderItem={({ item }) => (
                <AcceptRequestCard
                  item={item}
                  colors={colors}
                  onAccept={(reqId) => handleRequestResponse(reqId, 'accept')}
                  onReject={(reqId) => handleRequestResponse(reqId, 'reject')}
                />
              )}
            />
          )}
        </View>
      </Modal>

      {/* Friend Public Profile Popup Modal */}
      <Modal
        visible={!!selectedFriend}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeFriendProfile}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingTop: 16 }]}>
          <View style={styles.modalHeader}>
            <AppText variant="headerMedium" style={{ color: colors.text, fontWeight: '900' }}>Friend Profile</AppText>
            <TouchableOpacity onPress={closeFriendProfile}>
              <Ionicons name="close-circle" size={28} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {selectedFriend && (
            <PublicProfileScreen
              publicUser={selectedFriend}
              events={availableEvents}
              onOpenEvent={(e) => {
                setSelectedFriend(null);
                setShowFriendsModal(false);
                onOpenEvent(e);
              }}
              initialFriendshipStatus="accepted"
              isFriend={true}
            />
          )}
        </View>
      </Modal>

      {/* Inbox Modal */}
      <Modal visible={showInboxModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowInboxModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText variant="headerMedium" style={{ color: colors.text, fontWeight: '900' }}>Inbox</AppText>
            <TouchableOpacity onPress={() => setShowInboxModal(false)}>
              <Ionicons name="close-circle" size={26} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.modalSubTabs, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setInboxSubTab('notifications')} style={[styles.subTab, inboxSubTab === 'notifications' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
              <AppText style={{ fontWeight: '800', color: inboxSubTab === 'notifications' ? colors.primary : colors.muted }}>Notifications</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setInboxSubTab('messages')} style={[styles.subTab, inboxSubTab === 'messages' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
              <AppText style={{ fontWeight: '800', color: inboxSubTab === 'messages' ? colors.primary : colors.muted }}>Messages</AppText>
            </TouchableOpacity>
          </View>

          {inboxSubTab === 'notifications' ? (
            <NotificationInbox onOpenAction={action => {
              setShowInboxModal(false);
              if (onOpenNotificationAction) onOpenNotificationAction(action);
              else navigation.navigate(action.type === 'RATE_EVENT' ? 'RateEvent' : 'EventDetails', { eventId: action.eventId });
            }} />
          ) : (
            <View style={{ flex: 1 }}>
              <AppText style={{ color: colors.muted, fontSize: 12 }}>Messaging is not connected yet.</AppText>
            </View>
          )}
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, flexGrow: 1 },
  topActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  topIconButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editIcon: { marginRight: 2 },
  rightActionIcons: { flexDirection: 'row', gap: 10 },
  topIconButtonCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topIconText: { fontWeight: '700' },
  profileHeader: { alignItems: 'center', marginBottom: 20 },
  avatarImage: { width: 94, height: 94, borderRadius: 47 },
  avatarFrame: { borderWidth: 2, borderRadius: 51, padding: 3, marginBottom: 12, position: 'relative' },
  cameraBadge: { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  userName: { fontWeight: '900', marginBottom: 2, letterSpacing: 0.2 },
  userHandle: { fontWeight: '700', marginBottom: 10 },
  bioSection: { width: '100%', alignItems: 'center', marginBottom: 12 },
  bioQuoteContainer: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 2, width: '100%' },
  bioText: { lineHeight: 19, fontSize: 13 },
  addBioPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  addBioText: { fontSize: 12, fontWeight: '700' },
  metaPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaPillText: { fontSize: 12, fontWeight: '600' },
  tripleCardRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  miniCard: { flex: 1, height: 105, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  miniCardTitle: { fontWeight: '800' },
  bannerContainer: { marginBottom: 28 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 20, gap: 32 },
  tabButton: { paddingBottom: 12, position: 'relative' },
  activeTabText: { fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabText: { fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  section: { fontWeight: '800' },
  empty: { lineHeight: 19, marginTop: 12 },
  modalContainer: { flex: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  inviteBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, gap: 12, marginBottom: 16 },
  modalSubTabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
  subTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  modalItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10, gap: 10 },
  friendAvatar: { width: 42, height: 42, borderRadius: 21 },
  modalActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
});
