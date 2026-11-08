import { useEffect, useState } from 'react';
import { View, Share, TouchableOpacity, StyleSheet, Image, ScrollView, Modal, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { fetchUserProfile, fetchFriendsNetwork, respondToFriendRequest, updateUserAvatar } from '../../api/client';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';

export function UserProfileScreen({ navigation, events, onOpenEvent }: { navigation: any; events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();

  // User state
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'interested' | 'attended'>('interested');

  const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

  // Local avatar state
  const [avatarUri, setAvatarUri] = useState<string>(DEFAULT_AVATAR);

  // Modals & Sub-tabs state
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [friendsSubTab, setFriendsSubTab] = useState<'friends' | 'requests'>('friends');
  const [inboxSubTab, setInboxSubTab] = useState<'notifications' | 'messages'>('notifications');

  const [friends, setFriends] = useState<any[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const [notifications] = useState([
    { id: '1', title: 'Event Reminder', body: 'Tech Meetup starts tomorrow at 6:00 PM.', time: '2h ago', icon: 'alarm-outline' },
    { id: '2', title: 'Host Update', body: 'Venue location updated for Jazz Night.', time: '1d ago', icon: 'information-circle-outline' },
  ]);
  const [directMessages] = useState([
    { id: '1', name: 'Sarah Jenkins', lastMessage: 'Are we heading to the concert together?', time: '10m ago', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330' },
  ]);

// Fetch logged-in user profile on mount
  useEffect(() => {
    fetchUserProfile()
      .then((res: any) => {
        const profileData = res?.user || res;
        console.log('--- DEBUG USER PROFILE DATA FROM SERVER ---', profileData); // 👈 Check your terminal log!
        
        setUser(profileData);
        
        const savedAvatar = profileData?.avatarUrl || profileData?.avatar || profileData?.profilePicture;
        if (savedAvatar && typeof savedAvatar === 'string' && savedAvatar.trim() !== '') {
          setAvatarUri(savedAvatar);
        } else {
          setAvatarUri(DEFAULT_AVATAR);
        }
      })
      .catch((err) => {
        console.log('Failed to fetch user profile:', err.message);
        setAvatarUri(DEFAULT_AVATAR);
      });
  }, []);

  // Fetch real friends & pending requests when modal opens
  const loadFriendsNetwork = async () => {
    try {
      setLoadingFriends(true);
      const data = await fetchFriendsNetwork();
      setFriends(data.friends || []);
      setFriendRequests(data.pendingRequests || []);
    } catch (error: any) {
      console.error('Error fetching friends network:', error.message);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    if (showFriendsModal) {
      loadFriendsNetwork();
    }
  }, [showFriendsModal]);

  const handleRequestResponse = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      await respondToFriendRequest(requestId, action);
      loadFriendsNetwork();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process request');
    }
  };

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
    if (!result.canceled && result.assets[0].uri) {
      const newUri = result.assets[0].uri;
      setAvatarUri(newUri); // Instant UI update

      try {
        const response = await updateUserAvatar(newUri);
        if (response && response.user && response.user.avatarUrl) {
          setAvatarUri(response.user.avatarUrl);
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        console.log('Avatar update error details:', error.response?.data || error.message);
        Alert.alert('Error Saving Avatar', errorMsg); 
      }
    }
  };

  const displayName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    : 'Profile';

  const today = new Date();
  const interestedEvents = events || [];
  const attendedEvents = interestedEvents.filter(e => new Date(e.date) < today);

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Top Private Actions Row */}
      <View style={styles.topActionsRow}>
        <TouchableOpacity style={[styles.topIconButton, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8} onPress={() => alert('Edit Profile')}>
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

      {/* Profile Avatar and Info */}
      <View style={styles.profileHeader}>
        <TouchableOpacity activeOpacity={0.8} onPress={handlePickAvatar} style={[styles.avatarFrame, { borderColor: colors.border }]}>
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="camera" size={11} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <AppText variant="headerMedium" style={styles.userName}>{displayName}</AppText>
        <AppText variant="bodyMedium" color={colors.muted} style={styles.userLocation}>{user?.username ? `@${user.username}` : 'Erie, United States'}</AppText>
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
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Inbox</AppText>
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
              Attended · {attendedEvents.length} events
            </AppText>
          </View>
          {attendedEvents.length ? attendedEvents.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>No attended events yet.</AppText>}
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
              <AppText style={{ fontWeight: '800', color: friendsSubTab === 'requests' ? colors.primary : colors.muted }}>Requests ({friendRequests.length})</AppText>
            </TouchableOpacity>
          </View>

          {loadingFriends ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          ) : friendsSubTab === 'friends' ? (
            <FlatList
              data={friends}
              keyExtractor={item => item.id}
              ListEmptyComponent={<AppText style={{ textAlign: 'center', color: colors.muted, marginTop: 20 }}>No friends added yet.</AppText>}
              renderItem={({ item }) => (
                <View style={[styles.modalItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: '800', color: colors.text }}>{item.name}</AppText>
                    <AppText style={{ fontSize: 11, color: colors.muted }}>@{item.username}</AppText>
                  </View>
                  <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}>
                    <AppText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Message</AppText>
                  </TouchableOpacity>
                </View>
              )}
            />
          ) : (
            <FlatList
              data={friendRequests}
              keyExtractor={item => item.requestId}
              ListEmptyComponent={<AppText style={{ textAlign: 'center', color: colors.muted, marginTop: 20 }}>No pending friend requests.</AppText>}
              renderItem={({ item }) => (
                <View style={[styles.modalItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: '800', color: colors.text }}>{item.name}</AppText>
                    <AppText style={{ fontSize: 11, color: colors.muted }}>@{item.username}</AppText>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => handleRequestResponse(item.requestId, 'accept')} style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}>
                      <AppText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Accept</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRequestResponse(item.requestId, 'reject')} style={[styles.modalActionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                      <AppText style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>Decline</AppText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
            <FlatList
              data={notifications}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[styles.modalItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name={item.icon as any} size={22} color={colors.primary} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <AppText style={{ fontWeight: '800', color: colors.text }}>{item.title}</AppText>
                      <AppText style={{ fontSize: 10, color: colors.muted }}>{item.time}</AppText>
                    </View>
                    <AppText style={{ fontSize: 12, color: colors.muted, lineHeight: 16 }}>{item.body}</AppText>
                  </View>
                </View>
              )}
            />
          ) : (
            <FlatList
              data={directMessages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[styles.modalItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <AppText style={{ fontWeight: '800', color: colors.text }}>{item.name}</AppText>
                      <AppText style={{ fontSize: 10, color: colors.muted }}>{item.time}</AppText>
                    </View>
                    <AppText style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{item.lastMessage}</AppText>
                  </View>
                </View>
              )}
            />
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
  userName: { fontWeight: '900', marginBottom: 4, letterSpacing: 0.2 },
  userLocation: { fontWeight: '500' },
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