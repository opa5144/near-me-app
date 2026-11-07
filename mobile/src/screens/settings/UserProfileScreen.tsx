import { useEffect, useState } from 'react';
import { View, Share, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { fetchUserProfile } from '../../api/client';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';

export function UserProfileScreen({ navigation, events, onOpenEvent }: { navigation: any; events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<'interested' | 'attended'>('interested');

  // Store user info fetched from backend GET /auth/me
  const [user, setUser] = useState<{ firstName?: string; lastName?: string; username?: string; email?: string } | null>(null);

  useEffect(() => {
    fetchUserProfile()
      .then(res => setUser(res.user))
      .catch(() => { });
  }, []);

  // Compute full display name falling back to username or default loading text
  const displayName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    : 'Loading...';

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Top Action Buttons (Edit, Settings, Share) */}
      <View style={styles.topActionsRow}>
        <TouchableOpacity style={[styles.topIconButton, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8} onPress={() => alert('Edit Profile')}>
          <Ionicons name="create-outline" size={16} color={colors.text} style={styles.editIcon} />
          <AppText variant="bodyMedium" style={styles.topIconText}>Edit</AppText>
        </TouchableOpacity>
        <View style={styles.rightActionIcons}>
          {/* Settings Button */}
          <TouchableOpacity
            style={[styles.topIconButtonCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={19} color={colors.text} />
          </TouchableOpacity>

          {/* Share Button */}
          <TouchableOpacity
            style={[styles.topIconButtonCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.8}
            onPress={async () => {
              try {
                // Get the dynamic profile ID
                const profileId = user?.username || 'me';

                // Construct the development URL with profile ID
                const developmentUrl = `exp://75.102.74.154:8081/--/profile/${profileId}`;

                await Share.share({
                  message: `Check out this profile on NearMe: ${developmentUrl}`,
                });
              }
              catch (error: any) {
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
        <View style={[styles.avatarFrame, { borderColor: colors.border }]}>
          <Image
            source={{ uri: 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg' }}
            style={styles.avatarImage}
          />
        </View>
        <AppText variant="headerMedium" style={styles.userName}>{displayName}</AppText>
        <AppText variant="bodyMedium" color={colors.muted} style={styles.userLocation}>{user?.username ? `@${user.username}` : 'Erie, United States'}</AppText>
      </View>

      {/* 3 Quick Navigation Cards (Tickets, Friends, Inbox) */}
      <View style={styles.tripleCardRow}>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('Tickets')}>
          <Ionicons name="ticket-outline" size={26} color={colors.primary} />
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Tickets</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('No Friends 🥀')}>
          <Ionicons name="people-outline" size={26} color={colors.primary} />
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Friends</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('Inbox')}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.primary} />
          <AppText variant="bodyMedium" style={styles.miniCardTitle}>Inbox</AppText>
        </TouchableOpacity>
      </View>

      {/* Host / Create Event Button matching Host Dashboard */}
      <View style={styles.bannerContainer}>
        <AppButton
          title="+  Create Event"
          onPress={() => navigation.navigate('CreateEvent')}
        />
      </View>

      {/* Tabs Row (Interested Events vs Attended Events) */}
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

      {/* Interested/Attended Events Section using MyEventsScreen logic */}
      {activeTab === 'interested' ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="heart" size={16} color="#E53935" />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>
              Interested · {events?.length || 0} events
            </AppText>
          </View>
          {events?.length ? events.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>No saved events yet. Explore events and tap “I’m interested” to add one here.</AppText>}
        </>
      ) : (
        <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>No attended events yet.</AppText>
      )}

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
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 94, height: 94, borderRadius: 47 },
  avatarFrame: { borderWidth: 2, borderRadius: 51, padding: 3, marginBottom: 12 },
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
});