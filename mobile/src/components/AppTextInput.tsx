import {useState} from 'react'; 
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import type {TextInputProps} from 'react-native';
import { useTheme } from '../context/ThemeContext';

type AppTextInputProps = Omit< 
    TextInputProps,
    'secureTextEntry' | 'multiline'
    > & {
        label: string;
        isPassword?: boolean; 
        error?: string;
};


export function AppTextInput({ 
    label, // Label for the input field
    isPassword = false,
    error,
    style, // Allow custom styles to be passed in
    ...inputProps
}: AppTextInputProps) {
    const { colors, theme } = useTheme();
    const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
    const [showPassword, setShowPassword] = useState(false); // State to toggle password visibility

    return (
        <View style={styles.container}>
            <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
                {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: errorColor }]}>{error}</Text>}
            </View>
            
            <View style={[styles.field, { backgroundColor: colors.surface, borderColor: error ? errorColor : colors.border }]}>
                <TextInput 
                    placeholder={label}
                    placeholderTextColor={colors.muted}
                    accessibilityLabel={label}
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                    {...inputProps}
                    multiline={false}
                    secureTextEntry={isPassword && !showPassword} // Hide text if it's a password and showPassword is false
                    style={[styles.input, { color: colors.text }, style]} // Apply custom styles if provided
                />

                {isPassword && (
                    <Pressable 
                        onPress={()=>setShowPassword(current=>!current)}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                        style={styles.toggle}
                    >   
                        <Text style={[styles.toggleText, { color: colors.primary }]}>
                            {showPassword ? "Hide" : "Show"}
                        </Text>
                    </Pressable>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
    },
    labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, marginBottom: 8 },
    error: { fontSize: 12, flexShrink: 1 },
    field: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
    },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  toggle: {
    minWidth: 76,
    minHeight: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontWeight: '700',
  },
});
