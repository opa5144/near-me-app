import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import AppButton from './src/components/AppButton';

export default function App() {
  const [message, setMessage] = useState('Press the button!');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Near Me</Text>

      <Text style={styles.message}>{message}</Text>

      <AppButton
        title="Press Me"
        onPress={() => setMessage('It works! 🎉')}
      />

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },

  message: {
    fontSize: 18,
    marginBottom: 20,
  },
});
