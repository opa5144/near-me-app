import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export type TabName = 'Home' | 'Search' | 'Plans' | 'Host' | 'Profile';
const tabs: { name: TabName; icon: string }[] = [
  { name: 'Home', icon: '⌂' }, 
  { name: 'Search', icon: '⌕' },
  { name: 'Plans', icon: '☆' }, 
  { name: 'Host', icon: '✎' }, 
  { name: 'Profile', icon: '👤' },
];

export function BottomTabBar({ active, onChange }: { active: TabName; onChange: (tab: TabName) => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {tabs.map(tab => {
        const selected = active === tab.name;
        return (
          <Pressable key={tab.name} onPress={() => onChange(tab.name)} style={styles.item} accessibilityRole="button" accessibilityState={{ selected }}>
            <Text style={[styles.icon, { color: colors.muted }, selected && { color: colors.primary, fontWeight: '700' }]}>{tab.icon}</Text>
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