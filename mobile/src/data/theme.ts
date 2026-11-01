// Global Colors
export const lightColors = {
  background: '#FAF7FC',
  surface: '#FFFFFF',
  primary: '#6549EF',
  primaryLight: '#EEE9FF',
  text: '#211D2B',
  muted: '#777184',
  border: '#EEEAF2',
  pink: '#FCE8F0',
  green: '#E7F7EC',
};

export const darkColors = {
  background: '#120F1A',
  surface: '#1E192B',
  primary: '#8F78FF',
  primaryLight: '#2C224B',
  text: '#F3F0F8',
  muted: '#A59DB5',
  border: '#2F293E',
  pink: '#3B1E2B',
  green: '#1A3326',
};

export const colors = lightColors;

// Get colors based on theme selection
export const getThemeColors = (mode: 'light' | 'dark' | 'system') => {
  if (mode === 'dark') 
    return darkColors;
  else
    return lightColors;
};

// Global Typography
export const typography = {
  headerLarge: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700' as const,
  },
  headerMedium: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as const,
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
} as const;