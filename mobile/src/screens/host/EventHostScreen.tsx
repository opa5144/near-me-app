import React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { EventItem } from '../../data/events';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';

// AppNavigator supplies only events owned by the signed-in host from /events/mine.
// Navigation and creation stay in the parent so every tab shares the same saved data.
export function EventHostScreen({ events, onOpenEvent, onCreateEvent, onCreateStore }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void; onCreateEvent: () => void; onCreateStore: () => void }) {
  const { colors } = useTheme();
  // This count comes from real owned records; attendance and page views are not tracked.
  const totalEvents = events.length;
  
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="Manage your events" title="Host Dashboard" subtitle="Manage and monitor your events and stores." />
      
      <View style={styles.actionRow}>
        <AppButton title="+  Create Event" onPress={onCreateEvent} style={styles.halfButton} />
        <AppButton title="+  Create Store" onPress={onCreateStore} style={styles.halfButton} />
      </View>

    {/* Only server-confirmed owned events; audience/views are not tracked. */}
      <Text style={[styles.section, { color: colors.text }]}>Overview</Text>
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.valueToken, { color: colors.text }]}>{totalEvents}</Text>
          <Text style={[styles.labelToken, { color: colors.muted }]}>TOTAL EVENTS</Text>
        </View>
      </View>

    {/* Your Events Section */}
      <Text style={[styles.section, { color: colors.text }]}>Your Events</Text>
      {events.length ? events.map(event => (
        <TouchableOpacity key={event.id} style={[styles.eventRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => onOpenEvent(event)} activeOpacity={0.7}>
          <View style={styles.rowMetadata}><Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{event.title}</Text><Text style={[styles.rowSub, { color: colors.muted }]}>📆 {event.date || 'Upcoming'}</Text></View>
        </TouchableOpacity>
      )) : <Text style={[styles.empty, { color: colors.muted }]}>You have no events to display.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  metricsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metricCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14 },
  valueToken: { fontSize: 22, fontWeight: '900' },
  labelToken: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  halfButton: { flex: 1 },
  section: { fontSize: 14, fontWeight: '900', marginBottom: 12 },
  eventRow: { flexDirection: 'row', borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, marginBottom: 10 },
  rowMetadata: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 13, fontWeight: '800' },
  rowSub: { fontSize: 11, marginTop: 4 },
  liveBadge: { fontSize: 10, fontWeight: '900', color: '#10B981', backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  empty: { fontSize: 12, lineHeight: 19, marginTop: 4 },
});