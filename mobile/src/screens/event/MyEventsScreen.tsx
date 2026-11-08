
import { ScrollView, StyleSheet } from 'react-native';
import { EventItem } from '../../data/events';
import { EventCard } from '../../components/EventCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppText } from '../../components/AppText';

export function MyEventsScreen({ events, onOpenEvent }: { events: EventItem[]; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
    >
      <ScreenHeader title="My Events" subtitle="Your plans, all together." />
      <AppText variant="bodyMedium" color={colors.primary} style={styles.section}>♥  Interested · {events.length} events</AppText>
      {events.length ? events.map(event => <EventCard key={event.id} event={event} horizontal onPress={() => onOpenEvent(event)} />) : <AppText variant="bodyMedium" color={colors.muted} style={styles.empty}>No saved events yet. Explore events and tap “I’m interested” to add one here.</AppText>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 46, flexGrow: 1 },
  section: { fontSize: 12, fontWeight: '800', marginBottom: 12 },
  empty: { fontSize: 12, lineHeight: 19, marginTop: 12 },
});
