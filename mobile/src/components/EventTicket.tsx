import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAxiosError } from 'axios';
import { AppButton } from './AppButton';
import { FieldError } from './FieldError';
import { fetchEventTicket } from '../api/tickets';
import type { TicketResponse } from '../api/tickets';
import { settingsErrorMessage } from '../api/settings';
import { useTheme } from '../context/ThemeContext';
import { formatEventDate } from '../utils/dateFormat';

type Props = {
  eventId: string | null;
  onClose: () => void;
  onAttendanceUpdated?: () => void;
};

function ticketTime(value: string, timeZone?: string): string {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return '';
  try {
    return formatEventDate(value, timeZone) + ' · ' + new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}),
    }).format(time);
  } catch { return formatEventDate(value); }
}

// Credentials exist only while this owner-controlled modal is open. Polling is
// limited to the visible, foreground ticket so a host scan updates its status.
export function EventTicketModal({ eventId, onClose, onAttendanceUpdated }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const qrSize = Math.max(120, Math.min(280, width - 64));
  const [model, setModel] = useState<TicketResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [qrFailed, setQrFailed] = useState(false);
  const attendanceCallback = useRef(onAttendanceUpdated);
  attendanceCallback.current = onAttendanceUpdated;

  useEffect(() => {
    setModel(null); setError(null); setQrFailed(false); setLoading(Boolean(eventId));
    if (!eventId) return;
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    let lastCheckIn: string | null = null;
    async function load(initial = false) {
      if (!active || pending) return;
      pending = true;
      controller = new AbortController();
      const signal = controller.signal;
      if (initial) setLoading(true);
      try {
        const response = await fetchEventTicket(eventId!, signal);
        if (!active || signal.aborted) return;
        setModel(response); setError(null);
        if (response.ticket.checkedInAt && response.ticket.checkedInAt !== lastCheckIn) {
          lastCheckIn = response.ticket.checkedInAt;
          attendanceCallback.current?.();
        }
      } catch (reason) {
        if (!active || signal.aborted) return;
        // Authorization/revocation failures must not leave old credentials visible.
        if (isAxiosError(reason) && [400, 401, 403, 404, 409, 410].includes(reason.response?.status ?? 0)) setModel(null);
        setError(settingsErrorMessage(reason, 'Unable to load your ticket. Please try again.'));
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    void load(true);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load();
    }, 15000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
      else controller?.abort();
    });
    return () => { active = false; clearInterval(timer); controller?.abort(); listener.remove(); };
  }, [eventId, attempt]);

  const currentModel = model?.ticket.eventId === eventId ? model : null;
  const ticket = currentModel?.ticket;
  const usable = ticket?.status === 'active' || ticket?.status === 'used';
  return <Modal visible={eventId !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Your ticket</Text>
        <AppButton title="Close" variant="quiet" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading && !currentModel ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {currentModel && ticket && <>
          <Text style={[styles.title, { color: colors.text }]}>{currentModel.event.title}</Text>
          <Text style={[styles.note, { color: colors.muted }]}>{currentModel.event.date} · {currentModel.event.time}</Text>
          <Text style={[styles.note, { color: colors.muted }]}>{currentModel.event.venue}</Text>
          <View style={[styles.status, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: colors.primary }]}>
              {ticket.status === 'used' ? 'Checked in' : ticket.status === 'revoked' ? 'Ticket cancelled' : ticket.status === 'expired' ? 'Ticket expired' : 'Ticket ready'}
            </Text>
            {ticket.checkedInAt && <Text style={[styles.note, { color: colors.muted }]}>{ticketTime(ticket.checkedInAt, currentModel.event.timeZone)}</Text>}
          </View>
          {usable ? <>
            <View style={styles.qrFrame}>
              {!qrFailed && <Image source={{ uri: ticket.qrCodeDataUrl }} accessibilityLabel="Your private event entry QR code"
                onError={() => setQrFailed(true)} style={{ width: qrSize, height: qrSize }} resizeMode="contain" />}
            </View>
            <FieldError message={qrFailed ? 'The QR image could not be displayed. Give your five-character code to the host instead.' : null} />
            <Text style={[styles.note, { color: colors.muted }]}>Or give this code to the host</Text>
            <Text selectable accessibilityLabel={'Entry code ' + ticket.code.split('').join(' ')} style={[styles.code, { color: colors.text }]}>{ticket.code}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Check-in opens {ticketTime(ticket.checkInOpensAt, currentModel.event.timeZone)}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Closes {ticketTime(ticket.checkInClosesAt, currentModel.event.timeZone)}</Text>
            {ticket.status === 'used' && <Text style={[styles.note, { color: colors.muted }]}>Your attendance is verified. You cannot unregister after check-in.</Text>}
          </> : <Text style={[styles.note, { color: colors.muted }]}>This ticket can no longer be used for entry.</Text>}
        </>}
        <FieldError message={error} />
        {error && <AppButton title="Retry ticket" variant="secondary" onPress={() => setAttempt(value => value + 1)} disabled={loading} style={styles.retry} />}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  heading: { flex: 1, fontSize: 19, fontWeight: '800' }, content: { padding: 16, alignItems: 'center', gap: 8, paddingBottom: 28 },
  title: { fontSize: 21, fontWeight: '800', textAlign: 'center' }, note: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  status: { alignSelf: 'stretch', alignItems: 'center', borderWidth: 1, padding: 10, borderRadius: 12, gap: 3 },
  statusText: { fontSize: 15, fontWeight: '800' }, qrFrame: { backgroundColor: '#FFFFFF', padding: 8, borderRadius: 12, marginVertical: 4 },
  code: { fontSize: 30, fontWeight: '900', letterSpacing: 5, marginBottom: 6 }, retry: { alignSelf: 'stretch', marginTop: 8 },
});
