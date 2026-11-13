import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { isAxiosError } from 'axios';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { FieldError } from '../../components/FieldError';
import { useTheme } from '../../context/ThemeContext';
import { beginMfaSetup, changePassword, confirmMfaSetup, deleteOwnAccount, disableMfa, fetchSecurityStatus, regenerateRecoveryCodes } from '../../api/security';
import type { MfaSetupResult, SecurityErrorField, SecurityErrorResponse, SecurityProof, SecurityStatus } from '../../api/security';

type Form = Record<SecurityErrorField, string>;
type FieldErrors = Partial<Record<SecurityErrorField | 'setupCode', string>>;
const EMPTY_FORM: Form = { currentPassword: '', newPassword: '', confirmPassword: '', code: '', recoveryCode: '', confirmation: '' };
const ERROR_FIELDS: SecurityErrorField[] = ['currentPassword', 'newPassword', 'confirmPassword', 'code', 'recoveryCode', 'confirmation'];
type SecurityFieldProps = Omit<TextInputProps, 'secureTextEntry' | 'editable'> & { label: string; error?: string; secret?: boolean; disabled?: boolean };

// Pair each field with its own error and an accessible password visibility control.
function SecurityField({ label, error, secret = false, disabled = false, style, ...inputProps }: SecurityFieldProps) {
  const { colors, theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      </View>
      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: error ? errorColor : colors.border }]}>
        <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} {...inputProps} editable={!disabled} secureTextEntry={secret && !visible} style={[styles.input, { color: colors.text }, style]} />
        {secret && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onPress={() => setVisible(current => !current)} disabled={disabled} style={styles.visibilityButton}><Text style={[styles.visibilityText, { color: colors.primary }]}>{visible ? 'Hide' : 'Show'}</Text></TouchableOpacity>}
      </View>
      <FieldError message={error} />
    </View>
  );
}
const secondsUntil = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function SecurityScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [form, setForm] = useState<Form>({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [proofMode, setProofMode] = useState<'code' | 'recoveryCode'>('code');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [setup, setSetup] = useState<MfaSetupResult | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesSaved, setCodesSaved] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const viewVersion = useRef(0);
  const busyRef = useRef(false);
  const pendingRequest = useRef<Promise<unknown> | null>(null);
  const recoveryRef = useRef<string[]>([]);
  recoveryRef.current = recoveryCodes;

  const wipeDraft = useCallback(() => {
    setForm({ ...EMPTY_FORM }); setSetup(null); setSetupCode(''); setProofMode('code'); setErrors({});
  }, []);

  // Cancel reads on blur and discard secrets. A write may still install a rotated
  // session, so a later visit waits for that write before loading current status.
  useFocusEffect(useCallback(() => {
    const version = ++viewVersion.current;
    const controller = new AbortController();
    setIsLoading(true); setStatus(null); setLoadError(null); setFailure(null); setMessage(null); wipeDraft();
    async function loadSecurity() {
      try {
        await pendingRequest.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const result = await fetchSecurityStatus(controller.signal);
        if (viewVersion.current !== version) return;
        setStatus(result);
        setCooldownUntil(result.mfaLockedUntil ? Date.parse(result.mfaLockedUntil) || 0 : 0);
      } catch (error: unknown) {
        if (viewVersion.current !== version || controller.signal.aborted) return;
        const data = isAxiosError<SecurityErrorResponse>(error) ? error.response?.data : undefined;
        setLoadError(typeof data?.message === 'string' ? data.message : 'Unable to load security settings. Please try again.');
        if (data?.lockedUntil) setCooldownUntil(Date.parse(data.lockedUntil) || 0);
        else if (typeof data?.retryAfterSeconds === 'number') setCooldownUntil(Date.now() + Math.max(0, data.retryAfterSeconds) * 1000);
      } finally {
        if (viewVersion.current === version) { setIsLoading(false); setIsBusy(false); setNow(Date.now()); }
      }
    }
    void loadSecurity();
    return () => { ++viewVersion.current; controller.abort(); wipeDraft(); setRecoveryCodes([]); setCodesSaved(false); };
  }, [loadAttempt, wipeDraft]));

  // Use server deadlines, not a local failure counter, and unlock retries at expiry.
  useEffect(() => {
    const deadline = Math.max(cooldownUntil, setup ? Date.parse(setup.expiresAt) || 0 : 0);
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => { const current = Date.now(); setNow(current); if (current >= deadline) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil, setup?.expiresAt]);

  // Do not lose a security-write response or one-time recovery codes to navigation.
  usePreventRemove(isBusy || recoveryCodes.length > 0, () => {
    setMessage(recoveryRef.current.length ? 'Save your recovery codes and confirm before leaving.' : 'Please wait for the security change to finish.');
  });
  useEffect(() => {
    const parent = navigation.getParent?.();
    return parent?.addListener('tabPress', (event: { preventDefault: () => void }) => {
      if (busyRef.current || recoveryRef.current.length) event.preventDefault();
    });
  }, [navigation]);

  const cooldownSeconds = secondsUntil(cooldownUntil, now);
  const setupSeconds = setup ? secondsUntil(Date.parse(setup.expiresAt) || 0, now) : 0;
  const blocked = isLoading || isBusy || cooldownSeconds > 0 || recoveryCodes.length > 0;

  function editField(field: SecurityErrorField, value: string) {
    setForm(current => ({ ...current, [field]: value }));
    // No validation runs while typing; the next field exit checks the new value.
    setErrors(current => { const next = { ...current }; delete next[field]; return next; });
    setFailure(null); setMessage(null);
  }
  function validateField(field: SecurityErrorField | 'setupCode', value: string): string | undefined {
    if (field === 'currentPassword') {
      if (!value) return 'Current password is required.';
      if (Array.from(value).length > 128) return 'Use 128 characters or fewer.';
    } else if (field === 'newPassword') {
      if (!value) return 'New password is required.';
      const length = Array.from(value).length;
      if (length < 15 || length > 128) return 'Use 15 to 128 characters.';
    } else if (field === 'confirmPassword') {
      if (!value) return 'Confirm your new password.';
      if (value !== form.newPassword) return 'Passwords do not match.';
    } else if (field === 'code' && !/^\d{6}$/.test(value)) return 'Enter the six-digit code.';
    else if (field === 'recoveryCode' && !value.trim()) return 'Enter a recovery code.';
    else if (field === 'confirmation' && value !== 'DELETE') return 'Type DELETE exactly to confirm.';
    else if (field === 'setupCode') {
      if (!setup || Date.now() >= Date.parse(setup.expiresAt)) return 'Setup expired. Cancel and start again.';
      if (!/^\d{6}$/.test(value)) return 'Enter the six-digit code from your authenticator.';
    }
    return undefined;
  }
  function showFieldError(field: SecurityErrorField | 'setupCode') {
    // Leaving a proof field checks its shape, never its validity with the server.
    const message = validateField(field, field === 'setupCode' ? setupCode : form[field]);
    if (message) setErrors(current => ({ ...current, [field]: message }));
  }
  function selectProofMode(mode: 'code' | 'recoveryCode') {
    setProofMode(mode); setForm(current => ({ ...current, code: '', recoveryCode: '' }));
    setErrors(current => { const next = { ...current }; delete next.code; delete next.recoveryCode; return next; }); setFailure(null);
  }
  function proofErrors(): FieldErrors {
    const next: FieldErrors = {};
    const passwordError = validateField('currentPassword', form.currentPassword);
    if (passwordError) next.currentPassword = passwordError;
    if (status?.mfaEnabled) {
      const message = validateField(proofMode, form[proofMode]);
      if (message) next[proofMode] = message;
    }
    return next;
  }
  function proofPayload(): SecurityProof {
    return {
      // Spaces are part of the password; never trim it.
      currentPassword: form.currentPassword,
      ...(status?.mfaEnabled ? proofMode === 'code' ? { code: form.code } : { recoveryCode: form.recoveryCode.trim() } : {}),
    };
  }
  function consumeRecoveryProof() {
    if (status?.mfaEnabled && proofMode === 'recoveryCode') setStatus(current => current ? { ...current, recoveryCodesRemaining: Math.max(0, current.recoveryCodesRemaining - 1) } : current);
  }
  function showFailure(error: unknown, scope: 'main' | 'setup') {
    const data = isAxiosError<SecurityErrorResponse>(error) ? error.response?.data : undefined;
    const next: FieldErrors = {};
    for (const field of ERROR_FIELDS) {
      const text = data?.errors?.[field];
      if (typeof text === 'string' && text) next[scope === 'setup' && field === 'code' ? 'setupCode' : field] = text;
    }
    setErrors(next);
    setFailure(Object.keys(next).length ? null : typeof data?.message === 'string' ? data.message : 'Unable to complete this security change. Check your connection and try again.');
    const locked = data?.lockedUntil ? Date.parse(data.lockedUntil) || 0 : 0;
    const retry = typeof data?.retryAfterSeconds === 'number' ? Date.now() + Math.max(0, data.retryAfterSeconds) * 1000 : 0;
    if (locked || retry) setCooldownUntil(Math.max(locked, retry));
  }

  // Ref guards stop rapid taps; version guards stop late responses updating a
  // later visit. API helpers own session rotation even if this view has closed.
  async function runAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void, scope: 'main' | 'setup' = 'main') {
    if (busyRef.current || !status || isLoading || Date.now() < cooldownUntil || recoveryRef.current.length) return;
    busyRef.current = true; setIsBusy(true); setFailure(null); setMessage(null); setErrors({});
    const version = viewVersion.current;
    let request: Promise<T> | null = null;
    try {
      request = action(); pendingRequest.current = request;
      const result = await request;
      if (viewVersion.current !== version) return;
      setCooldownUntil(0); onSuccess(result);
    } catch (error: unknown) {
      if (viewVersion.current === version) showFailure(error, scope);
    } finally {
      if (pendingRequest.current === request) pendingRequest.current = null;
      busyRef.current = false;
      if (viewVersion.current === version) setIsBusy(false);
    }
  }
  function validateProof(): boolean {
    const next = proofErrors(); setErrors(next); setFailure(null);
    return Object.keys(next).length === 0;
  }
  function handlePasswordChange() {
    const next = proofErrors();
    for (const field of ['newPassword', 'confirmPassword'] as const) {
      const message = validateField(field, form[field]);
      if (message) next[field] = message;
    }
    setErrors(next); setFailure(null);
    if (Object.keys(next).length) return;
    const payload = { ...proofPayload(), newPassword: form.newPassword, confirmPassword: form.confirmPassword };
    void runAction(() => changePassword(payload), result => { consumeRecoveryProof(); wipeDraft(); setMessage(result.message || 'Password updated. Other devices have been signed out.'); });
  }
  function handleBeginSetup() {
    if (!validateProof()) return;
    const proof = proofPayload();
    void runAction(() => beginMfaSetup(proof), result => {
      consumeRecoveryProof(); setForm({ ...EMPTY_FORM }); setSetup(result); setSetupCode(''); setQrFailed(false);
    });
  }
  function showRecoveryCodes(codes: string[]) {
    wipeDraft(); setRecoveryCodes(codes); setCodesSaved(false);
    setStatus(current => current ? { ...current, mfaEnabled: true, recoveryCodesRemaining: codes.length, mfaLockedUntil: null } : current);
  }
  function handleConfirmSetup() {
    if (!setup) return;
    const message = validateField('setupCode', setupCode);
    if (message) { setErrors({ setupCode: message }); return; }
    const token = setup.setupToken; const code = setupCode;
    void runAction(() => confirmMfaSetup(token, code), result => showRecoveryCodes(result.recoveryCodes), 'setup');
  }
  function handleDisable() {
    if (!validateProof() || blocked) return;
    const proof = proofPayload();
    Alert.alert('Disable two-factor authentication?', 'Future sign-ins will only require your password.', [
      { text: 'Cancel', style: 'cancel', onPress: wipeDraft },
      { text: 'Disable MFA', style: 'destructive', onPress: () => {
        void runAction(() => disableMfa(proof), result => { wipeDraft(); setStatus(current => current ? { ...current, mfaEnabled: false, recoveryCodesRemaining: 0, mfaLockedUntil: null } : current); setMessage(result.message || 'Two-factor authentication is disabled.'); });
      } },
    ]);
  }
  function handleRegenerate() {
    if (!validateProof() || blocked) return;
    const proof = proofPayload();
    Alert.alert('Replace recovery codes?', 'Your previous recovery codes will stop working. Save the new codes before leaving this screen.', [
      { text: 'Cancel', style: 'cancel', onPress: wipeDraft },
      { text: 'Replace codes', onPress: () => { void runAction(() => regenerateRecoveryCodes(proof), result => showRecoveryCodes(result.recoveryCodes)); } },
    ]);
  }
  function handleDelete() {
    const next = proofErrors();
    const message = validateField('confirmation', form.confirmation);
    if (message) next.confirmation = message;
    setErrors(next); setFailure(null);
    if (Object.keys(next).length || blocked) return;
    const proof = proofPayload();
    Alert.alert('Permanently delete your account?', 'Your account will be permanently closed. Your events will be hidden and retained as read-only archives. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel', onPress: wipeDraft },
      { text: 'Delete account', style: 'destructive', onPress: () => { void runAction(() => deleteOwnAccount({ ...proof, confirmation: 'DELETE' }), () => wipeDraft()); } },
    ]);
  }
  function dismissRecoveryCodes() {
    if (!codesSaved) return;
    setRecoveryCodes([]); setCodesSaved(false); setMessage('Keep your recovery codes somewhere private and accessible.');
  }

  return (
    <>
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
        <AppButton title="Back to Settings" variant="quiet" alignment="left" minHeight={44} onPress={() => { if (!busyRef.current && !recoveryRef.current.length) navigation.goBack(); }} disabled={isBusy || recoveryCodes.length > 0} style={styles.backButton} textStyle={styles.backText} />
        <ScreenHeader title="Security & Login" subtitle="Manage your password, two-factor authentication, and account." />
        {cooldownSeconds > 0 && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.feedback, { color: errorColor }]}>Security verification is temporarily locked. Try again in {clockText(cooldownSeconds)}.</Text>}
        {isLoading ? (
          <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={[styles.note, { color: colors.muted }]}>Loading security settings...</Text></View>
        ) : loadError ? (
          <View style={styles.status}><Text accessibilityRole="alert" style={[styles.note, { color: errorColor }]}>{loadError}</Text><AppButton title="Retry" disabled={cooldownSeconds > 0} onPress={() => setLoadAttempt(current => current + 1)} /></View>
        ) : status ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Verify your identity</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Enter your current password before making a security change.</Text>
            <SecurityField label="Current Password" error={errors.currentPassword} value={form.currentPassword} onChangeText={value => editField('currentPassword', value)} onBlur={() => showFieldError('currentPassword')} secret disabled={isBusy} textContentType="password" />
            {status.mfaEnabled && (
              <>
                <View style={styles.modeRow}>
                  <AppButton title="Authenticator code" variant={proofMode === 'code' ? 'primary' : 'secondary'} disabled={isBusy} onPress={() => selectProofMode('code')} style={styles.modeButton} textStyle={styles.modeText} />
                  <AppButton title="Recovery code" variant={proofMode === 'recoveryCode' ? 'primary' : 'secondary'} disabled={isBusy} onPress={() => selectProofMode('recoveryCode')} style={styles.modeButton} textStyle={styles.modeText} />
                </View>
                {proofMode === 'code' ? <SecurityField label="Authenticator Code" error={errors.code} value={form.code} onChangeText={value => editField('code', value.replace(/\D/g, '').slice(0, 6))} onBlur={() => showFieldError('code')} keyboardType="number-pad" textContentType="oneTimeCode" placeholder="6 digits" disabled={isBusy} /> : <SecurityField label="Recovery Code" error={errors.recoveryCode} value={form.recoveryCode} onChangeText={value => editField('recoveryCode', value.slice(0, 128))} onBlur={() => showFieldError('recoveryCode')} placeholder="One unused recovery code" autoCapitalize="characters" secret disabled={isBusy} />}
                <Text style={[styles.note, { color: colors.muted }]}>Recovery codes work once. {status.recoveryCodesRemaining} remaining.</Text>
              </>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Password</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Use 15 to 128 characters. Other devices will be signed out.</Text>
            <SecurityField label="New Password" error={errors.newPassword} value={form.newPassword} onChangeText={value => editField('newPassword', value)} onBlur={() => showFieldError('newPassword')} secret disabled={isBusy} textContentType="newPassword" />
            <SecurityField label="Confirm New Password" error={errors.confirmPassword} value={form.confirmPassword} onChangeText={value => editField('confirmPassword', value)} onBlur={() => showFieldError('confirmPassword')} secret disabled={isBusy} textContentType="newPassword" />
            <AppButton title="Update Password" onPress={handlePasswordChange} disabled={blocked || !!setup} style={styles.actionButton} />

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Two-Factor Authentication (MFA)</Text>
                <Text style={[styles.note, { color: colors.muted }]}>{status.mfaEnabled ? 'Enabled. Sign in with a password and authenticator or recovery code.' : 'Add an authenticator code to protect sign-in.'}</Text>
              </View>
              <Switch accessibilityLabel="Two-factor authentication" value={status.mfaEnabled} disabled={blocked || !!setup} onValueChange={() => status.mfaEnabled ? handleDisable() : handleBeginSetup()} trackColor={{ true: colors.primary }} />
            </View>
            {!setup && (status.mfaEnabled ? (
              <View style={styles.actions}>
                <AppButton title="Replace Authenticator" variant="secondary" onPress={handleBeginSetup} disabled={blocked} />
                <AppButton title="Replace Recovery Codes" variant="secondary" onPress={handleRegenerate} disabled={blocked} />
                <AppButton title="Disable MFA" variant="quiet" onPress={handleDisable} disabled={blocked} />
              </View>
            ) : <AppButton title="Set Up Authenticator" onPress={handleBeginSetup} disabled={blocked} style={styles.actionButton} />)}

            {setup && (
              <View style={[styles.setupBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Confirm your authenticator</Text>
                <Text style={[styles.note, { color: colors.muted }]}>Scan this QR code with an authenticator app, or enter the setup key manually on this phone. Your current MFA setting stays in effect until confirmation.</Text>
                {!qrFailed && <Image source={{ uri: setup.qrCodeDataUrl }} accessibilityLabel="Authenticator setup QR code" style={styles.qrImage} resizeMode="contain" onError={() => setQrFailed(true)} />}
                {qrFailed && <Text style={[styles.note, { color: errorColor }]}>The QR code could not be displayed. Use the setup key below.</Text>}
                <Text style={[styles.label, { color: colors.text }]}>Setup key</Text>
                <Text selectable style={[styles.secret, { color: colors.text }]}>{setup.secret}</Text>
                <Text style={[styles.note, { color: setupSeconds ? colors.muted : errorColor }]}>{setupSeconds ? `Setup expires in ${clockText(setupSeconds)}.` : 'Setup expired. Cancel and start again.'}</Text>
                <SecurityField label="New Authenticator Code" error={errors.setupCode} value={setupCode} onChangeText={value => { setSetupCode(value.replace(/\D/g, '').slice(0, 6)); setErrors(current => ({ ...current, setupCode: undefined })); setFailure(null); }} onBlur={() => showFieldError('setupCode')} keyboardType="number-pad" textContentType="oneTimeCode" placeholder="6 digits" disabled={isBusy} />
                <AppButton title="Confirm Authenticator" onPress={handleConfirmSetup} disabled={blocked || !setupSeconds} style={styles.actionButton} />
                <AppButton title="Cancel Setup" variant="quiet" disabled={isBusy} onPress={() => { wipeDraft(); setFailure(null); setMessage(null); }} />
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Delete Account</Text>
            <Text style={[styles.note, { color: colors.muted }]}>This permanently closes your account. Your events will be hidden and kept as read-only archives. Enter your password{status.mfaEnabled ? ' and verification code' : ''} above, then type DELETE below.</Text>
            <SecurityField label="Deletion Confirmation" error={errors.confirmation} value={form.confirmation} onChangeText={value => editField('confirmation', value)} onBlur={() => showFieldError('confirmation')} placeholder="DELETE" autoCapitalize="characters" disabled={isBusy} />
            <AppButton title="Delete Account Permanently" variant="secondary" onPress={handleDelete} disabled={blocked || !!setup} style={styles.deleteButton} textStyle={{ color: errorColor }} />
            {isBusy && <ActivityIndicator accessibilityLabel="Saving security change" color={colors.primary} style={styles.feedback} />}
            {failure && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.feedback, { color: errorColor }]}>{failure}</Text>}
            {message && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.primary }]}>{message}</Text>}
          </>
        ) : null}
      </ScrollView>
      {/* Native modal also covers custom tab buttons that navigate without tabPress. */}
      <Modal transparent visible={isBusy && recoveryCodes.length === 0} animationType="fade" onRequestClose={() => {}}>
        <View style={styles.busyOverlay}>
          <View accessibilityViewIsModal style={[styles.busyPanel, { backgroundColor: colors.surface }]}>
            <ActivityIndicator color={colors.primary} />
            <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.text }]}>Please wait while your security change is saved.</Text>
          </View>
        </View>
      </Modal>
      <Modal visible={recoveryCodes.length > 0} animationType="slide" onRequestClose={dismissRecoveryCodes}>
        <ScrollView contentContainerStyle={[styles.recoveryContent, { backgroundColor: colors.background }]}>
          <ScreenHeader title="Save Your Recovery Codes" subtitle="These codes are shown once. Store them somewhere private before continuing." />
          <Text style={[styles.note, { color: colors.muted }]}>Each code can replace an authenticator code once. New codes invalidate all previous recovery codes.</Text>
          <Text selectable accessibilityLabel="Your one-time recovery codes" style={[styles.recoveryList, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}>{recoveryCodes.join('\n')}</Text>
          <View style={styles.row}>
            <Text style={[styles.note, styles.rowCopy, { color: colors.text }]}>I have saved these recovery codes somewhere safe.</Text>
            <Switch accessibilityLabel="I have saved my recovery codes" value={codesSaved} onValueChange={setCodesSaved} trackColor={{ true: colors.primary }} />
          </View>
          <AppButton title="Done" onPress={dismissRecoveryCodes} disabled={!codesSaved} style={styles.actionButton} />
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 40, flexGrow: 1 },
  backButton: { paddingHorizontal: 8, marginLeft: -8, marginBottom: 8 },
  backText: { fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 10 },
  field: { marginTop: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700' },
  inputRow: { borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, padding: 12, fontSize: 14, minHeight: 46 },
  visibilityButton: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  visibilityText: { fontSize: 12, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 19 },
  actionButton: { marginTop: 16 },
  divider: { height: 1, marginVertical: 22 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  modeButton: { flex: 1 },
  modeText: { fontSize: 12 },
  actions: { gap: 10, marginTop: 16 },
  status: { paddingVertical: 32, gap: 16 },
  feedback: { marginTop: 16, fontSize: 13, lineHeight: 20 },
  setupBox: { marginTop: 16, padding: 14, borderWidth: 1, borderRadius: 12 },
  qrImage: { width: 224, height: 224, maxWidth: '100%', alignSelf: 'center', marginVertical: 16, backgroundColor: '#fff' },
  secret: { fontSize: 15, lineHeight: 24, marginVertical: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  deleteButton: { marginTop: 16, borderWidth: 1, borderColor: '#C62828' },
  recoveryContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 40 },
  busyOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000066' },
  busyPanel: { padding: 24, borderRadius: 12, alignItems: 'center', gap: 16 },
  recoveryList: { borderWidth: 1, borderRadius: 10, padding: 18, fontSize: 16, lineHeight: 30, marginVertical: 24, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
