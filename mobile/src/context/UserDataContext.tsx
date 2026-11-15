import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchUserProfile } from '../api/client';
import { fetchFriendsNetwork, FriendItem, PendingRequest, SentRequest } from '../api/friends';
import { fetchBookingHistory, BookingHistoryItem } from '../api/events';
import { fetchMyStores, StoreItem } from '../api/stores';

interface UserDataContextValue {
  user: any | null;
  setUser: React.Dispatch<React.SetStateAction<any | null>>;
  friends: FriendItem[];
  friendRequests: PendingRequest[];
  sentRequests: SentRequest[];
  attendedBookings: BookingHistoryItem[];
  stores: StoreItem[];
  storesError: string | null;
  isInitialLoading: boolean;
  refreshProfile: (force?: boolean) => Promise<void>;
  refreshFriends: (force?: boolean) => Promise<void>;
  refreshAttended: (force?: boolean) => Promise<void>;
  refreshStores: (force?: boolean) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue | undefined>(undefined);

const STALE_MS = 30_000; // Prevent redundant background calls within 30s

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<PendingRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [attendedBookings, setAttendedBookings] = useState<BookingHistoryItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  const lastFetchedRef = useRef<{ profile: number; friends: number; attended: number; stores: number }>({
    profile: 0,
    friends: 0,
    attended: 0,
    stores: 0,
  });

  const refreshProfile = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchedRef.current.profile > 0 && now - lastFetchedRef.current.profile < STALE_MS) {
      return;
    }
    try {
      const res: any = await fetchUserProfile();
      if (res?.user) {
        setUser(res.user);
        lastFetchedRef.current.profile = Date.now();
      }
    } catch (err: any) {
      console.log('Background profile sync failed:', err?.message);
    }
  }, []);

  const refreshFriends = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchedRef.current.friends > 0 && now - lastFetchedRef.current.friends < STALE_MS) {
      return;
    }
    try {
      const data = await fetchFriendsNetwork();
      setFriends(data.friends || []);
      setFriendRequests(data.pendingRequests || []);
      setSentRequests(data.sentRequests || []);
      lastFetchedRef.current.friends = Date.now();
    } catch (err: any) {
      console.log('Background friends sync failed:', err?.message);
    }
  }, []);

  const refreshAttended = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchedRef.current.attended > 0 && now - lastFetchedRef.current.attended < STALE_MS) {
      return;
    }
    try {
      const bookings = await fetchBookingHistory();
      setAttendedBookings(bookings.filter(b => b.attending));
      lastFetchedRef.current.attended = Date.now();
    } catch (err: any) {
      console.log('Background attended bookings sync failed:', err?.message);
    }
  }, []);

  const refreshStores = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchedRef.current.stores > 0 && now - lastFetchedRef.current.stores < STALE_MS) {
      return;
    }
    try {
      setStoresError(null);
      const savedStores = await fetchMyStores();
      setStores(savedStores || []);
      lastFetchedRef.current.stores = Date.now();
    } catch (err: any) {
      console.log('Background stores sync failed:', err?.message);
      if (lastFetchedRef.current.stores === 0) {
        setStoresError('Unable to load your stores. Please try again.');
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshProfile(true),
      refreshFriends(true),
      refreshAttended(true),
      refreshStores(true),
    ]);
  }, [refreshProfile, refreshFriends, refreshAttended, refreshStores]);

  // Pre-load all user data once on app mount
  useEffect(() => {
    let active = true;
    void refreshAll().finally(() => {
      if (active) setIsInitialLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshAll]);

  return (
    <UserDataContext.Provider
      value={{
        user,
        setUser,
        friends,
        friendRequests,
        sentRequests,
        attendedBookings,
        stores,
        storesError,
        isInitialLoading,
        refreshProfile,
        refreshFriends,
        refreshAttended,
        refreshStores,
        refreshAll,
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData() {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return ctx;
}