import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

export function NotificationsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [phoneMaster, setPhoneMaster] = useState(true);
  const [emailMaster, setEmailMaster] = useState(true);
  const [calendarSync, setCalendarSync] = useState(false);
  
  // Just from all the requirements we made
  const [personalizedEmail, setPersonalizedEmail] = useState(true);
  const [cityEventsEmail, setCityEventsEmail] = useState(true);
  const [trendNewsletters, setTrendNewsletters] = useState(true);
  const [attendingEmailReminders, setAttendingEmailReminders] = useState(true);
  const [attendingPhoneReminders, setAttendingPhoneReminders] = useState(true);
  const [bookingInterestEmail, setBookingInterestEmail] = useState(true);
  const [topEventsEmail, setTopEventsEmail] = useState(true);
  const [organizerAnnounceEmail, setOrganizerAnnounceEmail] = useState(true);
  const [organizerAnnouncePhone, setOrganizerAnnouncePhone] = useState(true);
  const [followerEmail, setFollowerEmail] = useState(true);
  const [followerPhone, setFollowerPhone] = useState(true);
  const [newMessageEmail, setNewMessageEmail] = useState(true);
  const [newMessagePhone, setNewMessagePhone] = useState(true);
  const [hostEventLiveEmail, setHostEventLiveEmail] = useState(true);
  const [hostNewsletterEmail, setHostNewsletterEmail] = useState(true);
  const [hostNewCommentEmail, setHostNewCommentEmail] = useState(true);

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}>
      <Text onPress={() => navigation.goBack()} style={[styles.backLink, { color: colors.primary }]}>‹  Back to Settings</Text>
      <ScreenHeader title="Notifications" subtitle="Configure master toggles and detailed event preferences." />

      <Text style={[styles.sectionHeader, { color: colors.text }]}>Master Controls</Text>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Phone Notifications</Text></View>
        <Switch value={phoneMaster} onValueChange={setPhoneMaster} trackColor={{ true: colors.primary }} />
      </View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Email Notifications</Text></View>
        <Switch value={emailMaster} onValueChange={setEmailMaster} trackColor={{ true: colors.primary }} />
      </View>

      <Text style={[styles.sectionHeader, { color: colors.text }]}>Communication Contact Points</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="Notification Email Address" placeholderTextColor={colors.muted} />
      <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="Notification Phone Number" placeholderTextColor={colors.muted} />

      <Text style={[styles.sectionHeader, { color: colors.text }]}>General & Event Alerts</Text>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Google Calendar Synchronization</Text></View><Switch value={calendarSync} onValueChange={setCalendarSync} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Personalized events curated for you (Email)</Text></View><Switch value={personalizedEmail} onValueChange={setPersonalizedEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Hottest events in your City (Email)</Text></View><Switch value={cityEventsEmail} onValueChange={setCityEventsEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Trend Newsletters (Email)</Text></View><Switch value={trendNewsletters} onValueChange={setTrendNewsletters} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Event reminders for those attending (Email)</Text></View><Switch value={attendingEmailReminders} onValueChange={setAttendingEmailReminders} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Event reminders for those attending (Phone)</Text></View><Switch value={attendingPhoneReminders} onValueChange={setAttendingPhoneReminders} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Booking reminders for events of interest (Email)</Text></View><Switch value={bookingInterestEmail} onValueChange={setBookingInterestEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Top events in cities you follow (Email)</Text></View><Switch value={topEventsEmail} onValueChange={setTopEventsEmail} trackColor={{ true: colors.primary }} /></View>

      <Text style={[styles.sectionHeader, { color: colors.text }]}>Social & Follower Alerts</Text>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>New event announcements by organizers you follow (Email)</Text></View><Switch value={organizerAnnounceEmail} onValueChange={setOrganizerAnnounceEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>New event announcements by organizers you follow (Phone)</Text></View><Switch value={organizerAnnouncePhone} onValueChange={setOrganizerAnnouncePhone} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>When someone follows you (Email)</Text></View><Switch value={followerEmail} onValueChange={setFollowerEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>When someone follows you (Phone)</Text></View><Switch value={followerPhone} onValueChange={setFollowerPhone} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>New messages received (Email)</Text></View><Switch value={newMessageEmail} onValueChange={setNewMessageEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>New messages received (Phone)</Text></View><Switch value={newMessagePhone} onValueChange={setNewMessagePhone} trackColor={{ true: colors.primary }} /></View>

      <Text style={[styles.sectionHeader, { color: colors.text }]}>Host Notifications</Text>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>When your event goes live (Email)</Text></View><Switch value={hostEventLiveEmail} onValueChange={setHostEventLiveEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Your event is included in the newsletter (Email)</Text></View><Switch value={hostNewsletterEmail} onValueChange={setHostNewsletterEmail} trackColor={{ true: colors.primary }} /></View>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>When you receive a new comment on your event (Email)</Text></View><Switch value={hostNewCommentEmail} onValueChange={setHostNewCommentEmail} trackColor={{ true: colors.primary }} /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  backLink: { fontWeight: '800', fontSize: 13, marginBottom: 12 },
  sectionHeader: { fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, padding: 12, borderRadius: 10, marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 8 },
});