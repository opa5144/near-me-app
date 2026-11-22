import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppButton } from '../../components/AppButton';
import { EventCard } from '../../components/EventCard';
import { EventTicketModal } from '../../components/EventTicket';
import { FieldError } from '../../components/FieldError';
import { ScreenHeader } from '../../components/ScreenHeader';
import { fetchMyTickets } from '../../api/tickets';
import type { TicketListItem } from '../../api/tickets';
import { settingsErrorMessage } from '../../api/settings';
import { useTheme } from '../../context/ThemeContext';
import { useEvents } from '../../context/EventsContext';
import { useUserData } from '../../context/UserDataContext';
import type { EventItem } from '../../data/events';

export function TicketsScreen({ onBack, onOpenEvent }: { onBack: () => void; onOpenEvent: (event: EventItem) => void }) {
  const { colors } = useTheme();
  const { refreshSelections } = useEvents();
  const { refreshAttended } = useUserData();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ticketId, setTicketId] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    let revision = 0;
    let controller: AbortController | undefined;
    function load() {
      const version = ++revision;
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      setLoading(true); setError(null);
      void fetchMyTickets(signal).then(saved => { if (active && version === revision) setTickets(saved); })
        .catch(reason => { if (active && version === revision && !signal.aborted) setError(settingsErrorMessage(reason, 'Unable to load your tickets. Please try again.')); })
        .finally(() => { if (active && version === revision) setLoading(false); });
    }
    load();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { active = false; ++revision; controller?.abort(); listener.remove(); };
  }, [attempt]));
  const closeTicket = () => { setTicketId(null); setAttempt(value => value + 1); };
  const attendanceUpdated = () => { void refreshSelections(); void refreshAttended(true); };

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setAttempt(value => value + 1)} tintColor={colors.primary} />}>
      <AppButton title="Back" variant="quiet" alignment="left" onPress={onBack} />
      <ScreenHeader title="My Tickets" subtitle="Entry tickets for your registered events." />
      {loading && tickets.length === 0 && <ActivityIndicator color={colors.primary} />}
      <FieldError message={error} />
      {error && <AppButton title="Retry tickets" variant="secondary" onPress={() => setAttempt(value => value + 1)} disabled={loading} />}
      {!loading && !error && tickets.length === 0 && <Text style={[styles.note, { color: colors.muted }]}>No tickets yet. Register for an event that uses QR tickets to receive one.</Text>}
      {tickets.map(ticket => <View key={ticket.event.id} style={styles.ticket}>
        <EventCard event={ticket.event} horizontal onPress={() => onOpenEvent(ticket.event)} />
        <View style={styles.actions}>
          <Text style={[styles.state, { color: colors.muted }]}>{ticket.attended ? 'Checked in' : ticket.status === 'expired' ? 'Expired' : ticket.status === 'revoked' ? 'Cancelled' : 'Registered'}</Text>
          {ticket.id || ticket.status === 'active' ? <AppButton title={ticket.attended ? 'View checked-in ticket' : 'View ticket'} variant="secondary" onPress={() => setTicketId(ticket.event.id)} minHeight={40} />
            : <Text style={[styles.state, { color: colors.muted }]}>No entry ticket issued</Text>}
        </View>
      </View>)}
    </ScrollView>
    <EventTicketModal eventId={ticketId} onClose={closeTicket} onAttendanceUpdated={attendanceUpdated} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  note: { fontSize: 13, lineHeight: 20, marginVertical: 12 }, ticket: { marginBottom: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  state: { flex: 1, fontSize: 12, fontWeight: '700' },
});
