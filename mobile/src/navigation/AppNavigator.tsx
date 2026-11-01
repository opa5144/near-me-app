import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabBar, TabName } from '../components/BottomTabBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme } from '../context/ThemeContext';
import { EventsProvider, useEvents } from '../context/EventsContext';
import { fetchEvent } from '../api/events';
import type { EventItem } from '../data/events';
import { HomeScreen } from '../screens/event/HomeScreen';
import { SearchScreen } from '../screens/event/SearchScreen';
import { MyEventsScreen } from '../screens/event/MyEventsScreen';
import { EventDetailsScreen } from '../screens/event/EventDetailsScreen';
import { EventHostScreen } from '../screens/host/EventHostScreen';
import { CreateEventScreen } from '../screens/host/CreateEventScreen';
import { CreateStoreScreen } from '../screens/host/CreateStoreScreen';
import { UserProfileScreen } from '../screens/settings/UserProfileScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { AccountScreen } from '../screens/settings/AccountScreen';
import { SecurityScreen } from '../screens/settings/SecurityScreen';
import { BookingHistoryScreen } from '../screens/settings/BookingHistoryScreen';
import { PreferencesScreen } from '../screens/settings/PreferencesScreen';
import { LocationScreen } from '../screens/settings/LocationScreen';
import { NotificationsScreen } from '../screens/settings/NotificationsScreen';
import { DisplayScreen } from '../screens/settings/DisplayScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';

// Details navigation passes only an event ID; the current event is loaded from the API.
export type RootStackParamList = {
  MainTabs: undefined;
  EventDetails: { eventId: string };
};

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();
const HostStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Module-level definitions keep navigator identities stable when lists update.
// Keeping these navigator functions outside AppNavigator preserves the current tab
// and screen history when shared event data changes.
function ProfileNavigator() {
  const { colors } = useTheme();
  // Successful creates update the shared lists before returning from the form.
  const { addCreatedEvent } = useEvents();
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false,
      contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <ProfileStack.Screen name="ProfileMain" component={UserProfileScreen} />
      <ProfileStack.Screen name="Settings">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><SettingsScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Account">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><AccountScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Security">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><SecurityScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="BookingHistory">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><BookingHistoryScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Preferences">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><PreferencesScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Location">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><LocationScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Notifications">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><NotificationsScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Display">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><DisplayScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="About">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><AboutScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="CreateEvent">
        {props => <CreateEventScreen onCreated={addCreatedEvent} onBack={() => props.navigation.goBack()} />}
      </ProfileStack.Screen>
    </ProfileStack.Navigator>
  );
}

// A shared loading/error banner lets each list reuse the same refresh and retry flow.
function EventsStatus({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { isLoading, error, refreshEvents } = useEvents();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {(isLoading || error) && (
        <View style={[styles.status, { backgroundColor: colors.surface }]}>
          {isLoading && <ActivityIndicator color={colors.primary} />}
          <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: colors.muted }]}>
            {isLoading ? 'Loading events...' : error}
          </Text>
          {!isLoading && error && <Pressable onPress={() => void refreshEvents()} accessibilityRole="button">
            <Text style={{ color: colors.primary }}>Retry</Text>
          </Pressable>}
        </View>
      )}
      {children}
    </View>
  );
}

