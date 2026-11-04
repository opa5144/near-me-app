import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';

export function EventHostScreen({ events, onOpenEvent, onCreateEvent, onCreateStore }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void; onCreateEvent: () => void; onCreateStore: () => void }) {
  const { colors } = useTheme();
  const { viewedEventIds, interestedEventIds } = useEvents();

  const totalEvents = events.length;
  const hostEventIds = events.map(e => e.id);
  const totalUniqueViews = viewedEventIds.filter(id => hostEventIds.includes(id)).length;
  const totalInterested = interestedEventIds.filter(id => hostEventIds.includes(id)).length;
  
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="Manage your events" title="Host Dashboard" subtitle="Manage and monitor your events and stores." />
      
      <View style={styles.actionRow}>
        <AppButton title="+  Create Event" onPress={onCreateEvent} style={styles.halfButton} />
        <AppButton title="+  Create Store" onPress={onCreateStore} style={styles.halfButton} />
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Overview</AppText>
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={styles.valueToken}>{totalEvents}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>TOTAL EVENTS</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={styles.valueToken}>{totalUniqueViews}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>UNIQUE VIEWS</AppText>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="headerMedium" style={styles.valueToken}>{totalInterested}</AppText>
          <AppText variant="bodyMedium" color={colors.muted} style={styles.labelToken}>INTERESTED</AppText>
        </View>
      </View>

      <AppText variant="bodyLarge" style={[styles.section, { color: colors.text }]}>Your Events</AppText>
      {events.length ? events.map(event => {
        const viewCount = viewedEventIds.includes(event.id) ? 1 : 0;
        const interestedCount = interestedEventIds.includes(event.id) ? 1 : 0;

        return (
          <EventCard
            key={event.id}
            event={event}
            horizontal
            views={viewCount}
            interested={interestedCount}
            onPress={() => onOpenEvent(event)}
          />
        );
      }) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>You have no events to display.</AppText>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  metricsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: 'center' },
  valueToken: { fontWeight: '900', fontSize: 18 },
  labelToken: { fontSize: 9, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  halfButton: { flex: 1 },
  section: { fontWeight: '900', marginBottom: 12, marginTop: 4 },
  empty: { lineHeight: 19, marginTop: 4 },
});