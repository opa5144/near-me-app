import { ScrollView, StyleSheet, Text } from 'react-native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function MyEventsScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Events" subtitle="Your plans, all together." />
      <Text style={[styles.section, { color: colors.primary }]}>♥  Interested · {events.length} events</Text>
      {events.length ? events.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <Text style={[styles.empty, { color: colors.muted }]}>No saved events yet. Explore events and tap “I’m interested” to add one here.</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  section: { fontSize: 12, fontWeight: '800', marginBottom: 12 },
  empty: { fontSize: 12, lineHeight: 19, marginTop: 12 },
});