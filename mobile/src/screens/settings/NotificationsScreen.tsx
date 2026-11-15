import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';
import { fetchNotificationSettings, settingsErrorMessage } from '../../api/settings';
import type { NotificationKey, NotificationSettings, NotificationsResponse } from '../../api/settings';
import { NOTIFICATION_CHANNELS, saveNotificationPreferences } from '../../api/notifications';
import type { ChannelChoices, NotificationChannel, NotificationType, TypeChannelChoices } from '../../api/notifications';

const CHANNEL_LABELS: Record<NotificationChannel, string> = { inApp: 'In-app', push: 'Push', email: 'Email', sms: 'SMS' };
const EVENT_ALERTS: Array<{ type: NotificationType; title: string; note: string }> = [
  { type: 'EVENT_INVITE', title: 'Event invitation from a friend', note: 'When an accepted friend invites you to an event.' },
  { type: 'REGISTRATION_CONFIRMED', title: 'Registration confirmed', note: 'When you choose Attending.' },
  { type: 'REGISTRATION_CANCELLED', title: 'Registration cancelled', note: 'When you cancel your registration.' },
  { type: 'EVENT_STARTS_24H', title: 'Event starts in 24 hours', note: 'For events you are attending.' },
  { type: 'EVENT_STARTS_1H', title: 'Event starts in 1 hour', note: 'For events you are attending.' },
  { type: 'EVENT_CANCELLED', title: 'Event cancelled', note: 'For events you are interested in or attending.' },
  { type: 'EVENT_DATETIME_CHANGED', title: 'Event date or time changed', note: 'For events you are interested in or attending.' },
  { type: 'EVENT_LOCATION_CHANGED', title: 'Event location changed', note: 'For events you are interested in or attending.' },
  { type: 'SAVED_EVENT_REGISTRATION_CLOSING', title: 'Saved event registration closing', note: '24 hours before the deadline, if you have not registered.' },
  { type: 'FOLLOWED_ORGANIZER_NEW_EVENT', title: 'New event from a user you follow', note: 'When a followed user hosts a new event.' },
  { type: 'RATE_ATTENDED_EVENT', title: 'Rate an attended event', note: 'One hour after it ends, if you have not rated it yet.' },
];
const LEGACY_FILTERS: Partial<Record<NotificationType, Partial<Record<NotificationChannel, NotificationKey>>>> = {
  EVENT_STARTS_24H: { email: 'attendingEmailReminders', sms: 'attendingPhoneReminders' },
  EVENT_STARTS_1H: { email: 'attendingEmailReminders', sms: 'attendingPhoneReminders' },
  SAVED_EVENT_REGISTRATION_CLOSING: { email: 'bookingInterestEmail' },
  FOLLOWED_ORGANIZER_NEW_EVENT: { email: 'organizerAnnounceEmail', sms: 'organizerAnnouncePhone' },
};
const CONNECTED_LEGACY = new Set<NotificationKey>(['attendingEmailReminders', 'attendingPhoneReminders', 'bookingInterestEmail', 'organizerAnnounceEmail', 'organizerAnnouncePhone']);

type ToggleDefinition = { key: NotificationKey; title: string; channel?: 'email' | 'sms' };
const GENERAL: ToggleDefinition[] = [
  { key: 'personalizedEmail', title: 'Personalized events curated for you (Email)', channel: 'email' },
  { key: 'cityEventsEmail', title: 'Hottest events in your city (Email)', channel: 'email' },
  { key: 'trendNewsletters', title: 'Trend newsletters (Email)', channel: 'email' },
  { key: 'attendingEmailReminders', title: 'Reminders for events you are attending (Email)', channel: 'email' },
  { key: 'attendingPhoneReminders', title: 'Reminders for events you are attending (SMS)', channel: 'sms' },
  { key: 'bookingInterestEmail', title: 'Booking reminders for events of interest (Email)', channel: 'email' },
  { key: 'topEventsEmail', title: 'Top events in cities you follow (Email)', channel: 'email' },
];
const SOCIAL: ToggleDefinition[] = [
  { key: 'organizerAnnounceEmail', title: 'New events from organizers you follow (Email)', channel: 'email' },
  { key: 'organizerAnnouncePhone', title: 'New events from organizers you follow (SMS)', channel: 'sms' },
  { key: 'followerEmail', title: 'When someone follows you (Email)', channel: 'email' },
  { key: 'followerPhone', title: 'When someone follows you (SMS)', channel: 'sms' },
  { key: 'newMessageEmail', title: 'New messages received (Email)', channel: 'email' },
  { key: 'newMessagePhone', title: 'New messages received (SMS)', channel: 'sms' },
];
const HOST: ToggleDefinition[] = [
  { key: 'hostEventLiveEmail', title: 'When your event goes live (Email)', channel: 'email' },
  { key: 'hostNewsletterEmail', title: 'Your event is included in a newsletter (Email)', channel: 'email' },
  { key: 'hostNewCommentEmail', title: 'New comments on your event (Email)', channel: 'email' },
];

