import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import { fetchEvents, fetchMyEvents, fetchEventSelections, saveEventSelection } from '../api/events';
import { fetchUserProfile } from '../api/client';
import type { EventSelection } from '../api/events';
import type { EventItem } from '../data/events';
import { isAvailableEvent } from '../utils/eventAvailability';

// Account IDs are appended only after the backend identifies the current user.
// The old unscoped key stays untouched because its owner cannot be established.
const SAVED_ITINERARIES_KEY = '@nearme/saved_itineraries';

// Saved itinerary record stored in context and AsyncStorage.
export interface SavedItinerary {
  id: string;
  title: string;
  createdAt: string;
  eventIds: string[];
  eventsSnapshot?: EventItem[];
}

// Event lists and private choices share one provider for the signed-in account.
interface EventsContextValue {
  events: EventItem[];
  myEvents: EventItem[];
  isLoading: boolean;
  error: string | null;
  refreshEvents: () => Promise<void>;
  addCreatedEvent: (event: EventItem) => void;
  interestedEventIds: string[];
  attendingEventIds: string[];
  attendedEventIds: string[];
  toggleInterested: (id: string) => void;
  toggleAttending: (id: string) => void;
  setBulkRsvp: (eventIds: string[], attending: boolean) => Promise<boolean>; // Bulk RSVP helper for itineraries.
  savedItineraries: SavedItinerary[]; // Persisted user itineraries.
  savedItinerariesLoading: boolean;
  savedItinerariesReady: boolean;
  savedItinerariesError: string | null;
  refreshSavedItineraries: () => Promise<void>;
  saveItinerary: (title: string, itineraryEvents: EventItem[]) => Promise<SavedItinerary | null>; // Saves an itinerary to storage.
  deleteItinerary: (id: string) => Promise<void>; // Removes a saved itinerary from state and storage.
  selectionsLoading: boolean;
  selectionsReady: boolean;
  selectionsSavingEventIds: string[];
  selectionsError: string | null;
  refreshSelections: (clearError?: boolean, quiet?: boolean) => Promise<void>;
  viewedEventIds: string[];
  recordView: (id: string) => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | undefined>(undefined);

function loadError(reason: unknown, list: string): string {
  if (isAxiosError(reason) && reason.response?.status === 401) {
    return 'Your session expired. Sign in again.';
  }
  return 'Could not load ' + list + '. Check your connection and try again.';
}

function selectionError(reason: unknown): string {
  if (isAxiosError<{ message?: string }>(reason)) {
    const message = reason.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Your event choice was not saved. Check your connection and try again.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// Stored snapshots are only a fallback while discovery is unavailable. Validate
// the fields screens consume so damaged device storage cannot crash the cards.
function isStoredEvent(value: unknown): value is EventItem {
  if (!isRecord(value)) return false;
  const requiredStrings = ['id', 'title', 'description', 'price', 'date', 'time', 'startsAt', 'endsAt', 'venue', 'address', 'emoji', 'accent'];
  if (!requiredStrings.every(field => typeof value[field] === 'string') || !value.id) return false;
  if (!Number.isFinite(Date.parse(value.startsAt as string)) || !Number.isFinite(Date.parse(value.endsAt as string))) return false;
  if (!Array.isArray(value.categories) || !value.categories.every(category => typeof category === 'string')) return false;
  const optionalStrings = ['registrationClosesAt', 'timeZone', 'place', 'placeId', 'location', 'bannerImage', 'cancellationReason', 'archiveReason'];
  if (!optionalStrings.every(field => value[field] === undefined || typeof value[field] === 'string')) return false;
  if (!['cancelledAt', 'archivedAt', 'sourceEventId'].every(field => value[field] == null || typeof value[field] === 'string')) return false;
  if (!['priceAmount', 'checkedInCount', 'interestedCount', 'attendingCount'].every(field => value[field] === undefined || typeof value[field] === 'number' && Number.isFinite(value[field]))) return false;
  if (!['latitude', 'longitude'].every(field => value[field] == null || typeof value[field] === 'number' && Number.isFinite(value[field]))) return false;
  if (!['useTickets', 'ticketsModeLocked'].every(field => value[field] === undefined || typeof value[field] === 'boolean')) return false;
  if (value.status !== undefined && !['published', 'cancelled', 'archived', 'draft'].includes(value.status as string)) return false;
  if (value.storage !== undefined && !['current', 'past', 'archived'].includes(value.storage as string)) return false;
  if (value.photos !== undefined && (!Array.isArray(value.photos) || !value.photos.every(photo => isRecord(photo) && typeof photo.id === 'string' && typeof photo.url === 'string'))) return false;
  if (value.friendsAttending !== undefined && (!Array.isArray(value.friendsAttending) || !value.friendsAttending.every(friend => isRecord(friend) && ['id', 'name', 'username', 'avatar'].every(field => typeof friend[field] === 'string')))) return false;
  const host = value.hostId;
  return host === undefined || typeof host === 'string' || isRecord(host) &&
    typeof host._id === 'string' && typeof host.username === 'string' &&
    ['firstName', 'lastName'].every(field => host[field] === undefined || typeof host[field] === 'string');
}

function readSavedItineraries(raw: string | null): SavedItinerary[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Invalid saved itinerary storage.');
  const result: SavedItinerary[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || !Array.isArray(item.eventIds)) continue;
    const eventIds = [...new Set(item.eventIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))];
    const snapshots = Array.isArray(item.eventsSnapshot) ? item.eventsSnapshot.filter(isStoredEvent).filter(event => eventIds.includes(event.id)) : [];
    // Earlier timestamp-only IDs may collide; retain both plans under stable IDs.
    let id = item.id;
    while (seen.has(id)) id += '_1';
    seen.add(id);
    result.push({
      id,
      title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Saved Itinerary',
      createdAt: typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date(0).toISOString(),
      eventIds,
      ...(snapshots.length ? { eventsSnapshot: snapshots } : {}),
    });
  }
  // Avoid replacing an unreadable nonempty collection with an apparently empty one.
  if (parsed.length && !result.length) throw new Error('Invalid saved itinerary storage.');
  return result;
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const [loadedEvents, setEvents] = useState<EventItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewedEventIds, setViewedEventIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, EventSelection>>({});
  const [selectionsLoading, setSelectionsLoading] = useState(true);
  const [selectionsReady, setSelectionsReady] = useState(false);
  const [selectionsSavingEventIds, setSelectionsSavingEventIds] = useState<string[]>([]);
  const [selectionsError, setSelectionsError] = useState<string | null>(null);
  const [savedItineraries, setSavedItineraries] = useState<SavedItinerary[]>([]); // Holds loaded saved itineraries.
  const [savedItinerariesLoading, setSavedItinerariesLoading] = useState(true);
  const [savedItinerariesReady, setSavedItinerariesReady] = useState(false);
  const [savedItinerariesError, setSavedItinerariesError] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const mutationVersion = useRef(0);
  const selectionRequestId = useRef(0);
  const selectionMutationVersion = useRef(0);
  const selectionValues = useRef<Record<string, EventSelection>>({});
  const selectionLoadSucceeded = useRef(false);
  const selectionWrites = useRef(new Set<string>());
  const selectionRefreshQueued = useRef(false);
  const savedItinerariesRef = useRef<SavedItinerary[]>([]); // Keeps latest itineraries for async mutations.
  const itineraryStorageKey = useRef<string | null>(null);
  const itineraryStorageReady = useRef(false);
  const itineraryGeneration = useRef(0);
  const itineraryLoadRequest = useRef(0);
  const itineraryQueue = useRef<Promise<void>>(Promise.resolve());

  // Hydration, saves and deletes share one queue so a slow read or older write
  // cannot replace a newer list. Failures release the queue for a later retry.
  const queueItineraryOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = itineraryQueue.current.then(operation);
    itineraryQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  // Never load the legacy shared key into whichever account happens to log in.
  const loadSavedItineraries = useCallback(async (): Promise<void> => {
    if (!mounted.current) return;
    const generation = itineraryGeneration.current;
    const request = ++itineraryLoadRequest.current;
    const isCurrent = () => mounted.current && generation === itineraryGeneration.current && request === itineraryLoadRequest.current;
    setSavedItinerariesLoading(true);
    setSavedItinerariesError(null);
    await queueItineraryOperation(async () => {
      if (!isCurrent()) return;
      try {
        const profile = await fetchUserProfile();
        if (!isCurrent()) return;
        const userId = profile.user._id;
        if (typeof userId !== 'string' || !/^[a-f0-9]{24}$/i.test(userId)) throw new Error('Account unavailable.');
        const key = SAVED_ITINERARIES_KEY + ':' + userId.toLowerCase();
        if (itineraryStorageKey.current && itineraryStorageKey.current !== key) {
          itineraryStorageReady.current = false;
          savedItinerariesRef.current = [];
          setSavedItineraries([]);
          setSavedItinerariesReady(false);
        }
        const raw = await AsyncStorage.getItem(key);
        if (!isCurrent()) return;
        const loaded = readSavedItineraries(raw);
        itineraryStorageKey.current = key;
        itineraryStorageReady.current = true;
        savedItinerariesRef.current = loaded;
        setSavedItineraries(loaded);
        setSavedItinerariesReady(true);
      } catch {
        if (isCurrent()) setSavedItinerariesError('Could not load your saved itineraries. Please try again.');
      } finally {
        if (isCurrent()) setSavedItinerariesLoading(false);
      }
    });
  }, [queueItineraryOperation]);

  const refreshEvents = useCallback(async (): Promise<void> => {
    const thisRequest = ++requestId.current;
    const versionAtStart = mutationVersion.current;
    if (mounted.current) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const [allResult, mineResult] = await Promise.allSettled([fetchEvents(), fetchMyEvents()]);
      if (!mounted.current || thisRequest !== requestId.current) return;
      if (versionAtStart !== mutationVersion.current) {
        void refreshEvents();
        return;
      }
      const errors: string[] = [];
      if (allResult.status === 'fulfilled') setEvents(allResult.value);
      else errors.push(loadError(allResult.reason, 'events'));
      if (mineResult.status === 'fulfilled') setMyEvents(mineResult.value);
      else errors.push(loadError(mineResult.reason, 'your hosted events'));
      setError(errors.length ? [...new Set(errors)].join(' ') : null);
    } finally {
      if (mounted.current && thisRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  const refreshSelections = useCallback(async (clearError = true, quiet = false): Promise<void> => {
    const thisRequest = ++selectionRequestId.current;
    const versionAtStart = selectionMutationVersion.current;
    if (mounted.current) {
      if (!quiet) setSelectionsLoading(true);
      if (clearError) setSelectionsError(null);
    }
    try {
      const saved = await fetchEventSelections();
      if (!mounted.current || thisRequest !== selectionRequestId.current) return;
      if (versionAtStart !== selectionMutationVersion.current || selectionWrites.current.size > 0) {
        // Reject a GET that overlaps a save. Refresh once all pending writes settle.
        selectionRefreshQueued.current = true;
        if (selectionWrites.current.size === 0) {
          selectionRefreshQueued.current = false;
          void refreshSelections(false);
        }
        return;
      }
      const next: Record<string, EventSelection> = {};
      for (const selection of saved) next[selection.eventId] = selection;
      selectionValues.current = next;
      selectionLoadSucceeded.current = true;
      setSelections(next);
      setSelectionsReady(true);
    } catch (reason: unknown) {
      if (mounted.current && thisRequest === selectionRequestId.current) {
        setSelectionsError(loadError(reason, 'your saved event choices'));
      }
    } finally {
      if (mounted.current && thisRequest === selectionRequestId.current) setSelectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    ++itineraryGeneration.current;
    void refreshEvents();
    void refreshSelections();
    void loadSavedItineraries(); // Hydrate saved itineraries when provider mounts.
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active' || !mounted.current) return;
      // Suspended timers must not leave yesterday's events visible after resuming.
      setNow(Date.now());
      void refreshEvents();
      void refreshSelections();
    });
    return () => {
      mounted.current = false;
      ++itineraryGeneration.current;
      ++itineraryLoadRequest.current;
      itineraryStorageReady.current = false;
      appState.remove();
      ++requestId.current;
      ++selectionRequestId.current;
      selectionLoadSucceeded.current = false;
    };
  }, [refreshEvents, refreshSelections, loadSavedItineraries]);

  // Expire cached discovery records at their actual end instant. Keep the raw
  // records separate from the host dashboard and private booking-history data.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function updateClock() {
      const instant = Date.now();
      setNow(instant);
      const futureEnds = loadedEvents.map(event => Date.parse(event.endsAt))
        .filter(end => Number.isFinite(end) && end > instant);
      if (futureEnds.length) {
        const nextEnd = Math.min(...futureEnds);
        timer = setTimeout(updateClock, Math.min(Math.max(nextEnd - instant + 1, 1), 60000));
      }
    }
    updateClock();
    return () => { if (timer) clearTimeout(timer); };
  }, [loadedEvents]);