function HostNavigator() {
  const { colors } = useTheme();
  // The protected /events/mine endpoint uses the signed-in session to select this
  // host's events. It is a different list from the public Home/Search events.
  const { myEvents, addCreatedEvent } = useEvents();
  return (
    <HostStack.Navigator screenOptions={{ headerShown: false,
      contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <HostStack.Screen name="HostHome">
        {props => <EventsStatus><EventHostScreen
          events={myEvents}
          onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
          onCreateEvent={() => props.navigation.navigate('CreateEvent')}
          onCreateStore={() => props.navigation.navigate('CreateStore')}
        /></EventsStatus>}
      </HostStack.Screen>
      <HostStack.Screen name="CreateEvent">
        {props => <CreateEventScreen onCreated={addCreatedEvent} onBack={() => props.navigation.goBack()} />}
      </HostStack.Screen>
      <HostStack.Screen name="CreateStore">
        {props => <CreateStoreScreen {...props} onBack={() => props.navigation.goBack()} />}
      </HostStack.Screen>
    </HostStack.Navigator>
  );
}

function TabNavigator() {
  const { events, interestedEventIds } = useEvents();
  // Plans is a view of the public list filtered by choices kept in this app session.
  const interestedEvents = events.filter(event => interestedEventIds.includes(event.id));
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => <BottomTabBar
        active={state.routes[state.index].name as TabName}
        onChange={name => navigation.navigate(name)}
      />}>
      <Tab.Screen name="Home">
        {props => <EventsStatus><HomeScreen events={events}
          onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
          onSeeAll={() => props.navigation.navigate('Search')} /></EventsStatus>}
      </Tab.Screen>
      <Tab.Screen name="Search">
        {props => <EventsStatus><SearchScreen events={events}
          onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })} /></EventsStatus>}
      </Tab.Screen>
      <Tab.Screen name="Plans">
        {props => <EventsStatus><MyEventsScreen events={interestedEvents}
          onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })} /></EventsStatus>}
      </Tab.Screen>
      <Tab.Screen name="Host" component={HostNavigator} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
  );
}

// This route handles fetching and errors so EventDetailsScreen only displays a valid event.
function EventDetailsRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EventDetails'>) {
  const { colors } = useTheme();
  const { interestedEventIds, toggleInterested } = useEvents();
  const eventId = route.params?.eventId;
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Retry changes this value to rerun the fetch effect for the same event ID.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Leaving the screen or requesting another ID makes old responses harmless.
    let active = true;
    setEvent(null);
    setError(null);
    setIsLoading(true);
    // An absent ID shows a missing-event state instead of an unrelated sample event.
    if (!eventId) {
      setError('Event not found.');
      setIsLoading(false);
      return () => { active = false; };
    }
    // Load the latest saved record rather than trusting a copy passed from a list.
    void fetchEvent(eventId)
      .then(found => { if (active) setEvent(found); })
      .catch((reason: unknown) => {
        if (!active) return;
        // Invalid/removed IDs get a missing-event message; other failures can be retried.
        const status = isAxiosError(reason) ? reason.response?.status : undefined;
        setError(status === 400 || status === 404
          ? 'Event not found. It may have been removed.'
          : 'Could not load this event. Check your connection and try again.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [eventId, attempt]);

  const goBack = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs');
  // Do not render fields such as title/category until the request provides an event.
  if (isLoading || !event) {
    return <ScreenContainer><View style={styles.empty}>
      {isLoading ? <ActivityIndicator size="large" color={colors.primary} /> : <>
        <Text accessibilityRole="alert" style={[styles.message, { color: colors.text }]}>{error || 'Event not found.'}</Text>
        <Pressable onPress={() => setAttempt(current => current + 1)} accessibilityRole="button" style={styles.retry}>
          <Text style={{ color: colors.primary }}>Retry</Text>
        </Pressable>
      </>}
      <Pressable onPress={goBack} accessibilityRole="button" style={styles.retry}>
        <Text style={{ color: colors.primary }}>Back to events</Text>
      </Pressable>
    </View></ScreenContainer>;
  }
  return <ScreenContainer><EventDetailsScreen event={event}
    interested={interestedEventIds.includes(event.id)}
    onToggleInterested={() => toggleInterested(event.id)} onBack={goBack} /></ScreenContainer>;
}

// Details sits above the tab navigator so it can open from Home, Search, Plans, or Host.
function RootNavigator() {
  const { colors } = useTheme();
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false,
      contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <RootStack.Screen name="MainTabs" component={TabNavigator} />
      <RootStack.Screen name="EventDetails" component={EventDetailsRoute} />
    </RootStack.Navigator>
  );
}

// App.tsx mounts this only after login has installed the API session.
// All nested screens share one event provider for this signed-in app session.
export function AppNavigator() {
  return <EventsProvider><RootNavigator /></EventsProvider>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  status: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { flex: 1, fontSize: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  message: { textAlign: 'center', marginBottom: 12 },
  retry: { padding: 12 },
});
