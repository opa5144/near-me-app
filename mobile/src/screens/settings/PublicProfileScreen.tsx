import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AppText } from '../../components/AppText';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUserProfile } from '../../api/client';
import { fetchOrganizerFollows, followOrganizer, unfollowOrganizer } from '../../api/organizerFollows';
import { settingsErrorMessage } from '../../api/settings';
import { AppButton } from '../../components/AppButton';
import { FieldError } from '../../components/FieldError';

export function PublicProfileScreen({ publicUser, events, onOpenEvent, onSendFriendRequest, isFriend }: { publicUser: any; events: EventItem[]; onOpenEvent: (event: EventItem) => void; onSendFriendRequest?: (userId: string) => void; isFriend?: boolean }) {
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<'interested' | 'attended'>('interested');
  const [requestSent, setRequestSent] = useState(false);
  const userIdValue = publicUser?._id ?? publicUser?.id;
  const userId = typeof userIdValue === 'string' && /^[a-f0-9]{24}$/i.test(userIdValue) ? userIdValue.toLowerCase() : null;
  const [isSelf, setIsSelf] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(true);
  const [followSaving, setFollowSaving] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followAttempt, setFollowAttempt] = useState(0);
  const followVersion = useRef(0);
  const pendingFollow = useRef<Promise<boolean> | null>(null);

  // Load the current user's directed follows. Friendships remain a separate action.
  useFocusEffect(useCallback(() => {
    const version = ++followVersion.current;
    const controller = new AbortController();
    setFollowing(false); setIsSelf(false); setFollowLoading(true); setFollowError(null);
    async function load() {
      try {
        await pendingFollow.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        if (!userId) throw new Error('Unavailable user.');
        const [profile, follows] = await Promise.all([
          fetchUserProfile(controller.signal), fetchOrganizerFollows(controller.signal),
        ]);
        if (followVersion.current !== version || controller.signal.aborted) return;
        setIsSelf(String(profile.user._id).toLowerCase() === userId);
        setFollowing(follows.some(follow => follow.organizerId.toLowerCase() === userId && follow.active));
      } catch (error: unknown) {
        if (followVersion.current === version && !controller.signal.aborted) {
          setFollowError(settingsErrorMessage(error, 'Unable to load follow status. Please try again.'));
        }
      } finally {
        if (followVersion.current === version) { setFollowLoading(false); setFollowSaving(false); }
      }
    }
    void load();
    return () => { ++followVersion.current; controller.abort(); };
  }, [userId, followAttempt]));

  async function handleFollow() {
    if (!userId || isSelf || followLoading || followSaving || followError || pendingFollow.current) return;
    const version = followVersion.current;
    setFollowSaving(true); setFollowError(null);
    const request = following
      ? unfollowOrganizer(userId).then(() => false)
      : followOrganizer(userId).then(saved => saved.active);
    pendingFollow.current = request;
    try {
      const saved = await request;
      if (followVersion.current === version) setFollowing(saved);
    } catch (error: unknown) {
      if (followVersion.current === version) setFollowError(settingsErrorMessage(error, 'Unable to update this follow. Please try again.'));
    } finally {
      if (pendingFollow.current === request) pendingFollow.current = null;
      if (followVersion.current === version) setFollowSaving(false);
    }
  }

  const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

  const [avatarUri, setAvatarUri] = useState<string>(
    publicUser?.avatarUrl && publicUser.avatarUrl.trim() !== '' 
      ? publicUser.avatarUrl 
      : DEFAULT_AVATAR
  );

  useEffect(() => {
    if (publicUser?.avatarUrl && publicUser.avatarUrl.trim() !== '') {
      setAvatarUri(publicUser.avatarUrl);
    }
  }, [publicUser?.avatarUrl]);

  const displayName = `${publicUser?.firstName || ''} ${publicUser?.lastName || ''}`.trim() || publicUser?.username || 'User Profile';

  const today = new Date();
  const interestedEvents = events || [];
  // Compare the real end timestamp; event.date is a formatted display label.
  const attendedEvents = interestedEvents.filter(e => new Date(e.endsAt) < today);

  const handleFriendPress = () => {
    if (isFriend || requestSent) return;
    setRequestSent(true);
    if (onSendFriendRequest && publicUser?._id) {
      onSendFriendRequest(publicUser._id);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Public profile details and independent relationship actions. */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatarFrame, { borderColor: colors.border }]}>
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        </View>
        <AppText variant="headerMedium" style={styles.userName}>{displayName}</AppText>
        <AppText variant="bodyMedium" color={colors.muted} style={styles.userLocation}>{publicUser?.username ? `@${publicUser.username}` : 'Erie, United States'}</AppText>
        
        {/* Friend Action Button */}
        <TouchableOpacity 
          style={[styles.friendBtn, { backgroundColor: isFriend ? colors.border : (requestSent ? colors.border : colors.primary) }]} 
          onPress={handleFriendPress}
          activeOpacity={0.8}
        >
          <Ionicons name={isFriend ? "checkmark-circle" : (requestSent ? "time-outline" : "person-add")} size={16} color="#FFF" />
          <AppText variant="bodyMedium" style={styles.friendBtnText}>
            {isFriend ? 'Friends' : (requestSent ? 'Request Sent' : 'Add Friend')}
          </AppText>
        </TouchableOpacity>
        {!isSelf && <View style={styles.followSection}>
          <AppButton title={followLoading ? 'Loading follow status...' : followSaving ? 'Saving...' : following ? 'Following · Unfollow' : 'Follow'}
            onPress={() => void handleFollow()} variant={following ? 'secondary' : 'primary'}
            disabled={!userId || followLoading || followSaving || Boolean(followError)} />
          <FieldError message={followError} />
          {followError && <AppButton title="Retry follow status" variant="quiet" onPress={() => setFollowAttempt(value => value + 1)} />}
          <AppText color={colors.muted} style={styles.followNote}>Follow to hear when this user hosts new events.</AppText>
        </View>}
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

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, flexGrow: 1 },
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 94, height: 94, borderRadius: 47 },
  avatarFrame: { borderWidth: 2, borderRadius: 51, padding: 3, marginBottom: 12 },
  userName: { fontWeight: '900', marginBottom: 4, letterSpacing: 0.2 },
  userLocation: { fontWeight: '500', marginBottom: 12 },
  friendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  friendBtnText: { color: '#FFF', fontWeight: '700' },
  followSection: { alignSelf: 'stretch', marginTop: 12, gap: 6 },
  followNote: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 20, gap: 32 },
  tabButton: { paddingBottom: 12, position: 'relative' },
  activeTabText: { fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabText: { fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  section: { fontWeight: '800' },
  empty: { lineHeight: 19, marginTop: 12 },
});
