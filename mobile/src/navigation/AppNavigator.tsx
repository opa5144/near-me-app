import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBar, TabName } from '../components/BottomTabBar';

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

// Profile -> Settings -> Specific Settings Flow
function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={UserProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="Account" component={AccountScreen} />
      <ProfileStack.Screen name="Security" component={SecurityScreen} />
      <ProfileStack.Screen name="BookingHistory" component={BookingHistoryScreen} />
      <ProfileStack.Screen name="Preferences" component={PreferencesScreen} />
      <ProfileStack.Screen name="Location" component={LocationScreen} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} />
      <ProfileStack.Screen name="Display" component={DisplayScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
    </ProfileStack.Navigator>
  );
}

// Host Flow
function HostNavigator({ navigation: rootNavigation }: any) {
  return (
    <HostStack.Navigator screenOptions={{ headerShown: false }}>
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
        {(props) => <MyEventsScreen {...props} events={sampleEvents} onOpenEvent={(e) => props.navigation.navigate('EventDetails', { event: e })} />}
      </Tab.Screen>
      <Tab.Screen name="Host" component={HostNavigator} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
  );
}

// Root Stack Navigator to allow pushing EventDetails over the Tab bar
export function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={TabNavigator} />
      <RootStack.Screen name="EventDetails">
        {({ route, navigation }: any) => {
          const { event } = route.params || {};
          return (
            <EventDetailsScreen
              event={event || sampleEvents[0]}
              interested={false}
              onToggleInterested={() => {}}
              onBack={() => navigation.goBack()}
            />
          );
        }}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}