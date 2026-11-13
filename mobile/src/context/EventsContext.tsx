import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import { isAxiosError } from 'axios';
import { fetchEvents, fetchMyEvents, fetchEventSelections, saveEventSelection } from '../api/events';
import type { EventSelection } from '../api/events';
import type { EventItem } from '../data/events';

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
  const mounted = useRef(false);
  const requestId = useRef(0);
  const mutationVersion = useRef(0);
  const selectionRequestId = useRef(0);
  const selectionMutationVersion = useRef(0);
  const selectionValues = useRef<Record<string, EventSelection>>({});
  const selectionLoadSucceeded = useRef(false);
  const selectionWrites = useRef(new Set<string>());
  const selectionRefreshQueued = useRef(false);

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
  }, [refreshEvents, refreshSelections]);

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

  // Void callbacks preserve existing consumers and handle async failures centrally.
  const toggleInterested = useCallback((id: string) => { void toggleSelection(id, 'interested'); }, [toggleSelection]);
  const toggleAttending = useCallback((id: string) => { void toggleSelection(id, 'attending'); }, [toggleSelection]);
  const interestedEventIds = Object.values(selections).filter(item => item.interested).map(item => item.eventId);
  const attendingEventIds = Object.values(selections).filter(item => item.attending).map(item => item.eventId);

  const recordView = useCallback(async (id: string) => {
    setViewedEventIds(current => current.includes(id) ? current : [...current, id]);
  }, []);

  return (
    <EventsContext.Provider value={{ events, myEvents, isLoading, error, refreshEvents,
      addCreatedEvent, interestedEventIds, attendingEventIds, toggleInterested, toggleAttending,
      selectionsLoading, selectionsReady, selectionsSavingEventIds, selectionsError, refreshSelections,
      viewedEventIds, recordView }}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents(): EventsContextValue {
  const context = useContext(EventsContext);
  if (!context) throw new Error('useEvents must be used inside the signed-in EventsProvider.');
  return context;
}
