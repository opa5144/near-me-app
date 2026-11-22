import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { isAxiosError } from 'axios';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { BottomTabBar, TabName } from '../components/BottomTabBar';
import { ScreenContainer } from '../components/ScreenContainer';

import { useTheme } from '../context/ThemeContext';
import { EventsProvider, useEvents } from '../context/EventsContext';
import { NotificationsProvider } from '../context/NotificationsContext';
import type { NotificationAction } from '../api/notifications';
import { UserDataProvider, useUserData } from '../context/UserDataContext';

import { fetchEvent } from '../api/events';
import type { EventItem } from '../data/events';
import type { StoreItem as SampleStoreItem } from '../data/stores';

import { HomeScreen } from '../screens/event/HomeScreen';
import { SearchScreen } from '../screens/event/SearchScreen';
import { ItineraryScreen } from '../screens/event/ItineraryScreen';
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
import { NotificationInboxScreen } from '../screens/settings/NotificationInboxScreen';
import { RateEventScreen } from '../screens/event/RateEventScreen';
import { FriendRequestScreen } from '../screens/settings/FriendRequestScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  EventDetails: { eventId: string };
  EventHostDetail: { eventId: string };
  EditEvent: { eventId: string };
  RescheduleEvent: { eventId: string };
  StoreDetails: { storeId?: string; sampleStore?: SampleStoreItem };
  NotificationInbox: undefined;
  RateEvent: { eventId: string };
  FriendRequest: { requestId: string };
};

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();
const HostStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Inbox content supplies IDs, never arbitrary navigation routes or URLs.
function openNotificationAction(navigation: any, action: NotificationAction) {
  if (action.type === 'OPEN_FRIEND_REQUEST') {
    if (/^[a-f0-9]{24}$/i.test(action.requestId)) navigation.navigate('FriendRequest', { requestId: action.requestId });
    return;
  }
  if (typeof action.eventId !== 'string' || !/^[a-f0-9]{24}$/i.test(action.eventId)) return;
  if (action.type === 'OPEN_EVENT') navigation.navigate('EventDetails', { eventId: action.eventId });
  if (action.type === 'RATE_EVENT') navigation.navigate('RateEvent', { eventId: action.eventId });
}

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
              onOpenNotificationAction={action => openNotificationAction(props.navigation, action)}
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
  const { refreshStores } = useUserData();

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
              onUpdated={event => { addCreatedEvent(event); void refreshEvents(); }}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </HostStack.Screen>
      <HostStack.Screen name="CreateStore">
        {props => (
          <CreateStoreScreen
            onBack={() => props.navigation.goBack()}
            onCreated={() => {
              void refreshStores(true);
              props.navigation.goBack();
            }}
          />
        )}
      </HostStack.Screen>
    </HostStack.Navigator>
  );
}

