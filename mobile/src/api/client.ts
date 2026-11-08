import axios from 'axios';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

// Use Expo's development-server host to reach the backend on the same computer.
// Every helper below uses this shared /api base URL and the same session header.
const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
const ipAddress = hostUri ? hostUri.split(':')[0] : 'localhost';

const API_BASE_URL = `http://${ipAddress}:5000/api`; 

console.log('Connecting to Backend API at:', API_BASE_URL);

 

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export interface ScheduleRequest {
  interests: string[];
  maxBudget: number;
  startTime: string;
  endTime: string;
  isSurprise?: boolean;
}

// The legacy itinerary endpoint returns a generated schedule rather than an event list.
export const fetchSchedule = async (params: ScheduleRequest) => {
  const response = await api.post('/itinerary/generate', params);
  return response.data;
};

// --- Authentication

// Signup sends the original password; hashing happens only in the backend.
export interface SignupRequest { // Account fields accepted by the signup route.
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

// Responses contain safe account details, never the password or its stored hash.
export interface SignupResponse {
  message: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    avatarUrl?: string;
  };
}

// Form screens await this helper and handle validation/duplicate-account errors.
export async function signupUser(
  form: SignupRequest, 
): Promise<SignupResponse> {
  const response = await api.post<SignupResponse>(
      '/auth/signup',
      form,
  );

  return response.data;
}

// Login uses the existing account's email and unmodified password.
export interface LoginRequest{
  email: string;
  password: string;
}
export interface LoginResponse {
  message: string;
  user: SignupResponse['user'];
  accessToken: string;
  expiresAt: string;
}


// Password verification may require a second proof before a session is issued.
export interface LoginMfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  expiresAt: string;
}

export interface LoginMfaRequest {
  challengeToken: string;
  code?: string;
  recoveryCode?: string;
}

export interface LoginErrorResponse {
  message?: string;
  errors?: Partial<Record<'email' | 'password' | 'code' | 'recoveryCode', string>>;
  retryAfterSeconds?: number;
  lockedUntil?: string;
}

// --- Profile

// Responses contain safe account details loaded from the current session.
export interface UserProfileResponse {
  user: SignupResponse['user'] & {
    phone?: string;
    dob?: string;
    bio?: string;
  };
}

export interface UpdateUserProfileRequest {
  username: string;
  email: string;
  phone: string;
  dob: string;
  bio: string;
}

// Validation and duplicate-account errors belong beside the corresponding field.
export interface UserProfileErrorResponse {
  message?: string;
  errors?: Partial<Record<keyof UpdateUserProfileRequest, string>>;
}

// A screen can cancel its profile load when it closes.
export async function fetchUserProfile(signal?: AbortSignal): Promise<UserProfileResponse> {
  const response = await api.get<UserProfileResponse>('/auth/me', { signal });
  return response.data;
}

// Save the complete account form and return the server's current profile.
export async function updateUserProfile(form: UpdateUserProfileRequest): Promise<UserProfileResponse> {
  const response = await api.patch<UserProfileResponse>('/auth/me', form);
  return response.data;
}

// Session changes from login or Security Settings use the same validated token path.
export function installSession(session: { accessToken: string; expiresAt: string }): void {
  if (typeof session.accessToken !== 'string' || !/^[a-f0-9]{64}$/i.test(session.accessToken) ||
      typeof session.expiresAt !== 'string' || !Number.isFinite(Date.parse(session.expiresAt))) {
    throw new Error('The backend response did not include a valid session.');
  }
  // Memory only: this does not implement Remember me or local storage.
  api.defaults.headers.common.Authorization = 'Bearer ' + session.accessToken;
}

type PendingSessionRotation = { count: number; deferred401: boolean };
const pendingSessionRotations = new Map<string, PendingSessionRotation>();

// Security writes replace the token on the server before their HTTP response
// arrives. Hold old-token 401s until every overlapping rotation has settled.
export async function withSessionRotation<T extends { accessToken: string; expiresAt: string }>(
  request: () => Promise<T>,
): Promise<T> {
  const originalAuthorization = api.defaults.headers.common.Authorization;
  if (typeof originalAuthorization !== 'string' || !originalAuthorization) {
    throw new Error('Please sign in again.');
  }
  const pending = pendingSessionRotations.get(originalAuthorization) ?? { count: 0, deferred401: false };
  ++pending.count;
  pendingSessionRotations.set(originalAuthorization, pending);

  try {
    const result = await request();
    // Logout or a different login must win over a late security response.
    if (api.defaults.headers.common.Authorization === originalAuthorization) installSession(result);
    return result;
  } finally {
    --pending.count;
    if (pending.count === 0) {
      if (pendingSessionRotations.get(originalAuthorization) === pending) {
        pendingSessionRotations.delete(originalAuthorization);
      }
      // A successful rotation has already installed a different token. If all
      // attempts failed, honor the deferred rejection of the still-current one.
      if (pending.deferred401 && api.defaults.headers.common.Authorization === originalAuthorization) {
        clearSession();
      }
    }
  }
}

