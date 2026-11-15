import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { fetchUserProfile } from '../api/client';
import type { UserProfileResponse } from '../api/client';
import { fetchFriendsNetwork } from '../api/friends';
import type { FriendItem, FriendsNetworkResponse, PendingRequest, SentRequest } from '../api/friends';
import { fetchBookingHistory } from '../api/events';
import type { BookingHistoryItem } from '../api/events';
import { fetchMyStores } from '../api/stores';
import type { StoreItem } from '../api/stores';
import { settingsErrorMessage } from '../api/settings';

interface UserDataContextValue {
  user: UserProfileResponse['user'] | null;
  setUser: Dispatch<SetStateAction<UserProfileResponse['user'] | null>>;
  friends: FriendItem[];
  friendRequests: PendingRequest[];
  sentRequests: SentRequest[];
  attendedBookings: BookingHistoryItem[];
  stores: StoreItem[];
  profileLoading: boolean;
  profileError: string | null;
  friendsLoading: boolean;
  friendsError: string | null;
  attendedLoading: boolean;
  attendedError: string | null;
  storesLoading: boolean;
  storesError: string | null;
  isInitialLoading: boolean;
  refreshProfile: (force?: boolean) => Promise<void>;
  refreshFriends: (force?: boolean) => Promise<void>;
  refreshAttended: (force?: boolean) => Promise<void>;
  refreshStores: (force?: boolean) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue | undefined>(undefined);
const STALE_MS = 30_000;
const readProfile = async (signal: AbortSignal) => (await fetchUserProfile(signal)).user;
const readAttended = async (signal: AbortSignal) => (await fetchBookingHistory(signal)).filter(booking => booking.attending);

// One cache per resource shares requests between screens. A forced refresh or a
// saved response supersedes older reads; late/unmounted responses cannot win.
function useCachedResource<T>(initial: T, read: (signal: AbortSignal) => Promise<T>, failure: string) {
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const version = useRef(0);
  const lastFetched = useRef(0);
  const pending = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; ++version.current;
      pending.current?.controller.abort(); pending.current = null;
    };
  }, []);

  const refresh = useCallback((force = false): Promise<void> => {
    if (!alive.current) return Promise.resolve();
    if (!force && pending.current) return pending.current.promise;
    if (!force && lastFetched.current > 0 && Date.now() - lastFetched.current < STALE_MS) return Promise.resolve();
    pending.current?.controller.abort();
    const current = ++version.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    const promise = (async () => {
      try {
        const saved = await read(controller.signal);
        if (!alive.current || current !== version.current || controller.signal.aborted) return;
        setValue(saved); lastFetched.current = Date.now();
      } catch (reason: unknown) {
        if (alive.current && current === version.current && !controller.signal.aborted) {
          setError(settingsErrorMessage(reason, failure));
        }
      } finally {
        if (alive.current && current === version.current) { setLoading(false); pending.current = null; }
      }
    })();
    pending.current = { controller, promise };
    return promise;
  }, [read, failure]);

  const replace: Dispatch<SetStateAction<T>> = useCallback(next => {
    if (!alive.current) return;
    ++version.current; pending.current?.controller.abort(); pending.current = null;
    lastFetched.current = Date.now();
    setValue(next); setError(null); setLoading(false);
  }, []);
  return { value, replace, loading, error, refresh };
}

// The authenticated navigator owns this provider. Logging out unmounts all data.
export function UserDataProvider({ children }: { children: ReactNode }) {
  const profile = useCachedResource<UserProfileResponse['user'] | null>(null, readProfile, 'Unable to load your profile. Please try again.');
  const network = useCachedResource<FriendsNetworkResponse>({ friends: [], pendingRequests: [], sentRequests: [] }, fetchFriendsNetwork, 'Unable to load friends and requests. Please try again.');
  const attended = useCachedResource<BookingHistoryItem[]>([], readAttended, 'Unable to load your attended events. Please try again.');
  const stores = useCachedResource<StoreItem[]>([], fetchMyStores, 'Unable to load your stores. Please try again.');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const refreshAll = useCallback(async () => {
    await Promise.all([profile.refresh(true), network.refresh(true), attended.refresh(true), stores.refresh(true)]);
  }, [profile.refresh, network.refresh, attended.refresh, stores.refresh]);

  useEffect(() => {
    let active = true;
    // Reuse any request already started by the first focused screen.
    void Promise.all([profile.refresh(), network.refresh(), attended.refresh(), stores.refresh()])
      .finally(() => { if (active) setIsInitialLoading(false); });
    return () => { active = false; };
  }, [profile.refresh, network.refresh, attended.refresh, stores.refresh]);

  return <UserDataContext.Provider value={{
    user: profile.value, setUser: profile.replace,
    friends: network.value.friends, friendRequests: network.value.pendingRequests, sentRequests: network.value.sentRequests,
    attendedBookings: attended.value, stores: stores.value,
    profileLoading: profile.loading, profileError: profile.error,
    friendsLoading: network.loading, friendsError: network.error,
    attendedLoading: attended.loading, attendedError: attended.error,
    storesLoading: stores.loading, storesError: stores.error, isInitialLoading,
    refreshProfile: profile.refresh, refreshFriends: network.refresh, refreshAttended: attended.refresh, refreshStores: stores.refresh, refreshAll,
  }}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataContextValue {
  const value = useContext(UserDataContext);
  if (!value) throw new Error('useUserData must be used within a UserDataProvider');
  return value;
}
