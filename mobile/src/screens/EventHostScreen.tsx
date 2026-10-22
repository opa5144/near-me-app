import React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { EventItem } from '../data/events';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { colors } from '../data/theme';

export function EventHostScreen({ events, onOpenEvent, onCreateEvent, onCreateStore }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void; onCreateEvent: () => void; onCreateStore: () => void }) {
  const totalEvents = events.length;
  const totalAudience = events.reduce((sum, ev: any) => sum + (ev.attendees || ev.audience || 0), 0);
  const totalPageViews = events.reduce((sum, ev: any) => sum + (ev.pageViews || ev.views || 0), 0);
  
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="Manage your events" title="Host Dashboard" subtitle="Manage and monitor your events and stores." />
      
      <View style={styles.actionRow}>
        <AppButton title="+  Create Event" onPress={onCreateEvent} style={styles.halfButton} />
        <AppButton title="+  Create Store" onPress={onCreateStore} style={styles.halfButton} />
      </View>

    {/* Analytics Section */}
      <Text style={styles.section}>Analytics</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.valueToken}>{totalEvents}</Text>
          <Text style={styles.labelToken}>TOTAL EVENTS</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.valueToken}>{totalAudience}</Text>
          <Text style={styles.labelToken}>TOTAL AUDIENCE</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.valueToken}>{totalPageViews}</Text>
          <Text style={styles.labelToken}>PAGE VIEWS</Text>
        </View>
      </View>

    {/* Your Events Section */}
      <Text style={styles.section}>Your Events</Text>
      {events.length ? events.map(event => (
        <TouchableOpacity key={event.id} style={styles.eventRow} onPress={() => onOpenEvent(event)} activeOpacity={0.7}>
          <View style={styles.rowMetadata}><Text style={styles.rowTitle} numberOfLines={1}>{event.title}</Text><Text style={styles.rowSub}>📆 {event.date || 'Upcoming'}</Text></View>
          <Text style={styles.liveBadge}> Active</Text>
        </TouchableOpacity>
      )) : <Text style={styles.empty}>You have no events to display.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  metricsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  valueToken: { fontSize: 22, fontWeight: '900', color: colors.text },
  labelToken: { fontSize: 10, color: colors.muted, fontWeight: '700', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  halfButton: { flex: 1 },
  section: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 12 },
  eventRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  rowMetadata: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  rowSub: { fontSize: 11, color: colors.muted, marginTop: 4 },
  liveBadge: { fontSize: 10, fontWeight: '900', color: '#10B981', backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4 },
});
