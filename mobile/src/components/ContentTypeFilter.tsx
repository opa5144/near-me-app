
import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export type ContentType = 'All' | 'Stores' | 'Events';

type ContentTypeFilterProps = {
  selectedType: ContentType;
  onSelectType: (type: ContentType) => void;
};

const contentTypes: ContentType[] = ['All', 'Stores', 'Events'];

export function ContentTypeFilter({ selectedType, onSelectType }: ContentTypeFilterProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {contentTypes.map(type => {
        const selected = selectedType === type;

        return (
          <Pressable
            key={type}
            onPress={() => onSelectType(type)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.text }]}>
              {type}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  container: { gap: 8, paddingBottom: 12 },
  chip: { alignSelf: 'flex-start', flexGrow: 0, flexShrink: 0, overflow: 'hidden', borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
