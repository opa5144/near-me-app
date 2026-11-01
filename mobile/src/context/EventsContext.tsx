import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { fetchEvents, fetchMyEvents } from '../api/events';
import type { EventItem } from '../data/events';

// One shared event source keeps Home, Search, Host, Plans, and creation in sync.
interface EventsContextValue {
  events: EventItem[];
  myEvents: EventItem[];
  isLoading: boolean;
  error: string | null;
  refreshEvents: () => Promise<void>;
  addCreatedEvent: (event: EventItem) => void;
  interestedEventIds: string[];
  toggleInterested: (id: string) => void;
}

const EventsContext = createContext<EventsContextValue | undefined>(undefined);

// Convert transport failures into screen messages without exposing Axios internals.
function loadError(reason: unknown, list: string): string {
  if (isAxiosError(reason) && reason.response?.status === 401) {
    return 'Your session expired. Sign in again to load your hosted events.';
  }
  return `Could not load ${list}. Check your connection and try again.`;
}

// Mounted only after login. The API client must already have its Bearer token.
export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interestedEventIds, setInterestedEventIds] = useState<string[]>([]);
  const mounted = useRef(false);
  // requestId rejects older refreshes; mutationVersion rejects reads that began
  // before a successful creation changed the local lists.
  const requestId = useRef(0);
  const mutationVersion = useRef(0);

  const refreshEvents = useCallback(async (): Promise<void> => {
    const thisRequest = ++requestId.current;
    const versionAtStart = mutationVersion.current;
    if (mounted.current) {
      setIsLoading(true);
      setError(null);
    }
    try {
      // A failure in the protected list does not discard a successful public list.
      const [allResult, mineResult] = await Promise.allSettled([
        fetchEvents(),
        fetchMyEvents(),
      ]);
      // Leaving the signed-in app or starting a newer refresh invalidates this one.
      if (!mounted.current || thisRequest !== requestId.current) return;
      if (versionAtStart !== mutationVersion.current) {
        // A POST completed during this GET. Reject stale results and load again
        // so a freshly created event cannot be overwritten by the older list.
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
      // An older request must not hide the loading indicator of a newer refresh.
      if (mounted.current && thisRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshEvents();
    return () => {
      // Pending HTTP promises can still resolve after this provider is removed.
      mounted.current = false;
      ++requestId.current;
    };
  }, [refreshEvents]);

  const addCreatedEvent = useCallback((created: EventItem) => {
    ++mutationVersion.current;
    // The authenticated POST response supplies the real ID and normalized data.
    setEvents(current => [created, ...current.filter(event => event.id !== created.id)]);
    setMyEvents(current => [created, ...current.filter(event => event.id !== created.id)]);
  }, []);

  const toggleInterested = useCallback((id: string) => {
    // Session memory only. Persisting interests on an account is a separate feature.
    setInterestedEventIds(current => current.includes(id)
      ? current.filter(existing => existing !== id)
      : [...current, id]);
  }, []);

  return (
    <EventsContext.Provider value={{ events, myEvents, isLoading, error, refreshEvents,
      addCreatedEvent, interestedEventIds, toggleInterested }}>
      {children}
    </EventsContext.Provider>
  );
}

// Fail clearly if a screen is accidentally rendered outside the signed-in provider.
export function useEvents(): EventsContextValue {
  const context = useContext(EventsContext);
  if (!context) throw new Error('useEvents must be used inside EventsProvider.');
  return context;
}
