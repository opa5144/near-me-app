
import { StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search events...', editable = true }: SearchBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.text }]}
        editable={editable}
        returnKeyType="search"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 46, borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginBottom: 14 },
  input: { paddingHorizontal: 14, fontSize: 12 },
});