  const events = useMemo(() => {
    // A response can arrive after an event ends, before the next timer callback.
    const instant = Math.max(now, Date.now());
    return loadedEvents.filter(event => isAvailableEvent(event, instant));
  }, [loadedEvents, now]);

  const addCreatedEvent = useCallback((created: EventItem) => {
    ++mutationVersion.current;
    // Host mutations may return private drafts or archived events. They belong
    // in the host list, never in public discovery or itinerary generation.
    setEvents(current => isAvailableEvent(created)
      ? [created, ...current.filter(event => event.id !== created.id)]
      : current.filter(event => event.id !== created.id));
    setMyEvents(current => [created, ...current.filter(event => event.id !== created.id)]);
  }, []);

  const toggleSelection = useCallback(async (id: string, field: 'interested' | 'attending'): Promise<void> => {
    // Never assume an empty account before its saved choices have loaded. Each
    // event has one in-flight write; its other independent flag is left unchanged.
    if (!mounted.current || !selectionLoadSucceeded.current || selectionWrites.current.has(id)) return;
    const desired = !(selectionValues.current[id]?.[field] ?? false);
    if (field === 'attending' && !desired && selectionValues.current[id]?.attended) {
      Alert.alert('Attendance verified', 'You cannot unregister after the host has checked you in.');
      return;
    }
    selectionWrites.current.add(id);
    ++selectionMutationVersion.current;
    setSelectionsSavingEventIds([...selectionWrites.current]);
    setSelectionsError(null);
    try {
      const saved = await saveEventSelection(id,
        field === 'interested' ? { interested: desired } : { attending: desired });
      if (!mounted.current) return;
      const next = { ...selectionValues.current, [saved.eventId]: saved };
      selectionValues.current = next;
      // Commit only the server response; failed saves never pretend to be persisted.
      setSelections(next);
      // Invalidate list requests that began before this choice committed. Reload
      // aggregate totals from the server rather than estimating audience counts.
      ++mutationVersion.current;
      void refreshEvents();
    } catch (reason: unknown) {
      if (mounted.current) {
        const message = selectionError(reason);
        setSelectionsError(message);
        // A failed write still needs feedback if the user already left Details.
        Alert.alert('Event choice not saved', message);
      }
    } finally {
      ++selectionMutationVersion.current;
      selectionWrites.current.delete(id);
      if (mounted.current) {
        setSelectionsSavingEventIds([...selectionWrites.current]);
        if (selectionWrites.current.size === 0 && selectionRefreshQueued.current) {
          selectionRefreshQueued.current = false;
          void refreshSelections(false);
        }
      }
    }
  }, [refreshSelections, refreshEvents]);

