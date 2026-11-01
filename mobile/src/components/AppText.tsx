import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../data/theme';

interface AppTextProps extends TextProps {
  variant?: keyof typeof typography;
  color?: string;
}

export function AppText({ 
  variant = 'bodyMedium', 
  color, 
  style, 
  children, 
  accessibilityRole = 'text',
  ...props 
}: AppTextProps) {
  const { colors } = useTheme();

  return (
    <Text 
      allowFontScaling={true}
      accessibilityRole={accessibilityRole}
      style={[
        typography[variant], 
        { color: color || colors.text }, 
        style
      ]} 
      {...props}
    >
      {children}
    </Text>
  );
}