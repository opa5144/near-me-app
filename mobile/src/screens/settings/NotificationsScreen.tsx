import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton } from '../../components/AppButton';
import { useTheme } from '../../context/ThemeContext';
import { fetchNotificationSettings, settingsErrorMessage, updateNotificationSettings } from '../../api/settings';
import type { NotificationKey, NotificationSettings, NotificationsResponse } from '../../api/settings';

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
    setIsLoading(true); setLoadError(null); setSaveError(null); setSaved(false); setModel(null); setSettings(null);
    async function load() {
      try {
        await pendingSave.current?.catch(() => undefined);
        if (controller.signal.aborted) return;
        const response = await fetchNotificationSettings(controller.signal);
        if (viewVersion.current === version) { setModel(response); setSettings(response.settings); }
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
    return isSaving || (definition.channel === 'sms' && !settings?.phoneMaster) || (definition.channel === 'email' && !settings?.emailMaster);
  }
  function renderRows(definitions: ToggleDefinition[]) {
    return definitions.map(definition => <NotificationRow key={definition.key} title={definition.title} value={settings?.[definition.key] === true} disabled={isDisabled(definition)} onChange={value => editSetting(definition.key, value)} />);
  }
  async function handleSave() {
    if (!settings || isLoading || isSaving || pendingSave.current) return;
    setIsSaving(true); setSaveError(null); setSaved(false);
    const version = viewVersion.current;
    const request = updateNotificationSettings({ ...settings });
    pendingSave.current = request;
    try {
      const response = await request;
      if (viewVersion.current !== version) return;
      setModel(response); setSettings(response.settings); setSaved(true);
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
      <ScreenHeader title="Notifications" subtitle="Manage your email, SMS, and calendar preferences." />
      {isLoading ? <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={[styles.note, { color: colors.muted }]}>Loading notification preferences...</Text></View> : loadError ? (
        <View style={styles.status}><Text accessibilityRole="alert" style={[styles.note, { color: errorColor }]}>{loadError}</Text><AppButton title="Retry" onPress={() => setLoadAttempt(current => current + 1)} /></View>
      ) : model && settings ? (
        <>
          <Text style={[styles.note, { color: colors.muted }]}>Your choices are saved for your account. Email and SMS alerts are not sent yet.</Text>
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Master Controls</Text>
          <NotificationRow title="SMS Notifications" value={settings.phoneMaster} disabled={isSaving} onChange={value => editSetting('phoneMaster', value)} note="Turning this off keeps your individual SMS choices." />
          <NotificationRow title="Email Notifications" value={settings.emailMaster} disabled={isSaving} onChange={value => editSetting('emailMaster', value)} note="Turning this off keeps your individual email choices." />

          <Text style={[styles.sectionHeader, { color: colors.text }]}>Contact Details</Text>
          <Text style={[styles.note, { color: colors.muted }]}>These details come from your account.</Text>
          <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
          <TextInput accessibilityLabel="Account notification email address" value={model.contacts.email} editable={false} placeholder="No email address saved" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          <Text style={[styles.label, { color: colors.text }]}>SMS Phone Number</Text>
          <TextInput accessibilityLabel="Account notification SMS phone number" value={model.contacts.phone} editable={false} placeholder="No phone number saved" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
          <AppButton title="Edit Account Details" variant="quiet" alignment="left" onPress={() => navigation.navigate('Account')} disabled={isSaving} />

          <Text style={[styles.sectionHeader, { color: colors.text }]}>General & Event Alerts</Text>
          <NotificationRow title="Google Calendar Synchronization" note="Saves your preference. Google Calendar is not connected yet." value={settings.calendarSync} disabled={isSaving} onChange={value => editSetting('calendarSync', value)} />
          {renderRows(GENERAL)}
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Social & Follower Alerts</Text>
          {renderRows(SOCIAL)}
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Host Notifications</Text>
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
