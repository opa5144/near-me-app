import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { LoginScreen } from './src/screens/auth/LoginScreen';
import { SignupScreen } from './src/screens/auth/SignupScreen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

function MainApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authRoute, setAuthRoute] = useState<'login' | 'signup'>('login');
  const { colors, theme } = useTheme();

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
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

  return (
    <NavigationContainer>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <AppNavigator />
      </SafeAreaView>
    </NavigationContainer>
  );
}

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