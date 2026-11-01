import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBar, TabName } from '../components/BottomTabBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme } from '../context/ThemeContext';

import { HomeScreen } from '../screens/event/HomeScreen';
import { SearchScreen } from '../screens/event/SearchScreen';
import { MyEventsScreen } from '../screens/event/MyEventsScreen';
import { ItineraryScreen } from '../screens/event/ItineraryScreen';
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

import { sampleEvents } from '../data/events';

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();
const HostStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator(); // <-- Root stack to hold tabs + details screen

export function AppNavigator() {
  const { colors } = useTheme();

  // Track saved/interested events globally across the navigator
  const [interestedEventIds, setInterestedEventIds] = useState<string[]>([]);

  // Profile -> Settings -> Specific Settings Flow
  function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <ProfileStack.Screen name="ProfileMain" component={UserProfileScreen} />

      <ProfileStack.Screen name="Settings">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><SettingsScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="Account">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><AccountScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="Security">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><SecurityScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="BookingHistory">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><BookingHistoryScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="Preferences">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><PreferencesScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="Location">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><LocationScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="Notifications">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><NotificationsScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="Display">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><DisplayScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="About">
        {(props) => <ScreenContainer style={{ paddingHorizontal: 0 }}><AboutScreen {...props} /></ScreenContainer>}
      </ProfileStack.Screen>

      <ProfileStack.Screen name="CreateEvent">
        {(props) => <CreateEventScreen {...props} onBack={() => props.navigation.goBack()} />}
      </ProfileStack.Screen>
    </ProfileStack.Navigator>
  );
}

  // Host Flow
  function HostNavigator({ navigation: rootNavigation }: any) {
    return (
      <HostStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
        <HostStack.Screen name="HostHome">
          {(props) => (
            <EventHostScreen
              {...props}
              events={sampleEvents}
              onOpenEvent={(event) => rootNavigation.navigate('EventDetails', { event })}
              onCreateEvent={() => props.navigation.navigate('CreateEvent')}
              onCreateStore={() => props.navigation.navigate('CreateStore')}
            />
          )}
        </HostStack.Screen>
        <HostStack.Screen name="CreateEvent">
          {(props) => <CreateEventScreen {...props} onBack={() => props.navigation.goBack()} />}
        </HostStack.Screen>
        <HostStack.Screen name="CreateStore">
          {(props) => <CreateStoreScreen {...props} onBack={() => props.navigation.goBack()} />}
        </HostStack.Screen>
      </HostStack.Navigator>
    );
  }

  // Bottom Tab Navigation - Uses BottomTabBar Component
  function TabNavigator() {
    // Filter sampleEvents to only show interested ones on the MyEventsScreen ("Plans") tab
    const interestedEvents = sampleEvents.filter(e => interestedEventIds.includes(e.id));

    return (
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigation }) => {
          const currentRouteName = state.routes[state.index].name as TabName;
          return (
            <BottomTabBar
              active={currentRouteName}
              onChange={(name) => navigation.navigate(name)}
            />
          );
        }}
      >
        <Tab.Screen name="Home">
          {(props) => <HomeScreen {...props} events={sampleEvents} onOpenEvent={(e) => props.navigation.navigate('EventDetails', { event: e })} onSeeAll={() => props.navigation.navigate('Search')} />}
        </Tab.Screen>
        <Tab.Screen name="Search">
          {(props) => <SearchScreen {...props} events={sampleEvents} onOpenEvent={(e) => props.navigation.navigate('EventDetails', { event: e })} />}
        </Tab.Screen>
        <Tab.Screen name="Plans">
          {(props) => <MyEventsScreen {...props} events={interestedEvents} onOpenEvent={(e) => props.navigation.navigate('EventDetails', { event: e })} />}
        </Tab.Screen>
        <Tab.Screen name="Host" component={HostNavigator} />
        <Tab.Screen name="Profile" component={ProfileNavigator} />
      </Tab.Navigator>
    );
  }

  // Root Stack Navigator to allow pushing EventDetails over the Tab bar
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <RootStack.Screen name="MainTabs" component={TabNavigator} />
      <RootStack.Screen name="EventDetails">
        {({ route, navigation }: any) => {
          const { event } = route.params || {};
          const selectedEvent = event || sampleEvents[0];
          const isInterested = interestedEventIds.includes(selectedEvent.id);

          return (
            <ScreenContainer>
              <EventDetailsScreen
                event={selectedEvent}
                interested={isInterested}
                onToggleInterested={() => {
                  setInterestedEventIds(prev => 
                    prev.includes(selectedEvent.id) 
                      ? prev.filter(id => id !== selectedEvent.id) 
                      : [...prev, selectedEvent.id]
                  );
                }}
                onBack={() => navigation.goBack()}
              />
            </ScreenContainer>
          );
        }}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}