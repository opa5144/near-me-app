import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EventItem } from '../../data/events';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { NotificationBell } from '../../components/NotificationBell';
import { EventCard } from '../../components/EventCard';

export function HomeScreen({
  events,
  interestedEvents,
  onOpenEvent,
  onSeeAll,
  onOpenNotifications
}: {
  events: EventItem[];
  interestedEvents: EventItem[];
  onOpenEvent: (event: EventItem) => void;
  onSeeAll: () => void;
  onOpenNotifications: () => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  const nextEvent = useMemo(() => {
    const now = Date.now();

    return interestedEvents
      .filter(event => {
        const startTime = Date.parse(event.startsAt);
        return Number.isFinite(startTime) && startTime >= now;
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  }, [interestedEvents]);

  const topPicks = events.slice(0, 4);
  const featuredWidth = Math.min(320, Math.max(220, width - 48));

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.welcomeRow}>
        <Text style={[styles.welcome, { color: colors.muted }]}>Welcome back!</Text>
        <NotificationBell onPress={onOpenNotifications} />
      </View>

      <ScreenHeader
        title="Your Dashboard"
        subtitle="A quick look at your plans and discoveries."
      />

      <Text style={[styles.section, { color: colors.text }]}>
        Your Next Event
      </Text>

      {nextEvent ? (
        <EventCard event={nextEvent} horizontal onPress={() => onOpenEvent(nextEvent)} />
      ) : (
        <View style={[styles.emptyCard, {
          backgroundColor: colors.surface,
          borderColor: colors.border
        }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No upcoming plans yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Events you're interested in will appear here. Explore events and
            start planning something fun!
          </Text>
          <Text
            onPress={onSeeAll}
            style={[styles.detailsLink, { color: colors.primary }]}
          >
            Explore events →
          </Text>
        </View>
      )}

      <View style={styles.sectionTitle}>
        <Text style={[styles.section, { color: colors.text, marginBottom: 0 }]}>
          Top Picks
        </Text>

        <Text
          onPress={onSeeAll}
          style={[styles.seeAll, { color: colors.primary }]}
        >
          See All
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.featured}
      >
        {topPicks.map(event => (
          <View key={event.id} style={{ width: featuredWidth }}>
            <EventCard event={event} horizontal onPress={() => onOpenEvent(event)} />
          </View>
        ))}
      </ScrollView>

      {!topPicks.length && (
        <Text style={{ color: colors.muted }}>
          No events available right now.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  content: {
    padding: 16,
    paddingBottom: 20,
    flexGrow: 1
  },
  welcome: {
    fontSize: 11,
    marginBottom: 0
  },
  section: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18
  },
  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  seeAll: {
    fontSize: 11,
    fontWeight: '700'
  },
  featured: {
    gap: 8,
    paddingBottom: 8
  },
  detailsLink: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6
  }
});
