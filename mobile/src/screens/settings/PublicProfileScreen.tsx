import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AppText } from '../../components/AppText';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';

export function PublicProfileScreen({ publicUser, events, onOpenEvent, onSendFriendRequest, isFriend }: { publicUser: any; events: EventItem[]; onOpenEvent: (event: EventItem) => void; onSendFriendRequest?: (userId: string) => void; isFriend?: boolean }) {
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<'interested' | 'attended'>('interested');
  const [requestSent, setRequestSent] = useState(false);

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
  const attendedEvents = interestedEvents.filter(e => new Date(e.date) < today);

  const handleFriendPress = () => {
    if (isFriend || requestSent) return;
    setRequestSent(true);
    if (onSendFriendRequest && publicUser?._id) {
      onSendFriendRequest(publicUser._id);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Read-Only Profile Header */}
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
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 20, gap: 32 },
  tabButton: { paddingBottom: 12, position: 'relative' },
  activeTabText: { fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabText: { fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  section: { fontWeight: '800' },
  empty: { lineHeight: 19, marginTop: 12 },
});