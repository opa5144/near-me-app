import { ScrollView, StyleSheet, Text } from 'react-native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors } from '../../data/theme';

export function MyEventsScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="My Events" subtitle="Your plans, all together." />
      <Text style={styles.section}>♥  Interested · {events.length} events</Text>
      {events.length ? events.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <Text style={styles.empty}>No saved events yet. Explore events and tap “I’m interested” to add one here.</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  section: { color: colors.primary, fontSize: 12, fontWeight: '800', marginBottom: 12 },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
});
