import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AppText } from '../../components/AppText';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { FriendActionButton, FriendshipStatus } from '../../components/FriendActionButton';
import { fetchFriendsNetwork } from '../../api/friends';

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
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<'interested' | 'attended'>('interested');

  const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

  const [avatarUri, setAvatarUri] = useState<string>(
    publicUser?.avatarUrl && publicUser.avatarUrl.trim() !== ''
      ? publicUser.avatarUrl
      : DEFAULT_AVATAR
  );

  // Live relationship status state
  const [resolvedStatus, setResolvedStatus] = useState<FriendshipStatus>(
    initialFriendshipStatus ?? (isFriend ? 'accepted' : 'none')
  );
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>(pendingRequestId);

  // Fetch live network status on mount so sent/accepted states are accurate
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      if (!publicUser?._id) return;
      try {
        const network: any = await fetchFriendsNetwork();
        if (!active) return;

        const targetId = String(publicUser._id);

        const matchedFriend = (network.friends || []).find((f: any) => String(f.id) === targetId);
        const matchedReceived = (network.pendingRequests || []).find((r: any) => String(r.id) === targetId);
        const matchedSent = (network.sentRequests || []).find((s: any) => String(s.id) === targetId);

        if (matchedFriend) {
          setResolvedStatus('accepted');
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
  }, [publicUser?._id]);

  useEffect(() => {
    if (publicUser?.avatarUrl && publicUser.avatarUrl.trim() !== '') {
      setAvatarUri(publicUser.avatarUrl);
    }
  }, [publicUser?.avatarUrl]);

  const displayName = `${publicUser?.firstName || ''} ${publicUser?.lastName || ''}`.trim() || publicUser?.username || 'User Profile';

  const today = new Date();
  const interestedEvents = events || [];
  const attendedEvents = interestedEvents.filter(e => new Date(e.endsAt) < today);

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Read-Only Profile Header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatarFrame, { borderColor: colors.border }]}>
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        </View>
        <AppText variant="headerMedium" style={styles.userName}>{displayName}</AppText>
        <AppText variant="bodyMedium" color={colors.muted} style={styles.userLocation}>{publicUser?.username ? `@${publicUser.username}` : 'Erie, United States'}</AppText>

        {/* Stateful Friend Action Control */}
        {publicUser?._id && (
          <View style={styles.friendActionContainer}>
            <FriendActionButton
              targetUserId={String(publicUser._id)}
              initialStatus={resolvedStatus}
              requestId={activeRequestId}
              onStatusChange={(newStatus) => setResolvedStatus(newStatus)}
            />
          </View>
        )}
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
  profileHeader: { alignItems: 'center', marginBottom: 20 },
  avatarImage: { width: 94, height: 94, borderRadius: 47 },
  avatarFrame: { borderWidth: 2, borderRadius: 51, padding: 3, marginBottom: 12 },
  userName: { fontWeight: '900', marginBottom: 4, letterSpacing: 0.2 },
  userLocation: { fontWeight: '500', marginBottom: 12 },
  friendActionContainer: { marginTop: 4 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 20, gap: 32 },
  tabButton: { paddingBottom: 12, position: 'relative' },
  activeTabText: { fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabText: { fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  section: { fontWeight: '800' },
  empty: { lineHeight: 19, marginTop: 12 },
});