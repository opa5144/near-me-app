
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isAxiosError } from 'axios';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';
import { fetchUserProfile, updateUserProfile } from '../../api/client';
import type { UpdateUserProfileRequest, UserProfileErrorResponse, UserProfileResponse } from '../../api/client';
import { AccountMaskedInput, formatPhoneNumber } from './AccountMaskedInput';
import type { AccountInputMask } from './AccountMaskedInput';

type AccountFieldName = keyof UpdateUserProfileRequest;
type AccountFieldErrors = Partial<Record<AccountFieldName, string>>;
const ACCOUNT_FIELDS: AccountFieldName[] = ['username', 'email', 'phone', 'dob', 'bio'];

type AccountFieldProps = TextInputProps & {
  label: string;
  error?: string;
  mask?: AccountInputMask;
};

// This label/input pair belongs to Account Settings and follows its active theme.
function AccountField({ label, error, mask, style, ...inputProps }: AccountFieldProps) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const fieldProps = {
    accessibilityLabel: label,
    placeholderTextColor: colors.muted,
    underlineColorAndroid: 'transparent',
    ...inputProps,
    style: [
      styles.input,
      { backgroundColor: colors.surface, borderColor: error ? errorColor : colors.border, color: colors.text },
      inputProps.multiline && styles.bioInput,
      style,
    ],
  };

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {error && (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.fieldError, { color: errorColor }]}>
            {error}
          </Text>
        )}
      </View>
      {mask ? (
        <AccountMaskedInput
          {...fieldProps}
          mask={mask}
          value={inputProps.value ?? ''}
          onChangeText={value => inputProps.onChangeText?.(value)}
        />
      ) : <TextInput {...fieldProps} />}
    </View>
  );
}

function accountValues(user: UserProfileResponse['user']): UpdateUserProfileRequest {
  const phone = user.phone ?? '';
  return {
    username: user.username,
    email: user.email,
    // Reformat a complete saved number without truncating invalid older records.
    phone: /^(?:\d{11}|\d \d{3}-\d{3}-\d{4})$/.test(phone) ? formatPhoneNumber(phone) : phone,
    dob: user.dob ?? '',
    bio: user.bio ?? '',
  };
}

function validateField(field: AccountFieldName, value: string): string | undefined {
  const trimmed = value.trim();
  if (field === 'username') {
    if (!trimmed) return 'Username is required.';
    if (value.length > 25) return 'Use 25 characters or fewer.';
    if (!/^[A-Za-z0-9]+$/.test(value)) return 'Use letters and numbers only.';
  } else if (field === 'email') {
    if (!trimmed) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
  } else if (field === 'phone') {
    if (trimmed && !/^\d \d{3}-\d{3}-\d{4}$/.test(trimmed)) return 'Enter all 11 digits.';
  } else if (field === 'dob' && trimmed) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'Use YYYY-MM-DD.';
    const date = new Date(trimmed + 'T00:00:00.000Z');
    if (trimmed.startsWith('0000-') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
      return 'Enter a real date.';
    }
    if (trimmed > new Date().toISOString().slice(0, 10)) return 'Date of birth cannot be in the future.';
  } else if (field === 'bio' && value.length > 2000) {
    return 'Use 2,000 characters or fewer.';
  }
  return undefined;
}

function validateForm(form: UpdateUserProfileRequest): AccountFieldErrors {
  const errors: AccountFieldErrors = {};
  for (const field of ACCOUNT_FIELDS) {
    const message = validateField(field, form[field]);
    if (message) errors[field] = message;
  }
  return errors;
}

function accountErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: unknown }>(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export function AccountScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [profile, setProfile] = useState<UserProfileResponse['user'] | null>(null);
  const [form, setForm] = useState<UpdateUserProfileRequest>({
    username: '', email: '', phone: '', dob: '', bio: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AccountFieldErrors>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const viewVersion = useRef(0);
  const pendingSave = useRef<Promise<UserProfileResponse> | null>(null);

  // Reload on opening this screen, without resetting the form while typing.
  useFocusEffect(useCallback(() => {
    const version = ++viewVersion.current;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    setProfile(null);
    setSaveError(null);
    setFieldErrors({});
    setSaveSuccess(false);
    setAvatarFailed(false);

    async function loadAccount() {
      try {
        // If the user left during a save, read only after that write has settled.
        await pendingSave.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const { user } = await fetchUserProfile(controller.signal);
        if (viewVersion.current !== version) return;
        const values = accountValues(user);
        setProfile(user);
        setForm(values);
        setFieldErrors(validateForm(values));
      } catch (error: unknown) {
        if (viewVersion.current !== version || controller.signal.aborted) return;
        setLoadError(accountErrorMessage(error, 'Unable to load your account. Please try again.'));
      } finally {
        if (viewVersion.current === version) {
          setIsLoading(false);
          setIsSaving(false);
        }
      }
    }

    void loadAccount();
    return () => {
      ++viewVersion.current;
      controller.abort();
    };
  }, [loadAttempt]));

  function showFieldError(field: AccountFieldName, value: string, edited = false) {
    setFieldErrors(current => {
      const next = { ...current };
      const message = validateField(field, value);
      if (message) next[field] = message;
      // A blur alone must not dismiss a server error such as an already-used email.
      else if (edited) delete next[field];
      return next;
    });
  }

  function editField(field: AccountFieldName, value: string) {
    setForm(current => ({ ...current, [field]: value }));
    showFieldError(field, value, true);
    setSaveError(null);
    setSaveSuccess(false);
  }

  async function handleSave() {
    // The ref also stops two fast taps before the disabled button rerenders.
    if (!profile || isLoading || isSaving || pendingSave.current) return;

    const errors = validateForm(form);
    setFieldErrors(errors);
    setSaveError(null);
    setSaveSuccess(false);
    if (Object.keys(errors).length) return;

    const changes: UpdateUserProfileRequest = {
      username: form.username.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      dob: form.dob.trim(),
      bio: form.bio.trim(),
    };
    setIsSaving(true);
    const version = viewVersion.current;
    const request = updateUserProfile(changes);
    pendingSave.current = request;

    try {
      const { user } = await request;
      if (viewVersion.current !== version) return;
      // Use the saved response so trimmed/normalized values match Atlas.
      setProfile(user);
      setForm(accountValues(user));
      setFieldErrors({});
      setSaveSuccess(true);
    } catch (error: unknown) {
      if (viewVersion.current !== version) return;
      // Keep the user's edits in place so a failed save can be corrected/retried.
      const serverErrors: AccountFieldErrors = {};
      if (isAxiosError<UserProfileErrorResponse>(error)) {
        for (const field of ACCOUNT_FIELDS) {
          const message = error.response?.data?.errors?.[field];
          if (typeof message === 'string' && message.trim()) serverErrors[field] = message;
        }
      }
      if (Object.keys(serverErrors).length) setFieldErrors(serverErrors);
      else setSaveError(accountErrorMessage(error, 'Unable to save your account. Please try again.'));
    } finally {
      if (pendingSave.current === request) pendingSave.current = null;
      if (viewVersion.current === version) setIsSaving(false);
    }
  }

  const initials = [profile?.firstName, profile?.lastName]
    .map(name => name?.trim().charAt(0) ?? '').join('').toUpperCase()
    || profile?.username.charAt(0).toUpperCase() || '?';

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <AppButton title="‹  Back to Settings" variant="quiet" alignment="left" minHeight={44} onPress={() => navigation.goBack()} disabled={isSaving} style={styles.backButton} textStyle={styles.backText} />
      <ScreenHeader title="Account Information" subtitle="View and update your personal details." />

      {isLoading ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.primary} />
          <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: colors.muted }]}>
            Loading your account...
          </Text>
        </View>
      ) : loadError ? (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={[styles.statusText, { color: errorColor }]}>{loadError}</Text>
          <AppButton title="Retry" onPress={() => setLoadAttempt(current => current + 1)} />
        </View>
      ) : profile ? (
        <>
          <View style={styles.avatarContainer}>
            {profile.avatarUrl && !avatarFailed ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} onError={() => setAvatarFailed(true)} accessibilityLabel="Your profile picture" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
              </View>
            )}
          </View>

          <AccountField
            label="Username"
            error={fieldErrors.username}
            value={form.username}
            onChangeText={value => editField('username', value)}
            onBlur={() => showFieldError('username', form.username)}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={25}
            editable={!isSaving}
          />
          <AccountField
            label="Email Address"
            error={fieldErrors.email}
            value={form.email}
            onChangeText={value => editField('email', value)}
            onBlur={() => showFieldError('email', form.email)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSaving}
          />
          <AccountField
            label="Phone Number"
            error={fieldErrors.phone}
            mask="phone"
            value={form.phone}
            onChangeText={value => editField('phone', value)}
            onBlur={() => showFieldError('phone', form.phone)}
            placeholder="1 234-567-8901"
            keyboardType="phone-pad"
            editable={!isSaving}
          />
          <AccountField
            label="Date of Birth"
            error={fieldErrors.dob}
            mask="dob"
            value={form.dob}
            onChangeText={value => editField('dob', value)}
            onBlur={() => showFieldError('dob', form.dob)}
            placeholder="YYYY-MM-DD"
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSaving}
          />
          <AccountField
            label="Bio"
            error={fieldErrors.bio}
            value={form.bio}
            onChangeText={value => editField('bio', value)}
            onBlur={() => showFieldError('bio', form.bio)}
            multiline
            numberOfLines={3}
            maxLength={2000}
            editable={!isSaving}
          />

          {saveError && <Text accessibilityRole="alert" style={[styles.feedback, { color: errorColor }]}>{saveError}</Text>}
          {saveSuccess && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.primary }]}>Your account information has been updated.</Text>}
          {isSaving && <ActivityIndicator style={styles.savingIndicator} color={colors.primary} />}
          <AppButton title={isSaving ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={isSaving} style={styles.saveButton} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, flexGrow: 1 },
  backButton: { paddingHorizontal: 8, marginLeft: -8, marginBottom: 8 },
  backText: { fontWeight: '800', fontSize: 14 },
  avatarContainer: { alignItems: 'center', marginVertical: 16 },
  avatarPlaceholder: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontWeight: 'bold', fontSize: 22 },
  avatarImage: { width: 70, height: 70, borderRadius: 35, marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 6, marginTop: 12 },
  label: { fontSize: 12, fontWeight: '700' },
  fieldError: { fontSize: 12, flexShrink: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13 },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  status: { paddingVertical: 32, gap: 16 },
  statusText: { fontSize: 14, textAlign: 'center' },
  feedback: { marginTop: 16, fontSize: 13 },
  savingIndicator: { marginTop: 16 },
  saveButton: { marginTop: 24 },
});