function NotificationRow({ title, note, value, disabled, onChange }: { title: string; note?: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && styles.disabled]}>
      <View style={styles.rowCopy}><Text style={[styles.title, { color: colors.text }]}>{title}</Text>{note && <Text style={[styles.rowNote, { color: colors.muted }]}>{note}</Text>}</View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.primary }} />
    </View>
  );
}

export function NotificationsScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const errorColor = theme === 'dark' ? '#FF8A80' : '#C62828';
  const [model, setModel] = useState<NotificationsResponse | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [channels, setChannels] = useState<ChannelChoices | null>(null);
  const [typeChannels, setTypeChannels] = useState<TypeChannelChoices>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const viewVersion = useRef(0);
  const pendingSave = useRef<Promise<NotificationsResponse> | null>(null);

  // Opening or explicitly retrying reloads settings. Edits never trigger a GET,
  // and a later visit waits for an earlier save before reading the account again.
  useFocusEffect(useCallback(() => {
    const version = ++viewVersion.current;
    const controller = new AbortController();
    setIsLoading(true); setLoadError(null); setSaveError(null); setSaved(false); setModel(null); setSettings(null); setChannels(null); setTypeChannels({});
    async function load() {
      try {
        await pendingSave.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const response = await fetchNotificationSettings(controller.signal);
        if (viewVersion.current === version) {
          setModel(response); setSettings(response.settings); setChannels(response.channels); setTypeChannels(response.typeChannels);
        }
      } catch (error: unknown) {
        if (viewVersion.current === version && !controller.signal.aborted) setLoadError(settingsErrorMessage(error, 'Unable to load notification preferences. Please try again.'));
      } finally {
        if (viewVersion.current === version) { setIsLoading(false); setIsSaving(false); }
      }
    }
    void load();
    return () => { ++viewVersion.current; controller.abort(); };
  }, [loadAttempt]));

  function editSetting(key: NotificationKey, value: boolean) {
    if (pendingSave.current) return;
    // Master switches only gate delivery/controls; they never erase child choices.
    setSettings(current => current ? { ...current, [key]: value } : current); setSaveError(null); setSaved(false);
  }
  function isDisabled(definition: ToggleDefinition): boolean {
    return isSaving || (definition.channel !== undefined && !channelEnabled(definition.channel));
  }
  function channelEnabled(channel: NotificationChannel): boolean {
    return channels?.[channel] === true && (channel !== 'email' || settings?.emailMaster === true) &&
      (channel !== 'sms' || settings?.phoneMaster === true);
  }
  function editChannel(channel: NotificationChannel, value: boolean) {
    if (pendingSave.current) return;
    setChannels(current => current ? { ...current, [channel]: value } : current);
    // Keep the older master flags in step with the single email/SMS channel control.
    if (channel === 'email' || channel === 'sms') setSettings(current => current ? {
      ...current, [channel === 'email' ? 'emailMaster' : 'phoneMaster']: value,
    } : current);
    setSaveError(null); setSaved(false);
  }
  function editTypeChannel(type: NotificationType, channel: NotificationChannel, value: boolean) {
    if (pendingSave.current) return;
    setTypeChannels(current => ({ ...current, [type]: { ...current[type], [channel]: value } }));
    setSaveError(null); setSaved(false);
  }
  function renderRows(definitions: ToggleDefinition[]) {
    return definitions.map(definition => <NotificationRow key={definition.key} title={definition.title}
      note={CONNECTED_LEGACY.has(definition.key) ? 'Also filters the event notification choices above.' : 'Preference saved; this alert is not connected yet.'}
      value={settings?.[definition.key] === true} disabled={isDisabled(definition)} onChange={value => editSetting(definition.key, value)} />);
  }
  async function handleSave() {
    if (!settings || !channels || !model || isLoading || isSaving || pendingSave.current) return;
    setIsSaving(true); setSaveError(null); setSaved(false);
    const version = viewVersion.current;
    const contacts = model.contacts;
    const request: Promise<NotificationsResponse> = saveNotificationPreferences({ settings: { ...settings }, channels: { ...channels }, typeChannels })
      .then(preferences => ({ ...preferences, contacts }));
    pendingSave.current = request;
    try {
      const response = await request;
      if (viewVersion.current !== version) return;
      setModel(response); setSettings(response.settings); setChannels(response.channels); setTypeChannels(response.typeChannels); setSaved(true);
    } catch (error: unknown) {
      if (viewVersion.current === version) setSaveError(settingsErrorMessage(error, 'Unable to save notification preferences. Please try again.'));
    } finally {
      if (pendingSave.current === request) pendingSave.current = null;
      if (viewVersion.current === version) setIsSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <AppButton title="Back to Settings" variant="quiet" alignment="left" onPress={() => navigation.goBack()} disabled={isSaving} style={styles.backButton} />
      <ScreenHeader title="Notification Settings" subtitle="Choose your channels and event alerts." />
      {isLoading ? <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={[styles.note, { color: colors.muted }]}>Loading notification preferences...</Text></View> : loadError ? (
        <View style={styles.status}><Text accessibilityRole="alert" style={[styles.note, { color: errorColor }]}>{loadError}</Text><AppButton title="Retry" onPress={() => setLoadAttempt(current => current + 1)} /></View>
      ) : model && settings && channels ? (
        <>
          <Text style={[styles.note, { color: colors.muted }]}>In-app notifications are connected. Push, email, and SMS delivery are on hold until provider setup. You can save those channel choices now.</Text>
          <AppButton title="Open Notification Inbox" variant="quiet" alignment="left" onPress={() => navigation.navigate('NotificationInbox')} disabled={isSaving} />
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Delivery Channels</Text>
          {NOTIFICATION_CHANNELS.map(channel => <NotificationRow key={channel} title={`${CHANNEL_LABELS[channel]} Notifications`}
            value={channelEnabled(channel)} disabled={isSaving} onChange={value => editChannel(channel, value)}
            note={channel === 'inApp' ? 'Updates inside the app. Turning this off keeps existing inbox records.' : 'Delivery inactive while provider setup is on hold. Turning this off keeps your individual choices.'} />)}

          <Text style={[styles.sectionHeader, { color: colors.text }]}>Event Notifications</Text>
          <Text style={[styles.note, { color: colors.muted }]}>Individual choices are kept when a channel is off. Email and SMS also use the reminder filters below.</Text>
          {EVENT_ALERTS.map(alert => <View key={alert.type} style={styles.alertSection}>
            <Text style={[styles.alertTitle, { color: colors.text }]}>{alert.title}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>{alert.note}</Text>
            {NOTIFICATION_CHANNELS.map(channel => {
              const legacy = LEGACY_FILTERS[alert.type]?.[channel];
              const filtered = legacy !== undefined && !settings[legacy];
              return <NotificationRow key={channel} title={CHANNEL_LABELS[channel]}
                note={filtered ? 'Enable the related reminder filter below to use this channel.' : undefined}
                value={typeChannels[alert.type]?.[channel] !== false}
                disabled={isSaving || !channelEnabled(channel) || filtered}
                onChange={value => editTypeChannel(alert.type, channel, value)} />;
            })}
            {Object.keys(typeChannels[alert.type] ?? {}).length > 0 && <AppButton title="Use channel defaults" variant="quiet" alignment="left"
              disabled={isSaving} onPress={() => { setTypeChannels(current => ({ ...current, [alert.type]: {} })); setSaveError(null); setSaved(false); }} />}
          </View>)}

          <Text style={[styles.sectionHeader, { color: colors.text }]}>Contact Details</Text>
          <Text style={[styles.note, { color: colors.muted }]}>These details come from your account.</Text>
          <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
          <TextInput accessibilityLabel="Account notification email address" value={model.contacts.email} editable={false} placeholder="No email address saved" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          <Text style={[styles.label, { color: colors.text }]}>SMS Phone Number</Text>
          <TextInput accessibilityLabel="Account notification SMS phone number" value={model.contacts.phone} editable={false} placeholder="No phone number saved" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          <AppButton title="Edit Account Details" variant="quiet" alignment="left" onPress={() => navigation.navigate('Account')} disabled={isSaving} />

          <Text style={[styles.sectionHeader, { color: colors.text }]}>Existing Reminder Filters & Other Preferences</Text>
          <NotificationRow title="Google Calendar Synchronization" note="Saves your preference. Google Calendar is not connected yet." value={settings.calendarSync} disabled={isSaving} onChange={value => editSetting('calendarSync', value)} />
          {renderRows(GENERAL)}
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Social & Follower Alerts</Text>
          {renderRows(SOCIAL)}
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Host Preferences · Saved for Later</Text>
          {renderRows(HOST)}
          {saveError && <Text accessibilityRole="alert" style={[styles.feedback, { color: errorColor }]}>{saveError}</Text>}
          {saved && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.primary }]}>Your notification preferences have been saved.</Text>}
          {isSaving && <ActivityIndicator color={colors.primary} style={styles.savingIndicator} />}
          <AppButton title={isSaving ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={isSaving} style={styles.saveButton} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backButton: { marginLeft: -8, paddingHorizontal: 8, marginBottom: 8 },
  sectionHeader: { fontSize: 12, fontWeight: '700', marginTop: 20, marginBottom: 8, textTransform: 'uppercase' },
  alertSection: { marginTop: 16, gap: 6 },
  alertTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, padding: 12, borderRadius: 10, marginBottom: 8, gap: 12 },
  rowCopy: { flex: 1 },
  title: { fontSize: 12, fontWeight: '600' },
  rowNote: { fontSize: 11, lineHeight: 17, marginTop: 5 },
  note: { fontSize: 12, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 8 },
  disabled: { opacity: 0.5 },
  status: { paddingVertical: 32, gap: 16 },
  feedback: { fontSize: 13, lineHeight: 20, marginTop: 12 },
  savingIndicator: { marginVertical: 12 },
  saveButton: { marginTop: 20, marginBottom: 16 },
});
