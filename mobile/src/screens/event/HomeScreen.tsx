import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventItem } from '../../data/events';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

// Helper to format prices as whole dollars without decimals or cents
function formatWholeDollarPrice(price?: string | number | null): string {
  if (price === undefined || price === null) return 'Free';
  const raw = String(price).trim();
  if (!raw || raw.toLowerCase().includes('free')) return 'Free';
  const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Free';
  return `$${Math.round(numeric).toLocaleString()}`;
}

export function HomeScreen({
  events,
  interestedEvents,
  onOpenEvent,
  onSeeAll
}: {
  events: EventItem[];
  interestedEvents: EventItem[];
  onOpenEvent: (event: EventItem) => void;
  onSeeAll: () => void;
}) {
  const { colors } = useTheme();

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

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.welcome, { color: colors.muted }]}>
        Welcome back!
      </Text>

      <ScreenHeader
        title="Your Dashboard"
        subtitle="A quick look at your plans and discoveries."
      />

      <Text style={[styles.section, { color: colors.text }]}>
        Your Next Event
      </Text>

      {nextEvent ? (
        <View style={[styles.upcomingCard, {
          backgroundColor: colors.surface,
          borderColor: colors.border
        }]}>
          <View style={[styles.upcomingArt, { backgroundColor: nextEvent.accent }]}>
            {nextEvent.bannerImage ? (
              <Image
                source={{ uri: nextEvent.bannerImage }}
                style={styles.upcomingImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.upcomingEmoji}>{nextEvent.emoji}</Text>
            )}
          </View>

          <View style={styles.upcomingInfo}>
            <Text style={[styles.upcomingTitle, { color: colors.text }]}>
              {nextEvent.title}
            </Text>

            <Text style={[styles.upcomingMeta, { color: colors.muted }]}>
              {nextEvent.date} · {nextEvent.time}
            </Text>
            <Text style={[styles.tilePrice, { color: colors.primary }]}>{formatWholeDollarPrice(nextEvent.price)}</Text>

            <Text style={[styles.upcomingMeta, { color: colors.muted }]}>
              {nextEvent.venue}
            </Text>

            <Text
              onPress={() => onOpenEvent(nextEvent)}
              style={[styles.detailsLink, { color: colors.primary }]}
            >
              View event details →
            </Text>
          </View>
        </View>
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
          <View
            key={event.id}
            style={[styles.featuredCard, {
              backgroundColor: colors.surface,
              borderColor: colors.border
            }]}
          >
            <FeaturedArt event={event} />

            <Text
              style={[styles.featuredTitle, { color: colors.text }]}
              numberOfLines={2}
            >
              {event.title}
            </Text>

            <Text style={[styles.featuredMeta, { color: colors.muted }]}>
              {event.date}
            </Text>
            <Text style={[styles.tilePrice, { color: colors.primary }]}>{formatWholeDollarPrice(event.price)}</Text>

            <Text
              onPress={() => onOpenEvent(event)}
              style={[styles.detailsLink, { color: colors.primary }]}
            >
              View details →
            </Text>
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

function FeaturedArt({ event }: { event: EventItem }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [event.bannerImage]);

  return (
    <View style={[styles.featuredArt, { backgroundColor: event.accent }]}>
      {event.bannerImage && !imageFailed ? (
        <Image
          source={{ uri: event.bannerImage }}
          style={styles.featuredImage}
          resizeMode="cover"
          accessibilityLabel={event.title}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={styles.featuredEmoji}>{event.emoji}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1
  },
  welcome: {
    fontSize: 11,
    marginBottom: 5
  },
  section: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10
  },
  upcomingCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24
  },
  upcomingArt: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  upcomingImage: {
    width: '100%',
    height: '100%'
  },
  upcomingEmoji: {
    fontSize: 56,
    color: '#FFFFFF'
  },
  upcomingInfo: {
    padding: 14
  },
  upcomingTitle: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6
  },
  upcomingMeta: {
    fontSize: 12,
    marginBottom: 4
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24
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
    marginBottom: 10
  },
  seeAll: {
    fontSize: 11,
    fontWeight: '700'
  },
  featured: {
    gap: 12,
    paddingBottom: 20
  },
  featuredCard: {
    width: 190,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1
  },
  featuredArt: {
    height: 105,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 10
  },
  featuredEmoji: {
    fontSize: 42,
    color: '#FFFFFF'
  },
  featuredImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  featuredTitle: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17
  },
  featuredMeta: {
    fontSize: 10,
    marginTop: 5
  },
  tilePrice: { fontSize: 12, fontWeight: '800', marginTop: 5, marginBottom: 4 },
  detailsLink: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 9
  }
});