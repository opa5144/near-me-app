import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { isAxiosError } from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkInEvent } from '../api/tickets';
import type { CheckInResponse } from '../api/tickets';
import { useTheme } from '../context/ThemeContext';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';

type Props = {
  visible: boolean;
  eventId: string;
  eventTitle: string;
  canCheckIn: boolean;
  unavailableMessage: string;
  onClose: () => void;
  onCheckedIn: (result: CheckInResponse) => void;
  onBusyChange?: (busy: boolean) => void;
};

type EntryMode = 'camera' | 'code' | null;
type CheckInError = { message?: string; errors?: { code?: string; qrPayload?: string }; retryAfterSeconds?: number };

// Camera and manual entry use the same authenticated verification endpoint. A
// decoded QR is only an input credential; the server decides who may check in.
export function CheckInOverlay({ visible, eventId, eventTitle, canCheckIn, unavailableMessage, onClose, onCheckedIn, onBusyChange }: Props) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [permission, requestPermission, readPermission] = useCameraPermissions();
  const [mode, setMode] = useState<EntryMode>(null);
  const [code, setCode] = useState('');
  const codeRef = useRef('');
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const permissionBusyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const version = useRef(0);
  const callbacks = useRef({ onCheckedIn, onBusyChange });
  callbacks.current = { onCheckedIn, onBusyChange };
  const successColor = theme === 'dark' ? '#69F0AE' : '#187943';
  const secondsUntilRetry = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const manualBlocked = retryAt > Date.now();

  useEffect(() => {
    ++version.current;
    busyRef.current = false;
    permissionBusyRef.current = false;
    callbacks.current.onBusyChange?.(false);
    setBusy(false); setPermissionBusy(false); setMode(null); setCode(''); codeRef.current = '';
    setError(null); setCameraError(null); setPaused(false); setResult(null); setClock(Date.now());
    if (visible) Keyboard.dismiss();
    return () => { ++version.current; };
  }, [visible, eventId]);

  useEffect(() => { setRetryAt(0); }, [eventId]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
      if (state === 'active') {
        setClock(Date.now());
        if (visible && mode === 'camera') {
          const current = version.current;
          void readPermission().then(response => {
            if (version.current === current && response.granted) setCameraError(null);
          }).catch(() => {
            if (version.current === current) setCameraError('Camera permission could not be checked. You can enter the attendee’s code instead.');
          });
        }
      }
    });
    return () => listener.remove();
  }, [visible, mode, readPermission]);

  useEffect(() => {
    if (!visible || retryAt <= Date.now()) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible, retryAt]);

  const close = () => {
    if (busyRef.current || permissionBusyRef.current) return;
    Keyboard.dismiss(); setMode(null); setCode(''); codeRef.current = ''; setResult(null); setError(null); setCameraError(null);
    onClose();
  };

  const validateCode = (value: string) => /^[A-Z0-9]{5}$/.test(value) ? null : 'Enter the five letters and numbers shown beneath the attendee’s QR code.';

  const verify = async (input: { code: string } | { qrPayload: string }) => {
    if (!visible || !canCheckIn || busyRef.current || ('code' in input && retryAt > Date.now())) return;
    if ('code' in input) {
      const message = validateCode(input.code);
      if (message) { setError(message); return; }
    } else if (!input.qrPayload.trim() || input.qrPayload.length > 2048) {
      setPaused(true); setError('This QR code is not a valid event ticket.'); return;
    }
    const current = version.current;
    busyRef.current = true; setBusy(true); setPaused(true); setError(null); setCameraError(null); setResult(null);
    callbacks.current.onBusyChange?.(true);
    Keyboard.dismiss();
    try {
      const response = await checkInEvent(eventId, input);
      if (version.current !== current) return;
      setResult(response);
      callbacks.current.onCheckedIn(response);
    } catch (reason: unknown) {
      if (version.current !== current) return;
      if (isAxiosError<CheckInError>(reason)) {
        const data = reason.response?.data;
        const message = data?.errors?.code || data?.errors?.qrPayload || data?.message;
        setError(typeof message === 'string' && message.trim() ? message : 'Could not verify this ticket. Check your connection and try again.');
        const retrySeconds = data?.retryAfterSeconds ?? Number(reason.response?.headers?.['retry-after']);
        if ('code' in input && Number.isFinite(retrySeconds) && retrySeconds > 0) {
          setRetryAt(Date.now() + retrySeconds * 1000); setClock(Date.now());
        }
      } else setError('Could not verify this ticket. Check your connection and try again.');
    } finally {
      if (version.current === current) {
        busyRef.current = false; setBusy(false); callbacks.current.onBusyChange?.(false);
      }
    }
  };

  const selectMode = async (next: Exclude<EntryMode, null>) => {
    if (!canCheckIn || busyRef.current || permissionBusyRef.current) return;
    if (next === 'camera') Keyboard.dismiss();
    setMode(next); setError(null); setCameraError(null); setPaused(false); setResult(null);
    if (next !== 'camera' || permission?.granted || permission?.canAskAgain === false) return;
    const current = version.current;
    permissionBusyRef.current = true; setPermissionBusy(true);
    try { await requestPermission(); }
    catch { if (version.current === current) setCameraError('Camera permission could not be requested. You can enter the attendee’s code instead.'); }
    finally { if (version.current === current) { permissionBusyRef.current = false; setPermissionBusy(false); } }
  };

  const nextGuest = () => {
    if (busyRef.current) return;
    setResult(null); setError(null); setCameraError(null); setCode(''); codeRef.current = ''; setPaused(false);
  };
  const cameraMounted = visible && mode === 'camera' && permission?.granted && appActive && canCheckIn &&
    !busy && !paused && !result && !cameraError;
  const attendeeName = result ? [result.attendee.firstName, result.attendee.lastName].filter(Boolean).join(' ') : '';

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close event check-in" />
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.sheet, {
        backgroundColor: colors.surface, borderColor: colors.border,
        maxHeight: height - Math.max(insets.top, 16) - 12, paddingBottom: Math.max(insets.bottom, 12),
      }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headingText}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Scan QR</Text>
            <Text numberOfLines={2} style={[styles.subtitle, { color: colors.muted }]}>{eventTitle}</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close event check-in" disabled={busy || permissionBusy} style={styles.close}>
            <Ionicons name="close" size={23} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <Text style={[styles.note, { color: colors.muted }]}>Check in a registered attendee using their QR ticket or five-character code.</Text>
          {!canCheckIn && <Text accessibilityLiveRegion="polite" style={[styles.windowNotice, { color: colors.primary }]}>{unavailableMessage}</Text>}
          <View style={styles.options}>
            {(['camera', 'code'] as const).map(option => <Pressable key={option} onPress={() => { void selectMode(option); }}
              disabled={!canCheckIn || busy || permissionBusy}
              accessibilityRole="button" accessibilityState={{ selected: mode === option, disabled: !canCheckIn || busy || permissionBusy }}
              style={[styles.option, { borderColor: mode === option ? colors.primary : colors.border, backgroundColor: mode === option ? colors.primaryLight : colors.background }, (!canCheckIn || busy) && styles.disabled]}>
              <Ionicons name={option === 'camera' ? 'camera-outline' : 'keypad-outline'} size={20} color={colors.primary} />
              <Text style={[styles.optionText, { color: colors.text }]}>{option === 'camera' ? 'Camera' : 'Enter code'}</Text>
            </Pressable>)}
          </View>

          {result ? <View accessibilityLiveRegion="polite" style={[styles.result, { borderColor: successColor }]}>
            <Ionicons name="checkmark-circle" size={34} color={successColor} />
            <Text style={[styles.resultTitle, { color: successColor }]}>{result.alreadyCheckedIn ? 'Already checked in' : 'Checked in successfully'}</Text>
            {Boolean(attendeeName) && <Text style={[styles.attendee, { color: colors.text }]}>{attendeeName}</Text>}
            <Text style={[styles.attendee, { color: colors.text }]}>@{result.attendee.username}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>{new Date(result.checkedInAt).toLocaleString()}</Text>
            <AppButton title="Next attendee" onPress={nextGuest} disabled={!canCheckIn} style={styles.resultButton} />
          </View> : <>
            {mode === 'code' && <View>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Five-character entry code</Text>
              <TextInput value={code} onChangeText={value => {
                const next = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                codeRef.current = next; setCode(next); setError(null);
              }} onBlur={() => setError(validateCode(codeRef.current))} onSubmitEditing={() => { void verify({ code: codeRef.current }); }}
                editable={canCheckIn && !busy && !manualBlocked} maxLength={5} autoCapitalize="characters" autoCorrect={false}
                autoComplete="off" placeholder="A7K2P" placeholderTextColor={colors.muted} accessibilityLabel="Five-character entry code"
                underlineColorAndroid="transparent" returnKeyType="done" style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
              <FieldError message={error} />
              <AppButton title={busy ? 'Checking ticket...' : 'Check In Attendee'} onPress={() => { void verify({ code: codeRef.current }); }}
                disabled={!canCheckIn || busy || manualBlocked} style={styles.submit} />
            </View>}

            {mode === 'camera' && <View>
              {permissionBusy ? <ActivityIndicator accessibilityLabel="Requesting camera access" color={colors.primary} />
                : !permission?.granted ? <View style={[styles.permission, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.note, { color: colors.text }]}>Allow camera access to scan tickets, or choose Enter code.</Text>
                  <AppButton title={permission?.canAskAgain === false ? 'Open Camera Settings' : 'Allow Camera'} variant="secondary"
                    disabled={!canCheckIn} onPress={() => {
                      if (permission?.canAskAgain === false) void Linking.openSettings().catch(() => setCameraError('Open your phone settings to allow camera access, or use Enter code.'));
                      else void selectMode('camera');
                    }} style={styles.submit} />
                </View>
                : <View style={[styles.cameraFrame, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {cameraMounted ? <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={({ data }) => { void verify({ qrPayload: data }); }}
                    onMountError={() => setCameraError('The camera could not start. Try again or enter the attendee’s code instead.')} />
                    : <View style={styles.cameraPlaceholder}>
                      {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="qr-code-outline" size={48} color={colors.muted} />}
                      <Text style={[styles.note, { color: colors.muted }]}>{busy ? 'Checking ticket...' : !appActive ? 'Camera paused while the app is in the background.' : 'Camera paused'}</Text>
                    </View>}
                  {cameraMounted && <View pointerEvents="none" style={styles.cameraGuide} />}
                </View>}
              <FieldError message={cameraError || error} />
              {(paused || cameraError) && !busy && <AppButton title="Try scanning again" variant="secondary" onPress={() => { setPaused(false); setError(null); setCameraError(null); }}
                disabled={!canCheckIn} style={styles.submit} />}
              {cameraMounted && <Text style={[styles.note, { color: colors.muted, marginTop: 8 }]}>Point the camera at the attendee’s event QR. Verification pauses the scanner after one ticket.</Text>}
            </View>}
          </>}
          {mode === 'code' && secondsUntilRetry > 0 && <FieldError message={`Please wait ${secondsUntilRetry} seconds before trying another code. Camera scanning is still available.`} />}
          {busy && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.muted, marginTop: 8 }]}>Checking attendance. Keep this screen open until the result appears.</Text>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.48)' },
  sheet: { flexShrink: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderBottomWidth: 1 },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 3 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { flexShrink: 1 },
  body: { padding: 16 },
  note: { fontSize: 12, lineHeight: 18 },
  windowNotice: { fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 10 },
  options: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  option: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, borderWidth: 1 },
  optionText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  disabled: { opacity: 0.5 },
  inputLabel: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 20, letterSpacing: 5, textAlign: 'center', fontWeight: '800' },
  submit: { marginTop: 10 },
  permission: { padding: 12, borderWidth: 1, borderRadius: 12 },
  cameraFrame: { height: 230, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  cameraGuide: { position: 'absolute', width: 170, height: 170, top: 30, alignSelf: 'center', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 12 },
  result: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  resultTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  attendee: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  resultButton: { marginTop: 8, alignSelf: 'stretch' },
});
