import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { TextInputProps } from 'react-native';
import axios from 'axios';
import { AppButton } from '../../components/AppButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { AppTextInput } from '../../components/AppTextInput';
import { loginUser, verifyLoginMfa } from '../../api/client';
import type { LoginErrorResponse, LoginMfaChallengeResponse } from '../../api/client';

type LoginFieldName = 'email' | 'password' | 'code' | 'recoveryCode';
type FieldErrors = Partial<Record<LoginFieldName, string>>;
type LoginFieldProps = Omit<TextInputProps, 'secureTextEntry' | 'multiline'> & {
  label: string;
  isPassword?: boolean;
  error?: string;
};

// Shared input feedback stays directly beneath the complete password/input row.
function LoginField(props: LoginFieldProps) {
  return <AppTextInput {...props} />;
}

function validateField(field: LoginFieldName, value: string): string | undefined {
  if (field === 'email') {
    if (!value.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address.';
  }
  if (field === 'password' && !value) return 'Password is required.';
  if (field === 'code' && !/^\d{6}$/.test(value)) return 'Enter all six digits.';
  if (field === 'recoveryCode' && !value.trim()) return 'Enter a recovery code.';
  return undefined;
}

function countdown(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<LoginErrorResponse>(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (!error.response) return 'No response from the server. Please check your connection.';
  } else if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

type LoginScreenProps = {
  onLogin: () => void;
  onNavigateToSignup: () => void;
};

export function LoginScreen({ onLogin, onNavigateToSignup }: LoginScreenProps) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [form, setForm] = useState({ email: '', password: '' });
  const [challenge, setChallenge] = useState<LoginMfaChallengeResponse | null>(null);
  const [proofMode, setProofMode] = useState<'code' | 'recoveryCode'>('code');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const loginInFlight = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [lockedUntil, setLockedUntil] = useState(0);
  const lockedUntilRef = useRef(0);
  const cooldownSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const challengeSeconds = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000)) : 0;
  const clockRunning = Boolean(challenge) || cooldownSeconds > 0;

  // The timer only displays the server's restriction. Cancel, changing proof type,
  // and starting a fresh challenge never clear the server's account-level lock.
  useEffect(() => {
    if (!clockRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [clockRunning]);

  const returnToPassword = useCallback((message?: string) => {
    setChallenge(null);
    setCode('');
    setRecoveryCode('');
    setProofMode('code');
    setForm(current => ({ ...current, password: '' }));
    setFieldErrors({});
    setFormError(message ?? null);
    // Keep lockedUntil intact: replacing a challenge must not reset a cooldown.
  }, []);

  useEffect(() => {
    // Let an already-submitted request finish; the server decides whether its
    // proof arrived before expiry. An idle expired challenge cannot be submitted.
    if (challenge && !isLoggingIn && Date.parse(challenge.expiresAt) <= now) {
      returnToPassword('Your verification request expired. Log in again.');
    }
  }, [challenge, isLoggingIn, now, returnToPassword]);

  function applyServerCooldown(data: LoginErrorResponse | undefined) {
    const receivedAt = Date.now();
    const absolute = typeof data?.lockedUntil === 'string' ? Date.parse(data.lockedUntil) : 0;
    const seconds = data?.retryAfterSeconds;
    const relative = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? receivedAt + seconds * 1000 : 0;
    const deadline = Math.max(Number.isFinite(absolute) ? absolute : 0, relative);
    if (deadline > receivedAt) {
      lockedUntilRef.current = Math.max(lockedUntilRef.current, deadline);
      setLockedUntil(lockedUntilRef.current);
      setNow(receivedAt);
    }
  }

  function showRequestError(error: unknown, fallback: string, proofField?: 'code' | 'recoveryCode') {
    const errors: FieldErrors = {};
    if (axios.isAxiosError<LoginErrorResponse>(error)) {
      const data = error.response?.data;
      applyServerCooldown(data);
      for (const field of ['email', 'password', 'code', 'recoveryCode'] as const) {
        const message = data?.errors?.[field];
        if (typeof message === 'string' && message.trim()) errors[field] = message;
      }
      // Keep the same generic credentials message while marking the password field.
      if (!proofField && error.response?.status === 401 && !errors.email && !errors.password) {
        errors.password = errorMessage(error, fallback);
      }
      // Wrong proofs belong on the field used, even if the server only sends a message.
      if (proofField && (error.response?.status === 400 || error.response?.status === 403) && !errors[proofField]) {
        errors[proofField] = errorMessage(error, fallback);
      }
    }
    setFieldErrors(errors);
    setFormError(Object.keys(errors).length ? null : errorMessage(error, fallback));
  }

  // These are local format checks only; credentials and proofs go to the server
  // only when Login or Verify is pressed, so leaving a field uses no attempts.
  function showFieldError(field: LoginFieldName, value: string) {
    const message = validateField(field, value);
    if (message) setFieldErrors(current => ({ ...current, [field]: message }));
  }

  function clearFieldError(field: LoginFieldName) {
    setFieldErrors(current => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  async function handleLogin() {
    // Ref guards also cover two taps before the disabled button rerenders.
    if (loginInFlight.current || Date.now() < lockedUntilRef.current) return;
    const errors: FieldErrors = {};
    for (const field of ['email', 'password'] as const) {
      const message = validateField(field, form[field]);
      if (message) errors[field] = message;
    }
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    loginInFlight.current = true;
    setIsLoggingIn(true);
    let authenticated = false;
    try {
      const result = await loginUser({ email: form.email.trim(), password: form.password });
      if ('mfaRequired' in result) {
        // Password accepted, but no session/token is available until MFA succeeds.
        setChallenge(result);
        setProofMode('code');
        setCode('');
        setRecoveryCode('');
        setForm(current => ({ ...current, password: '' }));
        setNow(Date.now());
      } else {
        returnToPassword();
        authenticated = true;
      }
    } catch (error: unknown) {
      showRequestError(error, 'Unable to log in. Please try again.');
    } finally {
      loginInFlight.current = false;
      setIsLoggingIn(false);
    }
    if (authenticated) onLogin();
  }

  async function handleVerifyMfa() {
    if (!challenge || loginInFlight.current || Date.now() < lockedUntilRef.current) return;
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      returnToPassword('Your verification request expired. Log in again.');
      return;
    }
    const errors: FieldErrors = {};
    const message = validateField(proofMode, proofMode === 'code' ? code : recoveryCode);
    if (message) errors[proofMode] = message;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    loginInFlight.current = true;
    setIsLoggingIn(true);
    let authenticated = false;
    try {
      await verifyLoginMfa({ challengeToken: challenge.challengeToken,
        ...(proofMode === 'code' ? { code } : { recoveryCode: recoveryCode.trim() }) });
      returnToPassword();
      authenticated = true;
    } catch (error: unknown) {
      if (axios.isAxiosError<LoginErrorResponse>(error) &&
          (error.response?.status === 410 || error.response?.status === 401)) {
        applyServerCooldown(error.response?.data);
        returnToPassword(errorMessage(error, 'Your verification request expired. Log in again.'));
      } else {
        showRequestError(error, 'Unable to verify this code. Please try again.', proofMode);
      }
    } finally {
      loginInFlight.current = false;
      setIsLoggingIn(false);
    }
    // The helper installs the final token first. A challenge alone never opens the app.
    if (authenticated) onLogin();
  }

  function changeProofMode() {
    if (loginInFlight.current) return;
    setProofMode(current => current === 'code' ? 'recoveryCode' : 'code');
    setCode('');
    setRecoveryCode('');
    setFieldErrors({});
    setFormError(null);
  }

  const blocked = isLoggingIn || cooldownSeconds > 0;
  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled">
      <ScreenHeader title={challenge ? 'Verify your login' : 'Login'}
        subtitle={challenge ? 'Complete two-step verification to access your account.' : 'Login to your account.'} />

      {formError && <Text accessibilityRole="alert" style={[styles.notice, { color: errorColor }]}>{formError}</Text>}
      {cooldownSeconds > 0 && <Text style={[styles.notice, { color: errorColor }]}>
        Too many failed attempts. Try again in {countdown(cooldownSeconds)}.
      </Text>}

      {challenge ? <>
        <Text style={[styles.instructions, { color: colors.muted }]}>
          {proofMode === 'code' ? 'Enter the six-digit code from your authenticator app.' : 'Enter one unused recovery code.'}
        </Text>
        {proofMode === 'code' ? <LoginField
          label="Authenticator code" value={code} error={fieldErrors.code}
          onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); clearFieldError('code'); }}
          onBlur={() => showFieldError('code', code)}
          keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
          editable={!blocked} autoCorrect={false} autoCapitalize="none"
        /> : <LoginField
          label="Recovery code" value={recoveryCode} error={fieldErrors.recoveryCode}
          onChangeText={value => { setRecoveryCode(value.slice(0, 128)); clearFieldError('recoveryCode'); }}
          onBlur={() => showFieldError('recoveryCode', recoveryCode)}
          maxLength={128} autoComplete="off" autoCorrect={false} autoCapitalize="none" editable={!blocked}
        />}
        <Text style={[styles.instructions, { color: colors.muted }]}>
          This verification request expires in {countdown(challengeSeconds)}. Five failed verification attempts pause sign-in for five minutes.
        </Text>
        <AppButton title={isLoggingIn ? 'Verifying...' : 'Verify and log in'} onPress={handleVerifyMfa}
          disabled={blocked || (proofMode === 'code' ? code.length !== 6 : !recoveryCode.trim())} />
        <Pressable accessibilityRole="button" style={styles.link} onPress={changeProofMode} disabled={isLoggingIn}>
          <Text style={[styles.linkText, { color: colors.primary }]}>
            {proofMode === 'code' ? 'Use a recovery code instead' : 'Use an authenticator code instead'}
          </Text>
        </Pressable>
        <AppButton title="Cancel" variant="quiet" onPress={() => returnToPassword()} disabled={isLoggingIn} />
      </> : <>
        <LoginField label="Email" value={form.email} error={fieldErrors.email}
          onChangeText={value => { setForm(current => ({ ...current, email: value })); clearFieldError('email'); }}
          onBlur={() => showFieldError('email', form.email)}
          autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!blocked} />
        <LoginField label="Password" value={form.password} error={fieldErrors.password}
          onChangeText={value => { setForm(current => ({ ...current, password: value })); clearFieldError('password'); }}
          onBlur={() => showFieldError('password', form.password)}
          autoCapitalize="none" autoComplete="current-password" isPassword editable={!blocked} />
        <AppButton title={isLoggingIn ? 'Logging in...' : 'Login'} onPress={handleLogin}
          disabled={blocked || !form.email.trim() || !form.password} />
        <Pressable onPress={onNavigateToSignup} accessibilityRole="link" style={styles.link} disabled={blocked}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Don't have an account? Sign up</Text>
        </Pressable>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  instructions: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  notice: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  link: { alignItems: 'center', paddingVertical: 16 },
  linkText: { textDecorationLine: 'underline', fontSize: 14 },
});
