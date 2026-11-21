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
import { FriendActionButton } from '../../components/FriendActionButton';
import { fetchFriendsNetwork, friendshipFromNetwork } from '../../api/friends';
import type { FriendshipStatus } from '../../api/friends';
import { formatCalendarDate } from '../../utils/dateFormat';

const DEFAULT_AVATAR =
  'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

function resolveUserAvatar(user: any): string {
  if (!user) return DEFAULT_AVATAR;

  const possibleUrl =
    user.avatarUrl ||
    user.avatar ||
    user.profilePicture ||
    user.picture ||
    user.photo ||
    (typeof user.hostId === 'object'
      ? user.hostId?.avatarUrl || user.hostId?.avatar || user.hostId?.profilePicture
      : null);

  if (typeof possibleUrl === 'string' && possibleUrl.trim() !== '') {
    return possibleUrl.trim();
  }

  return DEFAULT_AVATAR;
}

export function PublicProfileScreen({
  publicUser,
  events,
  onOpenEvent,
  initialFriendshipStatus,
  pendingRequestId,
  isFriend,
  embedded = false,
}: {
  publicUser: any;
  events: EventItem[];
  onOpenEvent: (event: EventItem) => void;
  initialFriendshipStatus?: FriendshipStatus;
  pendingRequestId?: string;
  isFriend?: boolean;
  embedded?: boolean;
}) {
  const { colors, theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'hosting' | 'interested' | 'attended'>('hosting');
  const userIdValue = publicUser?._id ?? publicUser?.id ?? (typeof publicUser?.hostId === 'object' ? publicUser.hostId?._id ?? publicUser.hostId?.id : publicUser?.hostId);
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

  const [avatarUri, setAvatarUri] = useState<string>(() => resolveUserAvatar(publicUser));

  const targetUserId = userId ?? '';

  // Live relationship status state
  const [resolvedStatus, setResolvedStatus] = useState<FriendshipStatus>(
    initialFriendshipStatus ?? (isFriend ? 'accepted' : 'none')
  );
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(pendingRequestId);
  const [relationshipLoading, setRelationshipLoading] = useState(true);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [relationshipAttempt, setRelationshipAttempt] = useState(0);

  // Sync avatar whenever publicUser updates
  useEffect(() => {
    setAvatarUri(resolveUserAvatar(publicUser));
  }, [publicUser]);

  // Re-read actual friendship state on each visit, independently of follows.
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    setResolvedStatus(initialFriendshipStatus ?? (isFriend ? 'accepted' : 'none'));
    setActiveRequestId(pendingRequestId);
    setRelationshipLoading(true); setRelationshipError(null);
    const checkStatus = async () => {
      try {
        if (!userId) throw new Error('Unavailable user.');
        const network = await fetchFriendsNetwork(controller.signal);
        if (!active || controller.signal.aborted) return;
        const relationship = friendshipFromNetwork(network, userId);
        setResolvedStatus(relationship.status); setActiveRequestId(relationship.requestId);
        const friend = network.friends.find(item => item.id.toLowerCase() === userId);
        if (friend && resolveUserAvatar(friend) !== DEFAULT_AVATAR) setAvatarUri(resolveUserAvatar(friend));
      } catch (reason: unknown) {
        if (active && !controller.signal.aborted) setRelationshipError(settingsErrorMessage(reason, 'Unable to load friendship status. Please try again.'));
      } finally {
        if (active) setRelationshipLoading(false);
      }
    };
    void checkStatus();
    return () => { active = false; controller.abort(); };
  }, [userId, initialFriendshipStatus, pendingRequestId, isFriend, relationshipAttempt]));

  const displayName =
    `${publicUser?.firstName || ''} ${publicUser?.lastName || ''}`.trim() ||
    publicUser?.name ||
    publicUser?.username ||
    'User Profile';

  const bioText = typeof publicUser?.bio === 'string' ? publicUser.bio.trim() : '';
  const formattedDob = publicUser?.dob ? formatCalendarDate(publicUser.dob) : '';
  const locationText =
    typeof publicUser?.location === 'string' && publicUser.location.trim()
      ? publicUser.location.trim()
      : '';

  const today = new Date();
  // Host IDs are authoritative; matching a display name can attribute somebody
  // else's events to this user after a rename or when the profile is sparse.
  const allHostedEvents = (events || []).filter(event => {
    const hostId = typeof event.hostId === 'string' ? event.hostId : event.hostId?._id;
    return Boolean(targetUserId && hostId?.toLowerCase() === targetUserId);
  });

  // Currently hosting (active/upcoming events)
  const currentlyHostingEvents = allHostedEvents.filter(event =>
    event.status !== 'cancelled' && Number.isFinite(Date.parse(event.endsAt)) && new Date(event.endsAt) >= today);

  // The global event list does not identify this user's personal selections.
  // Display only explicit shared IDs when supplied, never infer them from dates.
  const sharedIds = (value: unknown) => new Set(Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string') : []);
  const interestedIds = sharedIds(publicUser?.interestedEventIds);
  const attendedIds = sharedIds(publicUser?.attendedEventIds);
  const interestedEvents = (events || []).filter(event => interestedIds.has(event.id));
  const attendedEvents = (events || []).filter(event => attendedIds.has(event.id) && new Date(event.endsAt) < today);
  const totalHostedEvents = allHostedEvents.length;
  const totalAttendees = allHostedEvents.reduce((sum, event) =>
    sum + (typeof event.attendingCount === 'number' && Number.isFinite(event.attendingCount) ? Math.max(0, event.attendingCount) : 0), 0);

  const highlightColor = theme === 'dark' ? '#69F0AE' : '#1B873F';

  return (
    <ScrollView
      contentContainerStyle={[styles.container, embedded && styles.embeddedContainer, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Read-Only Profile Header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatarFrame, { borderColor: colors.primary }]}>
          <Image
            source={{ uri: avatarUri }}
            style={styles.avatarImage}
            onError={() => setAvatarUri(DEFAULT_AVATAR)}
          />
        </View>
        <AppText variant="headerMedium" style={styles.userName}>
          {displayName}
        </AppText>

        {/* Username in Primary Color */}
        <AppText variant="bodyMedium" color={colors.primary} style={styles.userHandle}>
          {publicUser?.username ? `@${publicUser.username}` : '@member'}
        </AppText>

        {/* Wide Boxless Editorial Bio */}
        {bioText ? (
          <View style={styles.bioSection}>
            <View style={[styles.bioQuoteContainer, { borderLeftColor: colors.primary }]}>
              <AppText variant="bodyMedium" color={colors.text} style={styles.bioText}>
                {bioText}
              </AppText>
            </View>
          </View>
        ) : null}

        {/* Modern Inline Metadata Pills */}
        <View style={styles.metaPillsRow}>
          {locationText ? <View style={styles.metaPill}>
            <Ionicons name="location-sharp" size={13} color={colors.primary} />
            <AppText style={[styles.metaPillText, { color: colors.muted }]}>{locationText}</AppText>
          </View> : null}

          {formattedDob ? (
            <View style={styles.metaPill}>
              <Ionicons name="gift-outline" size={13} color={colors.primary} />
              <AppText style={[styles.metaPillText, { color: colors.muted }]}>Born {formattedDob}</AppText>
            </View>
          ) : null}
        </View>
        {!isSelf && userId && <View style={styles.friendActionContainer}>
          <FriendActionButton targetUserId={userId} initialStatus={resolvedStatus} requestId={activeRequestId}
            disabled={relationshipLoading || Boolean(relationshipError) || followLoading}
            onStatusChange={(next, nextRequestId) => { setResolvedStatus(next); setActiveRequestId(nextRequestId); }} />
          {relationshipLoading && <AppText color={colors.muted} style={styles.followNote}>Loading friendship status...</AppText>}
          <FieldError message={relationshipError} />
          {relationshipError && <AppButton title="Retry friendship status" variant="quiet"
            onPress={() => setRelationshipAttempt(value => value + 1)} />}
        </View>}
        {!isSelf && <View style={styles.followSection}>
          <AppButton title={followLoading ? 'Loading follow status...' : followSaving ? 'Saving...' : following ? 'Following · Unfollow' : 'Follow'}
            onPress={() => void handleFollow()} variant={following ? 'secondary' : 'primary'}
            disabled={!userId || followLoading || followSaving || Boolean(followError)} />
          <FieldError message={followError} />
          {followError && <AppButton title="Retry follow status" variant="quiet" onPress={() => setFollowAttempt(value => value + 1)} />}
          <AppText color={colors.muted} style={styles.followNote}>Follow to hear when this user hosts new events.</AppText>
        </View>}
      </View>

      {/* Host Impact Section */}
      <AppText variant="bodyLarge" style={[styles.sectionHeading, { color: colors.text }]}>
        Host Impact
      </AppText>
      <AppText color={colors.muted} style={styles.metricScope}>Based on hosted events shown in the app.</AppText>
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: highlightColor }]}>
            {totalHostedEvents}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>
            EVENTS HOSTED
          </AppText>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={[styles.valueToken, { color: colors.primary }]}>
            {totalAttendees.toLocaleString()}
          </AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>
            TOTAL ATTENDEES
          </AppText>
        </View>
      </View>

      {/* Tabs Row */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.tabButton} activeOpacity={0.8} onPress={() => setActiveTab('hosting')}>
          <AppText
            variant="bodyLarge"
            color={activeTab === 'hosting' ? colors.text : colors.muted}
            style={activeTab === 'hosting' ? styles.activeTabText : styles.inactiveTabText}
          >
            Hosting
          </AppText>
          {activeTab === 'hosting' && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} activeOpacity={0.8} onPress={() => setActiveTab('interested')}>
          <AppText
            variant="bodyLarge"
            color={activeTab === 'interested' ? colors.text : colors.muted}
            style={activeTab === 'interested' ? styles.activeTabText : styles.inactiveTabText}
          >
            Interested
          </AppText>
          {activeTab === 'interested' && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} activeOpacity={0.8} onPress={() => setActiveTab('attended')}>
          <AppText
            variant="bodyLarge"
            color={activeTab === 'attended' ? colors.text : colors.muted}
            style={activeTab === 'attended' ? styles.activeTabText : styles.inactiveTabText}
          >
            Attended
          </AppText>
          {activeTab === 'attended' && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
        </TouchableOpacity>
      </View>

      {/* Tab Content Section */}
      {activeTab === 'hosting' ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="calendar" size={16} color={colors.primary} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>
              Hosting · {currentlyHostingEvents.length} events
            </AppText>
          </View>
          {currentlyHostingEvents.length ? (
            currentlyHostingEvents.map((event: EventItem) => (
              <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />
            ))
          ) : (
            <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>
              Not currently hosting any events.
            </AppText>
          )}
        </>
      ) : activeTab === 'interested' ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="heart" size={16} color="#E53935" />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>
              Interested · {interestedEvents.length} events
            </AppText>
          </View>
          {interestedEvents.length ? (
            interestedEvents.map((event: EventItem) => (
              <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />
            ))
          ) : (
            <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>
              No shared interested events to show.
            </AppText>
          )}
        </>
      ) : (
        <>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="checkmark-done-circle" size={16} color={colors.primary} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>
              Attended · {attendedEvents.length} events
            </AppText>
          </View>
          {attendedEvents.length ? (
            attendedEvents.map((event: EventItem) => (
              <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />
            ))
          ) : (
            <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>
              No shared attended events to show.
            </AppText>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, flexGrow: 1 },
  // A modal already supplies the page gutter; do not inset its content twice.
  embeddedContainer: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 12 },
  profileHeader: { alignItems: 'center', marginBottom: 12 },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarFrame: { borderWidth: 2, borderRadius: 45, padding: 3, marginBottom: 8 },
  userName: { fontWeight: '900', marginBottom: 2, letterSpacing: 0.2 },
  userHandle: { fontWeight: '700', marginBottom: 6 },
  bioSection: { width: '100%', alignItems: 'center', marginBottom: 8 },
  bioQuoteContainer: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 2, width: '100%' },
  bioText: { lineHeight: 19, fontSize: 13 },
  metaPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaPillText: { fontSize: 12, fontWeight: '600' },
  friendActionContainer: { marginTop: 8, alignSelf: 'stretch' },
  followSection: { alignSelf: 'stretch', marginTop: 8, gap: 4 },
  followNote: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  sectionHeading: { fontWeight: '900', marginBottom: 6 },
  metricScope: { fontSize: 11, marginBottom: 6 },
  metricsGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  valueToken: { fontWeight: '900', fontSize: 18 },
  labelToken: { fontSize: 9, fontWeight: '800', marginTop: 4, textAlign: 'center', letterSpacing: 0.5 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 12 },
  tabButton: { flex: 1, alignItems: 'center', paddingBottom: 9, position: 'relative' },
  activeTabText: { fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabText: { fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  section: { fontWeight: '800' },
  empty: { lineHeight: 19, marginTop: 12 },
});
