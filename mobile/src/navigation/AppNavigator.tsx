
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
import { EventHostDetailsScreen } from '../screens/host/EventHostDetailsScreen';
import { CreateEventScreen } from '../screens/host/CreateEventScreen';
import { EditEventScreen } from '../screens/host/EditEventScreen';
import { CreateStoreScreen } from '../screens/host/CreateStoreScreen';
import { StoreDetailsScreen } from '../screens/host/StoreDetailsScreen';

import { UserProfileScreen } from '../screens/settings/UserProfileScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { AccountScreen } from '../screens/settings/AccountScreen';
import { SecurityScreen } from '../screens/settings/SecurityScreen';
import { BookingHistoryScreen } from '../screens/settings/BookingHistoryScreen';
import { BookingHistoryDetailsScreen } from '../screens/settings/BookingHistoryDetailsScreen';
import { PreferencesScreen } from '../screens/settings/PreferencesScreen';
import { NotificationsScreen } from '../screens/settings/NotificationsScreen';
import { DisplayScreen } from '../screens/settings/DisplayScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  EventDetails: { eventId: string };
  EventHostDetail: { eventId: string };
  EditEvent: { eventId: string };
  StoreDetails: { storeId: string };
};

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();
const HostStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function ProfileNavigator() {
  const { colors } = useTheme();
  const { events, interestedEventIds, addCreatedEvent } = useEvents();
  const interestedEvents = events.filter(event => interestedEventIds.includes(event.id));

  return (
    <ProfileStack.Navigator screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
      animation: 'fade'
    }}>
      <ProfileStack.Screen name="ProfileMain">
        {props => (
          <ScreenContainer style={{ paddingHorizontal: 0 }}>
            <UserProfileScreen
              events={interestedEvents}
              onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
              {...props}
            />
          </ScreenContainer>
        )}
      </ProfileStack.Screen>
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
      <ProfileStack.Screen name="BookingHistoryDetails">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><BookingHistoryDetailsScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Preferences">
        {props => <ScreenContainer style={{ paddingHorizontal: 0 }}><PreferencesScreen {...props} /></ScreenContainer>}
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

function EventsStatus({ children }: { children: ReactNode }) {
  const { colors, theme } = useTheme();
  const { isLoading, error, refreshEvents, selectionsLoading, selectionsError, refreshSelections } = useEvents();
  const selectionErrorColor = theme === 'dark' ? '#FF8A80' : '#C62828';

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {(isLoading || error) && (
        <View style={[styles.status, { backgroundColor: colors.surface }]}>
          {isLoading && <ActivityIndicator color={colors.primary} />}
          <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: colors.muted }]}>
            {isLoading ? 'Loading events...' : error}
          </Text>
          {!isLoading && error && (
            <Pressable onPress={() => void refreshEvents()} accessibilityRole="button">
              <Text style={{ color: colors.primary }}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}
      {(selectionsLoading || selectionsError) && <View style={[styles.status, { backgroundColor: colors.surface }]}>
        {selectionsLoading && <ActivityIndicator color={colors.primary} />}
        <Text accessibilityRole={selectionsError ? 'alert' : undefined} style={[styles.statusText, { color: selectionsError ? selectionErrorColor : colors.muted }]}>
          {selectionsError || 'Loading saved event choices...'}
        </Text>
        {!selectionsLoading && selectionsError && <Pressable onPress={() => void refreshSelections()} accessibilityRole="button">
          <Text style={{ color: colors.primary }}>Retry</Text>
        </Pressable>}
      </View>}
      {children}
    </View>
  );
}

function HostNavigator() {
  const { colors } = useTheme();
  const { myEvents, addCreatedEvent, refreshEvents } = useEvents();

  return (
    <HostStack.Navigator screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
      animation: 'fade'
    }}>
      <HostStack.Screen name="HostHome">
        {props => (
          <EventsStatus>
            <ScreenContainer style={{ paddingHorizontal: 0 }}>
              <EventHostScreen
                events={myEvents}
                onOpenEvent={event => props.navigation.navigate('EventHostDetail', { eventId: event.id })}
                onCreateEvent={() => props.navigation.navigate('CreateEvent')}
                onCreateStore={() => props.navigation.navigate('CreateStore')}
                onOpenStore={store => props.navigation.navigate('StoreDetails', { storeId: store.id })}
              />
            </ScreenContainer>
          </EventsStatus>
        )}
      </HostStack.Screen>
      <HostStack.Screen name="CreateEvent">
        {props => <CreateEventScreen onCreated={addCreatedEvent} onBack={() => props.navigation.goBack()} />}
      </HostStack.Screen>
      <HostStack.Screen name="EditEvent">
        {props => {
          const route = props.route as { params?: { eventId: string } };
          const eventId = route.params?.eventId ?? '';

          return (
            <EditEventScreen
              eventId={eventId}
              onUpdated={() => { void refreshEvents(); }}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </HostStack.Screen>
      <HostStack.Screen name="CreateStore">
        {props => <CreateStoreScreen onBack={() => props.navigation.goBack()} onCreated={() => props.navigation.goBack()} />}
      </HostStack.Screen>
    </HostStack.Navigator>
  );
}

function TabNavigator() {
  const { events, interestedEventIds, attendingEventIds } = useEvents();
  // Either independent choice makes an event part of the user's plans.
  const plannedEvents = events.filter(event => interestedEventIds.includes(event.id) || attendingEventIds.includes(event.id));

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <BottomTabBar
          active={state.routes[state.index].name as TabName}
          onChange={name => navigation.navigate(name)}
        />
      )}
    >
      <Tab.Screen name="Home">
        {props => (
          <EventsStatus>
            <ScreenContainer style={{ paddingHorizontal: 0 }}>
              <HomeScreen
                events={events}
                interestedEvents={plannedEvents}
                onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
                onSeeAll={() => props.navigation.navigate('Search')}
              />
            </ScreenContainer>
          </EventsStatus>
        )}
      </Tab.Screen>
      <Tab.Screen name="Search">
        {props => (
          <EventsStatus>
            <ScreenContainer style={{ paddingHorizontal: 0 }}>
              <SearchScreen
                events={events}
                onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
              />
            </ScreenContainer>
          </EventsStatus>
        )}
      </Tab.Screen>
      <Tab.Screen name="Plans">
        {props => (
          <EventsStatus>
            <ScreenContainer style={{ paddingHorizontal: 0 }}>
              <MyEventsScreen
                events={plannedEvents}
                onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
              />
            </ScreenContainer>
          </EventsStatus>
        )}
      </Tab.Screen>
      <Tab.Screen name="Host" component={HostNavigator} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
  );
}

function EventDetailsRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EventDetails'>) {
  const { colors } = useTheme();
  const { interestedEventIds, attendingEventIds, toggleInterested, toggleAttending, recordView,
    selectionsLoading, selectionsReady, selectionsSavingEventIds, selectionsError, refreshSelections } = useEvents();
  const eventId = route.params?.eventId;
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setEvent(null);
    setError(null);
    setIsLoading(true);

    if (!eventId) {
      setError('Event not found.');
      setIsLoading(false);
      return () => { active = false; };
    }

    void fetchEvent(eventId)
      .then(found => {
        if (active) {
          setEvent(found);
          if (recordView) void recordView(found.id);
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;

        const status = isAxiosError(reason) ? reason.response?.status : undefined;
        setError(status === 400 || status === 404
          ? 'Event not found. It may have been removed.'
          : 'Could not load this event. Check your connection and try again.');
      })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, [eventId, attempt, recordView]);

  const goBack = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs');

  if (isLoading || !event) {
    return (
      <ScreenContainer>
        <View style={styles.empty}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              <Text accessibilityRole="alert" style={[styles.message, { color: colors.text }]}>
                {error || 'Event not found.'}
              </Text>
              <Pressable onPress={() => setAttempt(current => current + 1)} accessibilityRole="button" style={styles.retry}>
                <Text style={{ color: colors.primary }}>Retry</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={goBack} accessibilityRole="button" style={styles.retry}>
            <Text style={{ color: colors.primary }}>Back to events</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <EventDetailsScreen
        event={event}
        navigation={navigation}
        interested={interestedEventIds.includes(event.id)}
        onToggleInterested={() => toggleInterested(event.id)}
        attending={attendingEventIds.includes(event.id)}
        onToggleAttending={() => toggleAttending(event.id)}
        selectionsLoading={selectionsLoading}
        selectionsReady={selectionsReady}
        selectionSaving={selectionsSavingEventIds.includes(event.id)}
        selectionError={selectionsError}
        onRetrySelections={() => { void refreshSelections(); }}
        onBack={goBack}
      />
    </ScreenContainer>
  );
}

function EventHostDetailsRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EventHostDetail'>) {
  const { colors } = useTheme();
  const eventId = route.params?.eventId;
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setEvent(null);
    setError(null);
    setIsLoading(true);

    if (!eventId) {
      setError('Event not found.');
      setIsLoading(false);
      return () => { active = false; };
    }

    void fetchEvent(eventId)
      .then(found => { if (active) setEvent(found); })
      .catch((reason: unknown) => {
        if (!active) return;

        const status = isAxiosError(reason) ? reason.response?.status : undefined;
        setError(status === 400 || status === 404
          ? 'Event not found. It may have been removed.'
          : 'Could not load this event. Check your connection and try again.');
      })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, [eventId, attempt]);

  const goBack = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs');

  if (isLoading || !event) {
    return (
      <ScreenContainer>
        <View style={styles.empty}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              <Text accessibilityRole="alert" style={[styles.message, { color: colors.text }]}>
                {error || 'Event not found.'}
              </Text>
              <Pressable onPress={() => setAttempt(current => current + 1)} style={styles.retry}>
                <Text style={{ color: colors.primary }}>Retry</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={goBack} style={styles.retry}>
            <Text style={{ color: colors.primary }}>Back to Dashboard</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <EventHostDetailsScreen
      event={event}
      onEditEvent={() => navigation.navigate('EditEvent', { eventId: event.id })}
      onBack={goBack}
    />
  );
}

function StoreDetailsRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'StoreDetails'>) {
  return <ScreenContainer style={{ paddingHorizontal: 0 }}>
    <StoreDetailsScreen storeId={route.params?.storeId ?? ''}
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')} />
  </ScreenContainer>;
}

function RootNavigator() {
  const { colors } = useTheme();
  const { refreshEvents } = useEvents();

  return (
    <RootStack.Navigator screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
      animation: 'fade'
    }}>
      <RootStack.Screen name="MainTabs" component={TabNavigator} />
      <RootStack.Screen name="EventDetails" component={EventDetailsRoute} />
      <RootStack.Screen name="EventHostDetail" component={EventHostDetailsRoute} />
      <RootStack.Screen name="StoreDetails" component={StoreDetailsRoute} />
      <RootStack.Screen name="EditEvent">
        {props => {
          const route = props.route as { params?: { eventId: string } };
          const eventId = route.params?.eventId ?? '';

          return (
            <EditEventScreen
              eventId={eventId}
              onUpdated={() => { void refreshEvents(); }}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <EventsProvider>
      <RootNavigator />
    </EventsProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  status: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { flex: 1, fontSize: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  message: { textAlign: 'center', marginBottom: 12 },
  retry: { padding: 12 },
});
