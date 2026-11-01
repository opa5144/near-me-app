import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppButton } from '../../components/AppButton';
import { fetchUserProfile } from '../../api/client';

export function UserProfileScreen({ navigation }: any) {
  const { colors } = useTheme();

  // Store user info fetched from backend GET /auth/me
  const [user, setUser] = useState<{ firstName?: string; lastName?: string; username?: string; email?: string } | null>(null);

  useEffect(() => {
    fetchUserProfile()
      .then(res => setUser(res.user))
      .catch(() => {});
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
          <Text style={[styles.topIconText, { color: colors.text }]}>✏️  Edit</Text>
        </TouchableOpacity>
        <View style={styles.rightActionIcons}>
          <TouchableOpacity 
            style={[styles.topIconButtonCircle, { backgroundColor: colors.surface, borderColor: colors.border }]} 
            activeOpacity={0.8} 
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.topIconText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topIconButtonCircle, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8} onPress={() => alert('Share Profile')}>
            <Text style={styles.topIconText}>↗️</Text>
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
        <Text style={[styles.userName, { color: colors.text }]}>{displayName}</Text>
        <Text style={[styles.userLocation, { color: colors.muted }]}>{user?.username ? `@${user.username}` : 'Erie, United States'}</Text>
      </View>

      {/* 3 Quick Navigation Cards (Tickets, Friends, Inbox) */}
      <View style={styles.tripleCardRow}>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('Tickets')}>
          <Text style={styles.miniCardEmoji}>🎟️</Text>
          <Text style={[styles.miniCardTitle, { color: colors.text }]}>Tickets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('No Friends 🥀')}>
          <Text style={styles.miniCardEmoji}>👥</Text>
          <Text style={[styles.miniCardTitle, { color: colors.text }]}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => alert('Inbox')}>
          <Text style={styles.miniCardEmoji}>💬</Text>
          <Text style={[styles.miniCardTitle, { color: colors.text }]}>Inbox</Text>
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
        <TouchableOpacity style={styles.activeTabButton} activeOpacity={0.8}>
          <Text style={[styles.activeTabText, { color: colors.text }]}>Interested Events</Text>
          <View style={[styles.activeIndicator, { backgroundColor: colors.text }]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.inactiveTabButton} activeOpacity={0.8}>
          <Text style={[styles.inactiveTabText, { color: colors.muted }]}>Attended Events</Text>
        </TouchableOpacity>
      </View>

      {/* Empty State Section */}
      <View style={styles.emptyContainer}>
        <View style={[styles.starCardWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.emptyGlyph}>✨</Text>
        </View>
        <Text style={[styles.emptyText, { color: colors.text }]}>You have no interested events</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, flexGrow: 1 },
  topActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  topIconButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  rightActionIcons: { flexDirection: 'row', gap: 10 },
  topIconButtonCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topIconText: { fontSize: 13, fontWeight: '700' },
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 94, height: 94, borderRadius: 47 },
  avatarFrame: { borderWidth: 2, borderRadius: 51, padding: 3, marginBottom: 12 },
  userName: { fontSize: 22, fontWeight: '900', marginBottom: 4, letterSpacing: 0.2 },
  userLocation: { fontSize: 13, fontWeight: '500' },
  tripleCardRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  miniCard: { flex: 1, height: 105, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  miniCardEmoji: { fontSize: 26 },
  miniCardTitle: { fontSize: 13, fontWeight: '800' },
  bannerContainer: { marginBottom: 28 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 40, gap: 32 },
  activeTabButton: { paddingBottom: 12, position: 'relative' },
  activeTabText: { fontSize: 15, fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, borderRadius: 2 },
  inactiveTabButton: { paddingBottom: 12 },
  inactiveTabText: { fontSize: 15, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 16 },
  starCardWrapper: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { fontSize: 32 },
  emptyText: { fontSize: 16, fontWeight: '800' },
});