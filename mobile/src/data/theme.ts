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