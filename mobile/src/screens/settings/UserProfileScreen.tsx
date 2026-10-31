import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export function UserProfileScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.buttonText}>⚙️ Open Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  button: { padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 },
  buttonText: { fontSize: 14, fontWeight: '600' }
});