function TabNavigator() {
  const { events, myEvents, interestedEventIds, attendingEventIds } = useEvents();
  const plannedEvents = events.filter(event => interestedEventIds.includes(event.id) || attendingEventIds.includes(event.id));

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, lazy: false }}
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
                hostedEvents={myEvents}
                onOpenEvent={event => props.navigation.navigate('EventDetails', { eventId: event.id })}
                onSeeAll={() => props.navigation.navigate('Search')}
                onOpenNotifications={() => props.navigation.navigate('NotificationInbox')}
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
                onOpenStore={store => props.navigation.navigate('StoreDetails', { storeId: store.id })}
              />
            </ScreenContainer>
          </EventsStatus>
        )}
      </Tab.Screen>
      <Tab.Screen name="Plans">
        {props => (
          <EventsStatus>
            <ScreenContainer style={{ paddingHorizontal: 0 }}>
              <ItineraryScreen
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
  const { selectionsSavingEventIds, addCreatedEvent, refreshEvents } = useEvents();
  const eventId = route.params?.eventId;
  const selectionSaving = selectionsSavingEventIds.includes(eventId ?? '');
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    let requestNumber = 0;
    let controller: AbortController | undefined;
    const load = () => {
      const request = ++requestNumber;
      controller?.abort();
      setEvent(current => current?.id === eventId ? current : null);
      setError(null);
      setIsLoading(true);
      if (!eventId) {
        setError('Event not found.');
        setIsLoading(false);
        return;
      }
      if (selectionSaving) return;
      const pending = new AbortController();
      controller = pending;
      void fetchEvent(eventId, pending.signal)
        .then(found => {
          if (active && request === requestNumber && !pending.signal.aborted) setEvent(found);
        })
        .catch((reason: unknown) => {
          if (!active || request !== requestNumber || pending.signal.aborted) return;
          const status = isAxiosError(reason) ? reason.response?.status : undefined;
          if (status === 400 || status === 404) setEvent(null);
          setError(status === 400 || status === 404
            ? 'Event not found. It may have been removed.'
            : 'Could not refresh this event and its totals. Check your connection and try again.');
        })
        .finally(() => {
          if (active && request === requestNumber && !pending.signal.aborted) setIsLoading(false);
        });
    };
    load();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { active = false; controller?.abort(); appState.remove(); };
  }, [eventId, attempt, selectionSaving]));

  const goBack = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs');

  if (!event) {
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
      onRescheduleEvent={() => navigation.navigate('RescheduleEvent', { eventId: event.id })}
      onChanged={saved => { setEvent(saved); addCreatedEvent(saved); void refreshEvents(); setAttempt(current => current + 1); }}
      onBack={goBack}
      onRefresh={() => setAttempt(current => current + 1)}
      refreshing={isLoading}
      refreshError={error}
      ratingRefreshKey={attempt}
    />
  );
}

function StoreDetailsRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'StoreDetails'>) {
  return (
    <ScreenContainer style={{ paddingHorizontal: 0 }}>
      <StoreDetailsScreen
        storeId={route.params?.storeId ?? ''}
        onBack={() => navigation.goBack()}
      />
    </ScreenContainer>
  );
}

function NotificationInboxRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'NotificationInbox'>) {
  return <ScreenContainer style={{ paddingHorizontal: 0 }}>
    <NotificationInboxScreen
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')}
      onOpenAction={action => openNotificationAction(navigation, action)} />
  </ScreenContainer>;
}

function RateEventRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'RateEvent'>) {
  return <ScreenContainer style={{ paddingHorizontal: 0 }}>
    <RateEventScreen eventId={route.params?.eventId ?? ''}
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')} />
  </ScreenContainer>;
}

function FriendRequestRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'FriendRequest'>) {
  return <ScreenContainer style={{ paddingHorizontal: 0 }}>
    <FriendRequestScreen requestId={route.params?.requestId ?? ''}
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')} />
  </ScreenContainer>;
}

function RootNavigator() {
  const { colors } = useTheme();
  const { refreshEvents, addCreatedEvent } = useEvents();

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
      <RootStack.Screen name="NotificationInbox" component={NotificationInboxRoute} />
      <RootStack.Screen name="RateEvent" component={RateEventRoute} />
      <RootStack.Screen name="FriendRequest" component={FriendRequestRoute} />
      <RootStack.Screen name="EditEvent">
        {props => {
          const route = props.route as { params?: { eventId: string } };
          const eventId = route.params?.eventId ?? '';

          return (
            <EditEventScreen
              eventId={eventId}
              onUpdated={event => { addCreatedEvent(event); void refreshEvents(); }}
              onBack={() => props.navigation.goBack()}
            />
          );
        }}
      </RootStack.Screen>
      <RootStack.Screen name="RescheduleEvent">
        {props => <EditEventScreen eventId={props.route.params.eventId} mode="reschedule"
          onUpdated={event => { addCreatedEvent(event); void refreshEvents(); }}
          onBack={() => props.navigation.goBack()} />}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <EventsProvider>
      <UserDataProvider>
        <NotificationsProvider>
          <RootNavigator />
        </NotificationsProvider>
      </UserDataProvider>
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
