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

// Install the session token before the screen opens the authenticated navigator,
// so its initial event-list requests already include Authorization.
export async function loginUser(form: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', form);
  if (typeof response.data.accessToken !== 'string' || !/^[a-f0-9]{64}$/i.test(response.data.accessToken)) {
    throw new Error('The backend login response did not include a session token.');
  }
  // Memory only: this does not implement Remember me or local storage.
  api.defaults.headers.common.Authorization = 'Bearer ' + response.data.accessToken;
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

// Protected requests returning 401 clear the in-memory token and reopen Login.
// A rejected login is excluded so the login screen can show its own error.
api.interceptors.response.use(
  response => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        error.config?.url !== '/auth/login') {
      delete api.defaults.headers.common.Authorization;
      sessionExpiredHandler?.();
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
    delete api.defaults.headers.common.Authorization;
    sessionExpiredHandler?.();
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
