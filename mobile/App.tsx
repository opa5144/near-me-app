import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { BottomTabBar, TabName } from './src/components/BottomTabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { MyEventsScreen } from './src/screens/MyEventsScreen';
import { ItineraryScreen } from './src/screens/ItineraryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { EventDetailsScreen } from './src/screens/EventDetailsScreen';
import { sampleEvents, EventItem } from './src/data/events';
import { colors } from './src/data/theme';

export default function App() {
  const [tab, setTab] = useState<TabName>('Home');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [interestedIds, setInterestedIds] = useState<string[]>(['1', '2']);

  const toggleInterested = (id: string) => {
    setInterestedIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    );
  };
// Login state management
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  if (!isLoggedIn) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <LoginScreen
        onLogin={() => setIsLoggedIn(true)}
      />
    </SafeAreaView>
  );
}

  let screen;
  if (selectedEvent) {
    screen = (
      <EventDetailsScreen
        event={selectedEvent}
        interested={interestedIds.includes(selectedEvent.id)}
        onToggleInterested={() => toggleInterested(selectedEvent.id)}
        onBack={() => setSelectedEvent(null)}
      />
    );
  } else {
    switch (tab) {
      case 'Home':
        screen = <HomeScreen events={sampleEvents} onOpenEvent={setSelectedEvent} onSeeAll={() => setTab('Search')} />;
        break;
      case 'Search':
        screen = <SearchScreen events={sampleEvents} onOpenEvent={setSelectedEvent} />;
        break;
      case 'My Events':
        screen = <MyEventsScreen events={sampleEvents.filter(event => interestedIds.includes(event.id))} onOpenEvent={setSelectedEvent} />;
        break;
      case 'Itinerary':
        screen = <ItineraryScreen events={sampleEvents.filter(event => interestedIds.includes(event.id))} onOpenEvent={setSelectedEvent} />;
        break;
      default:
        screen = <SettingsScreen />;
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.content}>{screen}</View>
        {!selectedEvent && <BottomTabBar active={tab} onChange={setTab} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
});
