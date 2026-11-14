import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { fetchNotificationInbox, fetchNotificationUnreadCount, markAllNotificationsRead, setNotificationRead } from '../api/notifications';
import type { AppNotification } from '../api/notifications';
import { settingsErrorMessage } from '../api/settings';

interface NotificationsValue {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  actionError: string | null;
  saving: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setRead: (id: string, read: boolean) => Promise<boolean>;
  readAll: () => Promise<boolean>;
}
const Context = createContext<NotificationsValue | null>(null);

// This provider belongs to the authenticated navigator. Logout discards all inbox data.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const items = useRef<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const paginated = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const pendingRead = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const readingMore = useRef(false);
  const loaded = useRef(false);

  const replaceItems = useCallback((next: AppNotification[]) => { items.current = next; setNotifications(next); }, []);
  const cancelReads = useCallback(() => { ++revision.current; pendingRead.current?.abort(); pendingRead.current = null; }, []);

  const load = useCallback(async (unreadOnly = false) => {
    if (!alive.current || writing.current) return;
    cancelReads();
    const version = revision.current;
    const controller = new AbortController();
    pendingRead.current = controller;
    readingMore.current = false; setLoadingMore(false);
    if (!unreadOnly) { setIsLoading(!loaded.current); setRefreshing(loaded.current); setError(null); }
    try {
      const [count, page] = await Promise.all([
        fetchNotificationUnreadCount(controller.signal),
        unreadOnly ? Promise.resolve(null) : fetchNotificationInbox(undefined, controller.signal),
      ]);
      if (!alive.current || revision.current !== version || controller.signal.aborted) return;
      setUnreadCount(count);
      if (page) {
        replaceItems(page.notifications); cursorRef.current = page.nextCursor; setCursor(page.nextCursor);
        paginated.current = false; loaded.current = true;
      }
    } catch (reason: unknown) {
      if (alive.current && revision.current === version && !controller.signal.aborted) {
        setError(settingsErrorMessage(reason, 'Unable to load notifications. Please try again.'));
      }
    } finally {
      if (alive.current && revision.current === version) {
        setIsLoading(false); setRefreshing(false); pendingRead.current = null;
      }
    }
  }, [cancelReads, replaceItems]);
  const refresh = useCallback(() => load(false), [load]);

  const loadMore = useCallback(async () => {
    if (!alive.current || writing.current || pendingRead.current || readingMore.current || !cursorRef.current) return;
    const nextCursor = cursorRef.current;
    const version = revision.current;
    const controller = new AbortController();
    pendingRead.current = controller; readingMore.current = true; setLoadingMore(true); setError(null);
    try {
      const page = await fetchNotificationInbox(nextCursor, controller.signal);
      if (!alive.current || revision.current !== version || controller.signal.aborted) return;
      const seen = new Set(items.current.map(item => item.id));
      replaceItems([...items.current, ...page.notifications.filter(item => !seen.has(item.id))]);
      cursorRef.current = page.nextCursor; setCursor(page.nextCursor); paginated.current = true;
    } catch (reason: unknown) {
      if (alive.current && revision.current === version && !controller.signal.aborted) {
        setError(settingsErrorMessage(reason, 'Unable to load more notifications. Please try again.'));
      }
    } finally {
      if (alive.current && revision.current === version) {
        readingMore.current = false; setLoadingMore(false); pendingRead.current = null;
      }
    }
  }, [replaceItems]);

  const mutate = useCallback(async (id?: string, read = true): Promise<boolean> => {
    if (!alive.current || writing.current) return false;
    writing.current = true; cancelReads();
    const version = revision.current;
    setSaving(true); setActionError(null); setIsLoading(false); setRefreshing(false); setLoadingMore(false); readingMore.current = false;
    let succeeded = false;
    try {
      if (id) {
        const previous = items.current.find(item => item.id === id);
        const saved = await setNotificationRead(id, read);
        if (!alive.current || revision.current !== version) return false;
        replaceItems(items.current.map(item => item.id === id ? saved : item));
        if (previous && previous.isRead !== saved.isRead) setUnreadCount(count => Math.max(0, count + (saved.isRead ? -1 : 1)));
      } else {
        await markAllNotificationsRead();
        if (!alive.current || revision.current !== version) return false;
        replaceItems(items.current.map(item => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
        setUnreadCount(0);
      }
      succeeded = true;
    } catch (reason: unknown) {
      if (alive.current && revision.current === version) setActionError(settingsErrorMessage(reason, 'Unable to update notification status. Please try again.'));
    } finally {
      writing.current = false;
      if (alive.current && revision.current === version) setSaving(false);
    }
    if (succeeded && alive.current) void load(true);
    return succeeded;
  }, [cancelReads, load, replaceItems]);
  const setRead = useCallback((id: string, read: boolean) => mutate(id, read), [mutate]);
  const readAll = useCallback(() => mutate(), [mutate]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => {
      // Do not reset an expanded page while someone is browsing older notifications.
      if (AppState.currentState === 'active' && !pendingRead.current) void load(paginated.current);
    }, 30000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
      else {
        if (!writing.current) cancelReads();
        setIsLoading(false); setRefreshing(false); setLoadingMore(false); readingMore.current = false;
      }
    });
    return () => { alive.current = false; cancelReads(); clearInterval(timer); listener.remove(); };
  }, [cancelReads, load, refresh]);

  return <Context.Provider value={{ notifications, unreadCount, isLoading, refreshing, loadingMore, hasMore: Boolean(cursor),
    error, actionError, saving, refresh, loadMore, setRead, readAll }}>{children}</Context.Provider>;
}

export function useNotifications(): NotificationsValue {
  const value = useContext(Context);
  if (!value) throw new Error('Notifications must be used inside the signed-in navigator.');
  return value;
}
