import { Pressable, StyleSheet, Text } from 'react-native';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

export default function AppButton({
  title,
  onPress,
  width = 200,
  height = 50,
  backgroundColor = '#007AFF',
}: AppButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.button,
        {
          width,
          height,
          backgroundColor,
        },
      ]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },

  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});