  // Updates attending status for multiple events without clobbering in-flight writes.
  const setBulkRsvp = useCallback(async (eventIds: string[], attending: boolean): Promise<boolean> => {
    if (!mounted.current || !selectionLoadSucceeded.current) return false;
    const ids = [...new Set(eventIds)].filter(id => Boolean(id));
    if (!ids.length) return true;
    if (ids.some(id => selectionWrites.current.has(id))) {
      const message = 'An event choice is still saving. Please try again when it finishes.';
      setSelectionsError(message);
      Alert.alert('RSVP update pending', message);
      return false;
    }
    if (!attending && ids.some(id => selectionValues.current[id]?.attended)) {
      const message = 'You cannot unregister after the host has checked you in.';
      setSelectionsError(message);
      Alert.alert('Attendance verified', message);
      return false;
    }

    for (const id of ids) selectionWrites.current.add(id); // Lock targeted event IDs during save.
    ++selectionMutationVersion.current;
    setSelectionsSavingEventIds([...selectionWrites.current]);
    setSelectionsError(null);

    try {
      const results = await Promise.allSettled(
        ids.map(id => saveEventSelection(id, { attending }))
      );
      if (!mounted.current) return false;

      const next = { ...selectionValues.current };
      let anySaved = false;
      let firstError: string | null = null;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          anySaved = true;
          next[result.value.eventId] = result.value; // Commit server state for succeeded items.
        } else if (!firstError) {
          firstError = selectionError(result.reason);
        }
      }

      if (anySaved) {
        selectionValues.current = next;
        setSelections(next);
        ++mutationVersion.current;
        void refreshEvents(); // Refresh server audience counts after bulk update.
      }

      if (firstError) {
        setSelectionsError(firstError);
        Alert.alert('RSVP update incomplete', firstError);
        return false;
      }
      return true;
    } finally {
      ++selectionMutationVersion.current;
      for (const id of ids) selectionWrites.current.delete(id); // Release write locks.
      if (mounted.current) {
        setSelectionsSavingEventIds([...selectionWrites.current]);
        if (selectionWrites.current.size === 0 && selectionRefreshQueued.current) {
          selectionRefreshQueued.current = false;
          void refreshSelections(false);
        }
      }
    }
  }, [refreshEvents, refreshSelections]);

  // Commit UI state only after the account-scoped storage write succeeds.
  const saveItinerary = useCallback(async (title: string, itineraryEvents: EventItem[]): Promise<SavedItinerary | null> => {
    const eventIds = [...new Set(itineraryEvents.map(event => event.id).filter(Boolean))];
    if (!eventIds.length) return null; // Skip saving empty itineraries.
    const generation = itineraryGeneration.current;
    const isCurrent = () => mounted.current && generation === itineraryGeneration.current;
    return queueItineraryOperation(async () => {
      if (!isCurrent()) return null;
      const key = itineraryStorageKey.current;
      if (!key || !itineraryStorageReady.current) {
        const message = 'Load your saved itineraries before saving a new one.';
        setSavedItinerariesError(message);
        Alert.alert('Itinerary not saved', message);
        return null;
      }
      const createdAt = new Date().toISOString();
      const created: SavedItinerary = {
        id: `itinerary_${Date.now()}`,
        title: title.trim().slice(0, 60) || 'Saved Itinerary',
        createdAt,
        eventIds,
        eventsSnapshot: itineraryEvents,
      };
      // Consecutive queued saves can share a clock millisecond; retain both records.
      while (savedItinerariesRef.current.some(item => item.id === created.id)) created.id += '_1';
      const nextList = [created, ...savedItinerariesRef.current];
      try {
        await AsyncStorage.setItem(key, JSON.stringify(nextList));
        if (!isCurrent()) return null;
        savedItinerariesRef.current = nextList;
        setSavedItineraries(nextList);
        setSavedItinerariesError(null);
        return created;
      } catch {
        if (isCurrent()) {
          const message = 'Your itinerary could not be saved on this device. Please try again.';
          setSavedItinerariesError(message);
          Alert.alert('Itinerary not saved', message);
        }
        return null;
      }
    });
  }, [queueItineraryOperation]);

  // Deletes a saved itinerary by ID and syncs AsyncStorage.
  const deleteItinerary = useCallback(async (id: string): Promise<void> => {
    const generation = itineraryGeneration.current;
    const isCurrent = () => mounted.current && generation === itineraryGeneration.current;
    await queueItineraryOperation(async () => {
      if (!isCurrent()) return;
      const key = itineraryStorageKey.current;
      if (!key || !itineraryStorageReady.current) {
        const message = 'Load your saved itineraries before deleting one.';
        setSavedItinerariesError(message);
        Alert.alert('Itinerary not deleted', message);
        return;
      }
      const nextList = savedItinerariesRef.current.filter(item => item.id !== id);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(nextList));
        if (!isCurrent()) return;
        savedItinerariesRef.current = nextList;
        setSavedItineraries(nextList);
        setSavedItinerariesError(null);
      } catch {
        if (isCurrent()) {
          const message = 'Your itinerary could not be deleted. It is still saved; please try again.';
          setSavedItinerariesError(message);
          Alert.alert('Itinerary not deleted', message);
        }
      }
    });
  }, [queueItineraryOperation]);

  // Void callbacks preserve existing consumers and handle async failures centrally.
  const toggleInterested = useCallback((id: string) => { void toggleSelection(id, 'interested'); }, [toggleSelection]);
  const toggleAttending = useCallback((id: string) => { void toggleSelection(id, 'attending'); }, [toggleSelection]);
  const interestedEventIds = Object.values(selections).filter(item => item.interested).map(item => item.eventId);
  const attendingEventIds = Object.values(selections).filter(item => item.attending).map(item => item.eventId);
  const attendedEventIds = Object.values(selections).filter(item => item.attended).map(item => item.eventId);

  const recordView = useCallback(async (id: string) => {
    setViewedEventIds(current => current.includes(id) ? current : [...current, id]);
  }, []);

  return (
    <EventsContext.Provider value={{
      events, myEvents, isLoading, error, refreshEvents,
      addCreatedEvent, interestedEventIds, attendingEventIds, attendedEventIds, toggleInterested, toggleAttending,
      setBulkRsvp, savedItineraries, saveItinerary, deleteItinerary,
      savedItinerariesLoading, savedItinerariesReady, savedItinerariesError, refreshSavedItineraries: loadSavedItineraries,
      selectionsLoading, selectionsReady, selectionsSavingEventIds, selectionsError, refreshSelections,
      viewedEventIds, recordView
    }}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents(): EventsContextValue {
  const context = useContext(EventsContext);
  if (!context) throw new Error('useEvents must be used inside the signed-in EventsProvider.');
  return context;
}
