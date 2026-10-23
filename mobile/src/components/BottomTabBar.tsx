import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../data/theme';

export type TabName = 'Home' | 'Search' | 'Plans' | 'Host' | 'Profile';
const tabs: { name: TabName; icon: string }[] = [
  { name: 'Home', icon: '⌂' }, 
  { name: 'Search', icon: '⌕' },
  { name: 'Plans', icon: '☆' }, 
  { name: 'Host', icon: '✎' }, 
  { name: 'Profile', icon: '👤' },
];

export function BottomTabBar({ active, onChange }: { active: TabName; onChange: (tab: TabName) => void }) {
  return (
    <View style={styles.bar}>
      {tabs.map(tab => {
        const selected = active === tab.name;
        return (
          <Pressable key={tab.name} onPress={() => onChange(tab.name)} style={styles.item} accessibilityRole="button" accessibilityState={{ selected }}>
            <Text style={[styles.icon, selected && styles.active]}>{tab.icon}</Text>
            <Text style={[styles.label, selected && styles.active]}>{tab.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 62, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', justifyContent: 'space-around' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { fontSize: 21, color: colors.muted, lineHeight: 23 },
  label: { fontSize: 9, color: colors.muted },
  active: { color: colors.primary, fontWeight: '700' },
});
