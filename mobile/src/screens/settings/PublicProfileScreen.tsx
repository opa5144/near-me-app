import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AppText } from '../../components/AppText';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { FriendActionButton, FriendshipStatus } from '../../components/FriendActionButton';
import { fetchFriendsNetwork } from '../../api/friends';
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
}: {
  publicUser: any;
  events: EventItem[];
  onOpenEvent: (event: EventItem) => void;
  initialFriendshipStatus?: FriendshipStatus;
  pendingRequestId?: string;
  isFriend?: boolean;
}) {
  const { colors, theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'hosting' | 'interested' | 'attended'>('hosting');

  const [avatarUri, setAvatarUri] = useState<string>(() => resolveUserAvatar(publicUser));

  const targetUserId = publicUser?._id
    ? String(publicUser._id)
    : publicUser?.id
      ? String(publicUser.id)
      : typeof publicUser?.hostId === 'object'
        ? String(publicUser.hostId._id || publicUser.hostId.id || '')
        : String(publicUser?.hostId || '');

  // Live relationship status state
  const [resolvedStatus, setResolvedStatus] = useState<FriendshipStatus>(
    initialFriendshipStatus ?? (isFriend ? 'accepted' : 'none')
  );
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(pendingRequestId);

  // Sync avatar whenever publicUser updates
  useEffect(() => {
    setAvatarUri(resolveUserAvatar(publicUser));
  }, [publicUser]);

  // Fetch live network status on mount so sent/accepted states and friend avatars are accurate
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      if (!targetUserId) return;
      try {
        const network: any = await fetchFriendsNetwork();
        if (!active) return;

        const matchedFriend = (network.friends || []).find((f: any) => String(f.id) === targetUserId);
        const matchedReceived = (network.pendingRequests || []).find((r: any) => String(r.id) === targetUserId);
        const matchedSent = (network.sentRequests || []).find((s: any) => String(s.id) === targetUserId);

        if (matchedFriend) {
          setResolvedStatus('accepted');
          // Cross-reference friend record if publicUser had a sparse avatar
          const friendAvatar = resolveUserAvatar(matchedFriend);
          if (friendAvatar !== DEFAULT_AVATAR) {
            setAvatarUri(friendAvatar);
          }
        } else if (matchedReceived) {
          setResolvedStatus('pending_received');
          setActiveRequestId(matchedReceived.requestId);
        } else if (matchedSent) {
          setResolvedStatus('pending_sent');
        } else {
          setResolvedStatus(initialFriendshipStatus ?? 'none');
        }
      } catch (err: any) {
        console.log('Full 500 error details:', err.response?.data || err.message);
      }
    };

    checkStatus();
    return () => {
      active = false;
    };
  }, [targetUserId, initialFriendshipStatus]);

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
      : 'Erie, United States';

  const today = new Date();
  const targetUsername = publicUser?.username ? String(publicUser.username).toLowerCase() : '';

  // Match all events hosted by this user
  const allHostedEvents = (events || []).filter((e: EventItem) => {
    const rawHost: any = (e as any).hostId ?? (e as any).host ?? (e as any).createdBy ?? (e as any).ownerId;
    if (!rawHost) return false;

    if (typeof rawHost === 'object') {
      const hostObjId = String(rawHost._id ?? rawHost.id ?? '');
      const hostObjUsername = rawHost.username ? String(rawHost.username).toLowerCase() : '';
      return (
        (targetUserId !== '' && hostObjId === targetUserId) ||
        (targetUsername !== '' && hostObjUsername === targetUsername)
      );
    }

    return targetUserId !== '' && String(rawHost) === targetUserId;
  });

  // Currently hosting (active/upcoming events)
  const currentlyHostingEvents = allHostedEvents.filter((e: EventItem) => {
    if (!e.endsAt) return true;
    const endDate = new Date(e.endsAt);
    return Number.isNaN(endDate.getTime()) || endDate >= today;
  });

  const interestedEvents = (events || []).filter(
    (e: EventItem) => !allHostedEvents.some((h: EventItem) => h.id === e.id)
  );
  const attendedEvents = interestedEvents.filter((e: EventItem) => new Date(e.endsAt) < today);

  const totalHostedEvents =
    typeof publicUser?.totalEvents === 'number'
      ? publicUser.totalEvents
      : typeof publicUser?.eventsHosted === 'number'
        ? publicUser.eventsHosted
        : allHostedEvents.length;

  const totalAttendees =
    typeof publicUser?.totalAttendees === 'number'
      ? publicUser.totalAttendees
      : allHostedEvents.reduce(
          (sum: number, e: EventItem) =>
            sum + (Number((e as any).attendeesCount ?? (e as any).attendingCount ?? 0) || 0),
          0
        );

  const highlightColor = theme === 'dark' ? '#69F0AE' : '#1B873F';

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
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
          <View style={styles.metaPill}>
            <Ionicons name="location-sharp" size={13} color={colors.primary} />
            <AppText style={[styles.metaPillText, { color: colors.muted }]}>{locationText}</AppText>
          </View>

          {formattedDob ? (
            <View style={styles.metaPill}>
              <Ionicons name="gift-outline" size={13} color={colors.primary} />
              <AppText style={[styles.metaPillText, { color: colors.muted }]}>Born {formattedDob}</AppText>
            </View>
          ) : null}
        </View>

        {/* Stateful Friend Action Control */}
        {targetUserId !== '' && (
          <View style={styles.friendActionContainer}>
            <FriendActionButton
              targetUserId={targetUserId}
              initialStatus={resolvedStatus}
              requestId={activeRequestId}
              onStatusChange={(newStatus) => setResolvedStatus(newStatus)}
            />
          </View>
        )}
      </View>

      {/* Host Impact Section */}
      <AppText variant="bodyLarge" style={[styles.sectionHeading, { color: colors.text }]}>
        Host Impact
      </AppText>
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
              No saved events yet.
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
              No attended events yet.
            </AppText>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, flexGrow: 1 },
  profileHeader: { alignItems: 'center', marginBottom: 18 },
  avatarImage: { width: 94, height: 94, borderRadius: 47 },
  avatarFrame: { borderWidth: 2, borderRadius: 51, padding: 3, marginBottom: 12 },
  userName: { fontWeight: '900', marginBottom: 2, letterSpacing: 0.2 },
  userHandle: { fontWeight: '700', marginBottom: 10 },
  bioSection: { width: '100%', alignItems: 'center', marginBottom: 12 },
  bioQuoteContainer: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 2, width: '100%' },
  bioText: { lineHeight: 19, fontSize: 13 },
  metaPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 14 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaPillText: { fontSize: 12, fontWeight: '600' },
  friendActionContainer: { marginTop: 2 },
  sectionHeading: { fontWeight: '900', marginBottom: 10 },
  metricsGrid: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  valueToken: { fontWeight: '900', fontSize: 20 },
  labelToken: { fontSize: 9, fontWeight: '800', marginTop: 4, textAlign: 'center', letterSpacing: 0.5 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 20 },
  tabButton: { flex: 1, alignItems: 'center', paddingBottom: 12, position: 'relative' },
  activeTabText: { fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabText: { fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  section: { fontWeight: '800' },
  empty: { lineHeight: 19, marginTop: 12 },
});