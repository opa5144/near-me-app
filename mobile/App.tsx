import { useEffect, useState } from 'react';
import { registerSessionExpiredHandler } from './src/api/client';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';

import { LoginScreen } from './src/screens/auth/LoginScreen';
import { SignupScreen } from './src/screens/auth/SignupScreen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

function MainApp() {
  // This controls the login/signup flow versus the authenticated event screens.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authRoute, setAuthRoute] = useState<'login' | 'signup'>('login');
  const { colors, theme } = useTheme();

  // The API client calls this when the server rejects an expired session.
  // Leaving AppNavigator also unmounts its shared event data before another login.
  useEffect(() => registerSessionExpiredHandler(() => {
    setIsLoggedIn(false);
    setAuthRoute('login');
  }), []);

  // Create a custom navigation theme matching your ThemeContext colors
  const navTheme = theme === 'dark' ? {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text }
  } : {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text }
  };

  return (
    <NavigationContainer theme={navTheme}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        {!isLoggedIn ? (
          authRoute === 'login' ? (
            <LoginScreen
              onLogin={() => setIsLoggedIn(true)}
              onNavigateToSignup={() => setAuthRoute('signup')}
            />
          ) : (
            <SignupScreen
              onBackToLogin={() => setAuthRoute('login')}
            />
          )
        ) : (
          <AppNavigator />
        )}
      </SafeAreaView>
    </NavigationContainer>
  );
}

// Both the authentication screens and event screens read the same theme provider.
export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});