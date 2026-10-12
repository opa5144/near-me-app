import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../data/events';
import { EventCard } from '../components/EventCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../data/theme';

export function ItineraryScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="My Itinerary" subtitle={`${events.length} saved ${events.length === 1 ? 'event' : 'events'} to plan around.`} />
      {events.length ? events.map((event, index) => (
        <View key={event.id} style={styles.row}>
          <View style={styles.timeline}><View style={styles.dot} />{index < events.length - 1 && <View style={styles.line} />}</View>
          <View style={styles.event}><Text style={styles.time}>{event.time}</Text><EventCard event={event} horizontal onPress={() => onOpenEvent(event)} /></View>
        </View>
      )) : <Text style={styles.empty}>Your itinerary is empty. Mark events as interested to start planning your day.</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  row: { flexDirection: 'row', gap: 10 },
  timeline: { width: 14, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 5 },
  line: { width: 2, flex: 1, backgroundColor: '#DCD3FF', marginTop: 4 },
  event: { flex: 1 },
  time: { color: colors.primary, fontSize: 10, fontWeight: '800', marginBottom: 6 },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
});
