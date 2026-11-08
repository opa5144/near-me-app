import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isAxiosError } from 'axios';
// Adjust this import to match wherever your user API functions reside
import { fetchUserProfile } from '../api/users';

interface UserProfile {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  [key: string]: any;
}

interface UserContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  updateUserAvatar: (newAvatarUrl: string) => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

// Convert transport failures into friendly screen messages without exposing Axios internals.
function loadError(reason: unknown): string {
  if (isAxiosError(reason) && reason.response?.status === 401) {
    return 'Your session expired. Sign in again to load your profile.';
  }
  return 'Could not load user profile. Check your connection and try again.';
}

// Mounted only after login. The API client must already have its Bearer token.
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  // requestId rejects older refreshes; mutationVersion rejects reads that began
  // before a successful profile update changed local data.
  const requestId = useRef(0);
  const mutationVersion = useRef(0);

  const refreshUser = useCallback(async (): Promise<void> => {
    const thisRequest = ++requestId.current;
    const versionAtStart = mutationVersion.current;
    if (mounted.current) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const userData = await fetchUserProfile(); // e.g., GET /api/users/me
      
      // Leaving the signed-in app or starting a newer refresh invalidates this one.
      if (!mounted.current || thisRequest !== requestId.current) return;
      if (versionAtStart !== mutationVersion.current) {
        // A mutation completed during this GET. Reject stale results and load again.
        void refreshUser();
        return;
      }

      setUser(userData.user || userData);
      setError(null);
    } catch (reason) {
      if (!mounted.current || thisRequest !== requestId.current) return;
      setError(loadError(reason));
    } finally {
      // An older request must not hide the loading indicator of a newer refresh.
      if (mounted.current && thisRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshUser();
    return () => {
      // Pending HTTP promises can still resolve after this provider is removed.
      mounted.current = false;
      ++requestId.current;
    };
  }, [refreshUser]);

  // Optimistically update the avatar locally and bump mutation version
  const updateUserAvatar = useCallback((newAvatarUrl: string) => {
    ++mutationVersion.current;
    setUser(current => current ? { ...current, avatarUrl: newAvatarUrl } : null);
  }, []);

  return (
    <UserContext.Provider value={{ user, isLoading, error, refreshUser, updateUserAvatar }}>
      {children}
    </UserContext.Provider>
  );
}

// Fail clearly if a screen is accidentally rendered outside the signed-in provider.
export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used inside UserProvider.');
  return context;
}