// Only a completed login installs Authorization. A challenge cannot open protected screens.
export async function loginUser(form: LoginRequest): Promise<LoginResponse | LoginMfaChallengeResponse> {
  const response = await api.post<LoginResponse | LoginMfaChallengeResponse>('/auth/login', form);
  const data = response.data;
  if ('mfaRequired' in data) {
    if (data.mfaRequired !== true || typeof data.challengeToken !== 'string' ||
        !data.challengeToken || data.challengeToken.length > 512 ||
        typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) {
      throw new Error('The backend response did not include a valid verification request.');
    }
    // Do not let an older header masquerade as an authenticated MFA challenge.
    delete api.defaults.headers.common.Authorization;
    return data;
  }
  installSession(data);
  return data;
}

// Accept one proof, never both, and install a session only after server verification.
export async function verifyLoginMfa(form: LoginMfaRequest): Promise<LoginResponse> {
  const code = form.code;
  const recoveryCode = form.recoveryCode?.trim();
  const hasCode = typeof code === 'string' && code.length > 0;
  const hasRecoveryCode = typeof recoveryCode === 'string' && recoveryCode.length > 0;
  if (typeof form.challengeToken !== 'string' || !form.challengeToken || form.challengeToken.length > 512) {
    throw new Error('Your verification request expired. Log in again.');
  }
  if (hasCode === hasRecoveryCode) throw new Error('Enter one authenticator or recovery code.');
  if (hasCode && !/^\d{6}$/.test(code)) throw new Error('Enter a six-digit authenticator code.');
  if (hasRecoveryCode && recoveryCode.length > 128) throw new Error('The recovery code is too long.');
  const response = await api.post<LoginResponse>('/auth/login/mfa', {
    challengeToken: form.challengeToken,
    ...(hasCode ? { code } : { recoveryCode }),
  });
  installSession(response.data);
  return response.data;
}

// The app root owns navigation; the HTTP client only notifies it of lost sessions.
let sessionExpiredHandler: (() => void) | undefined;

export function registerSessionExpiredHandler(handler: () => void): () => void {
  sessionExpiredHandler = handler;
  return () => {
    // Unmounting an older subscriber must not remove a newer root callback.
    if (sessionExpiredHandler === handler) sessionExpiredHandler = undefined;
  };
}

// Revoked or expired sessions must leave the authenticated navigator immediately.
export function clearSession(): void {
  delete api.defaults.headers.common.Authorization;
  sessionExpiredHandler?.();
}

// Protected requests returning 401 clear the in-memory token and reopen Login.
// Rejected password/MFA proofs are excluded so Login can show the matching field error.
api.interceptors.response.use(
  response => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        error.config?.url !== '/auth/login' &&
        error.config?.url !== '/auth/login/mfa') {
      // Security actions can rotate the token while older requests are still in
      // flight. An old token's 401 must not discard the newer valid session.
      const currentAuthorization = api.defaults.headers.common.Authorization;
      const requestAuthorization = error.config?.headers?.get('Authorization');
      if (!currentAuthorization) {
        clearSession();
      } else if (requestAuthorization === currentAuthorization) {
        const pending = typeof currentAuthorization === 'string'
          ? pendingSessionRotations.get(currentAuthorization) : undefined;
        if (pending && pending.count > 0) pending.deferred401 = true;
        else clearSession();
      }
    }
    return Promise.reject(error);
  },
);

// Ask the server to revoke this session, then clear local authentication even
// if the network request fails, so the user does not remain in the signed-in UI.
export async function logoutUser(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    clearSession();
  }
}

// Update ProfilePicture (converts local file URI to base64 for persistent binary storage)
export const updateUserAvatar = async (localUri: string) => {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const response = await api.put('/users/profile', { 
    avatarBase64: base64,
    imageMimeType: 'image/jpeg' 
  });
  return response.data;
};

// --- Friends

// Fetch current user's friends list and pending incoming requests using Axios `api`
export async function fetchFriendsNetwork() {
  const response = await api.get('/friends');
  return response.data; // returns { friends: [], pendingRequests: [] }
}

// Send a friend request to a user ID using Axios `api`
export async function sendFriendRequest(recipientId: string) {
  const response = await api.post('/friends/request', { recipientId });
  return response.data;
}

// Accept or reject an incoming friend request using Axios `api`
export async function respondToFriendRequest(requestId: string, action: 'accept' | 'reject') {
  const response = await api.patch(`/friends/request/${requestId}`, { action });
  return response.data;
}
