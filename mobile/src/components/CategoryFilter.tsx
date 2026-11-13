
import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type CategoryFilterProps = {
  categories: string[];
  selectedCategory: string | string[];
  onSelectCategory: (category: string) => void;
};

export function CategoryFilter({ categories, selectedCategory, onSelectCategory }: CategoryFilterProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {categories.map(category => {
        const selected = Array.isArray(selectedCategory)
          ? (category === 'All' ? selectedCategory.length === 0 : selectedCategory.includes(category))
          : selectedCategory === category;

        return (
          <Pressable
            key={category}
            onPress={() => onSelectCategory(category)}
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
              {category}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  container: { gap: 8, paddingBottom: 20 },
  chip: { alignSelf: 'flex-start', flexGrow: 0, flexShrink: 0, overflow: 'hidden', borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
