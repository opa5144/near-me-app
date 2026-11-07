import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export type TabName = 'Home' | 'Search' | 'Plans' | 'Host' | 'Profile';
const tabs: { name: TabName; activeIcon: keyof typeof Ionicons.glyphMap; inactiveIcon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'Home', activeIcon: 'home', inactiveIcon: 'home-outline' },
  { name: 'Search', activeIcon: 'search', inactiveIcon: 'search-outline' },
  { name: 'Plans', activeIcon: 'star', inactiveIcon: 'star-outline' },
  { name: 'Host', activeIcon: 'create', inactiveIcon: 'create-outline' },
  { name: 'Profile', activeIcon: 'person', inactiveIcon: 'person-outline' },
];

export function BottomTabBar({ active, onChange }: { active: TabName; onChange: (tab: TabName) => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {tabs.map(tab => {
        const selected = active === tab.name;
        return (
          <Pressable key={tab.name} onPress={() => onChange(tab.name)} style={styles.item} accessibilityRole="button" accessibilityState={{ selected }}>
            <Ionicons name={selected ? tab.activeIcon : tab.inactiveIcon} size={22} color={selected ? colors.primary : colors.muted} />
            <Text style={[styles.label, { color: colors.muted }, selected && { color: colors.primary, fontWeight: '700' }]}>{tab.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 62, flexDirection: 'row', borderTopWidth: 1, alignItems: 'center', justifyContent: 'space-around' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { fontSize: 21, lineHeight: 23 },
  label: { fontSize: 9 },
});