import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function ItineraryScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Itinerary" subtitle={`${events.length} saved ${events.length === 1 ? 'event' : 'events'} to plan around.`} />
      {events.length ? events.map((event, index) => (
        <View key={event.id} style={styles.row}>
          <View style={styles.timeline}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            {index < events.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
          </View>
          <View style={styles.event}>
            <Text style={[styles.time, { color: colors.primary }]}>{event.time}</Text>
            <EventCard event={event} horizontal onPress={() => onOpenEvent(event)} />
          </View>
        </View>
      )) : <Text style={[styles.empty, { color: colors.muted }]}>Your itinerary is empty. Mark events as interested to start planning your day.</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  row: { flexDirection: 'row', gap: 10 },
  timeline: { width: 14, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  line: { width: 2, flex: 1, marginTop: 4 },
  event: { flex: 1 },
  time: { fontSize: 10, fontWeight: '800', marginBottom: 6 },
  empty: { fontSize: 12, lineHeight: 19, marginTop: 12 },
});