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
      accessible={false}
      accessibilityRole="none"
      style={[
        {
          flex: 1,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 16,
          backgroundColor: colors.background
        },
        style
      ]}
    >
      {children}
    </View>
  );
}
