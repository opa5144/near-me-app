import {useState} from 'react'; 
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import type {TextInputProps} from 'react-native';
import {colors} from '../data/theme';

type AppTextInputProps = Omit< 
    TextInputProps,
    'secureTextEntry' | 'multiline'
    > & {
        label: string;
        isPassword?: boolean; 
};


export function AppTextInput({ 
    label, // Label for the input field
    isPassword = false,
    style, // Allow custom styles to be passed in
    ...inputProps
}: AppTextInputProps) {
    const [showPassword, setShowPassword] = useState(false); // State to toggle password visibility

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            
            <View style={styles.field}>
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
                    style={[styles.input, style]} // Apply custom styles if provided
                />

                {isPassword && (
                    <Pressable 
                        onPress={()=>setShowPassword(current=>!current)}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                        style={styles.toggle}
                    >   
                        <Text style={styles.toggleText}>
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
        color: colors.text,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    field: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: colors.surface,
    },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  toggle: {
    minWidth: 76,
    minHeight: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    color: colors.primary,
    fontWeight: '700',
  },
});