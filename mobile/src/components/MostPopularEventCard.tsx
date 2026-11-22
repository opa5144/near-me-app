
import { StyleSheet, Text, View } from 'react-native';
import type { EventItem } from '../data/events';
import { useTheme } from '../context/ThemeContext';
import { EventCard } from './EventCard';

export function MostPopularEventCard({
  event,
  metricLabel,
  metricValue,
  onPress
}: {
  event: EventItem;
  metricLabel: string;
  metricValue: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headingContainer}>
          <Text style={[styles.title, { color: colors.text }]}>
            Most Popular Event
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Your most popular hosted event
          </Text>
        </View>

        <View style={[styles.metricBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.metricText}>
            {metricValue} {metricLabel}
          </Text>
        </View>
      </View>

      <EventCard
        event={event}
        onPress={onPress}
        attendingCount={event.attendingCount}
        interestedCount={event.interestedCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10
  },
  headingContainer: {
    flex: 1
  },
  title: {
    fontSize: 16,
    fontWeight: '800'
  },
  subtitle: {
    fontSize: 12,
    marginTop: 3
  },
  metricBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },
  metricText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800'
  }
});
