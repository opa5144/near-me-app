import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import { fetchEvents, fetchMyEvents, fetchEventSelections, saveEventSelection } from '../api/events';
import type { EventSelection } from '../api/events';
import type { EventItem } from '../data/events';

// Storage key for persisting saved itineraries across app sessions.
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
  toggleInterested: (id: string) => void;
  toggleAttending: (id: string) => void;
  setBulkRsvp: (eventIds: string[], attending: boolean) => Promise<boolean>; // Bulk RSVP helper for itineraries.
  savedItineraries: SavedItinerary[]; // Persisted user itineraries.
  saveItinerary: (title: string, itineraryEvents: EventItem[]) => Promise<SavedItinerary | null>; // Saves an itinerary to storage.
  deleteItinerary: (id: string) => Promise<void>; // Removes a saved itinerary from state and storage.
  selectionsLoading: boolean;
  selectionsReady: boolean;
  selectionsSavingEventIds: string[];
  selectionsError: string | null;
  refreshSelections: () => Promise<void>;
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

  // Loads previously persisted itineraries from AsyncStorage on startup.
  const loadSavedItineraries = useCallback(async (): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(SAVED_ITINERARIES_KEY);
      if (!mounted.current || !raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((item): item is SavedItinerary =>
        Boolean(item && typeof item === 'object' && typeof (item as SavedItinerary).id === 'string' && Array.isArray((item as SavedItinerary).eventIds))
      );
      savedItinerariesRef.current = valid;
      setSavedItineraries(valid);
    } catch {
      // Ignore malformed storage data and keep empty list.
    }
  }, []);

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

  const refreshSelections = useCallback(async (clearError = true): Promise<void> => {
    const thisRequest = ++selectionRequestId.current;
    const versionAtStart = selectionMutationVersion.current;
    if (mounted.current) {
      setSelectionsLoading(true);
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
    return loadedEvents.filter(event => {
      const start = Date.parse(event.startsAt);
      const end = Date.parse(event.endsAt);
      return Number.isFinite(start) && Number.isFinite(end) && start < end && end > instant;
    });
  }, [loadedEvents, now]);

  const addCreatedEvent = useCallback((created: EventItem) => {
    ++mutationVersion.current;
    setEvents(current => [created, ...current.filter(event => event.id !== created.id)]);
    setMyEvents(current => [created, ...current.filter(event => event.id !== created.id)]);
  }, []);

  const toggleSelection = useCallback(async (id: string, field: 'interested' | 'attending'): Promise<void> => {
    // Never assume an empty account before its saved choices have loaded. Each
    // event has one in-flight write; its other independent flag is left unchanged.
    if (!mounted.current || !selectionLoadSucceeded.current || selectionWrites.current.has(id)) return;
    const desired = !(selectionValues.current[id]?.[field] ?? false);
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
    const ids = [...new Set(eventIds)].filter(id => Boolean(id) && !selectionWrites.current.has(id));
    if (!ids.length) return true;

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

  // Persists an itinerary to AsyncStorage and updates context state.
  const saveItinerary = useCallback(async (title: string, itineraryEvents: EventItem[]): Promise<SavedItinerary | null> => {
    const eventIds = [...new Set(itineraryEvents.map(event => event.id).filter(Boolean))];
    if (!eventIds.length) return null; // Skip saving empty itineraries.

    const created: SavedItinerary = {
      id: `itinerary_${Date.now()}`,
      title: title.trim() || 'Saved Itinerary',
      createdAt: new Date().toISOString(),
      eventIds,
      eventsSnapshot: itineraryEvents, // Preserve event details even if events expire later.
    };

    const nextList = [created, ...savedItinerariesRef.current];
    savedItinerariesRef.current = nextList;
    if (mounted.current) setSavedItineraries(nextList);

    try {
      await AsyncStorage.setItem(SAVED_ITINERARIES_KEY, JSON.stringify(nextList));
    } catch {
      // Keep in-memory state if AsyncStorage write fails.
    }
    return created;
  }, []);

  // Deletes a saved itinerary by ID and syncs AsyncStorage.
  const deleteItinerary = useCallback(async (id: string): Promise<void> => {
    const nextList = savedItinerariesRef.current.filter(item => item.id !== id); // Remove matching itinerary.
    savedItinerariesRef.current = nextList; // Keep ref in sync for rapid subsequent mutations.
    if (mounted.current) setSavedItineraries(nextList); // Update UI state.
    try {
      await AsyncStorage.setItem(SAVED_ITINERARIES_KEY, JSON.stringify(nextList)); // Persist updated list.
    } catch {
      // Keep in-memory state if AsyncStorage write fails.
    }
  }, []);

  // Void callbacks preserve existing consumers and handle async failures centrally.
  const toggleInterested = useCallback((id: string) => { void toggleSelection(id, 'interested'); }, [toggleSelection]);
  const toggleAttending = useCallback((id: string) => { void toggleSelection(id, 'attending'); }, [toggleSelection]);
  const interestedEventIds = Object.values(selections).filter(item => item.interested).map(item => item.eventId);
  const attendingEventIds = Object.values(selections).filter(item => item.attending).map(item => item.eventId);

  const recordView = useCallback(async (id: string) => {
    setViewedEventIds(current => current.includes(id) ? current : [...current, id]);
  }, []);

  return (
    <EventsContext.Provider value={{
      events, myEvents, isLoading, error, refreshEvents,
      addCreatedEvent, interestedEventIds, attendingEventIds, toggleInterested, toggleAttending,
      setBulkRsvp, savedItineraries, saveItinerary, deleteItinerary,
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