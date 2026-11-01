import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export function ScreenContainer({ children, style, testID }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View 
      testID={testID}
      // Accessibility attributes treating this cleanly as a structural screen region
      accessible={false} 
      accessibilityRole="none"
      style={[
        { 
          flex: 1, 
          // Added a small +8px buffer so top headers/buttons never crowd the hardware notch/Dynamic Island
          paddingTop: insets.top + 8, 
          paddingBottom: insets.bottom, 
          paddingHorizontal: 16, // Ensures content doesn't clip on curved phone edges
          backgroundColor: colors.background 
        }, 
        style
      ]}
    >
      {children}
    </View>
  );
}