import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { BottomTabBar, TabName } from './src/components/BottomTabBar';

import { HomeScreen } from './src/screens/event/HomeScreen';
import { SearchScreen } from './src/screens/event/SearchScreen';
import { MyEventsScreen } from './src/screens/event/MyEventsScreen';
// import { ItineraryScreen } from './src/screens/ItineraryScreen';
import { EventHostScreen } from './src/screens/host/EventHostScreen';
import { CreateEventScreen } from './src/screens/host/CreateEventScreen';
import { CreateStoreScreen } from './src/screens/host/CreateStoreScreen';
import { SettingsScreen } from './src/screens/settings/SettingsScreen';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { SignupScreen } from './src/screens/auth/SignupScreen';
import { EventDetailsScreen } from './src/screens/event/EventDetailsScreen';

import { sampleEvents, EventItem } from './src/data/events';
import { colors } from './src/data/theme';

export default function App() {
  const [tab, setTab] = useState<TabName>('Home');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [interestedIds, setInterestedIds] = useState<string[]>(['1', '2']);

  const [hostRoute, setHostRoute] = useState<'Home' | 'CreateEvent' | 'CreateStore'>('Home');
  const [authRoute, setAuthRoute] = useState<'login' | 'signup'>('login');

  const toggleInterested = (id: string) => {
    setInterestedIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    );
  };
  // Real login state management not implemented yet, but simulated with a state variable for now.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        {authRoute === 'login' ? (
          <LoginScreen
            onLogin={() => setIsLoggedIn(true)}
            onNavigateToSignup={() => setAuthRoute('signup')}
          />
        ) : (
          <SignupScreen
            onBackToLogin={() => setAuthRoute('login')}
          />
        )}
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
      case 'Home': ``
        screen = <HomeScreen events={sampleEvents} onOpenEvent={setSelectedEvent} onSeeAll={() => setTab('Search')} />;
        break;
      case 'Search':
        screen = <SearchScreen events={sampleEvents} onOpenEvent={setSelectedEvent} />;
        break;
      case 'Plans':
        screen = <MyEventsScreen events={sampleEvents.filter(event => interestedIds.includes(event.id))} onOpenEvent={setSelectedEvent} />;
        break;
      case 'Host':
        if (hostRoute === 'Home') {
          screen = (
            <EventHostScreen
              events={sampleEvents.filter(event => interestedIds.includes(event.id))}
              onOpenEvent={setSelectedEvent}
              onCreateEvent={() => setHostRoute('CreateEvent')}
              onCreateStore={() => setHostRoute('CreateStore')}
            />
          );
        } else if (hostRoute === 'CreateEvent') {
          screen = <CreateEventScreen onBack={() => setHostRoute('Home')} />;
        } else {
          screen = <CreateStoreScreen onBack={() => setHostRoute('Home')} />;
        }
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