import { api } from './client';

export interface UserProfile {
  _id: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  [key: string]: any;
}

export interface UpdateUserAvatarRequest {
  imageBase64: string; // Raw JPEG base64 payload for avatar
  mimeType?: string;
}

// Fetch the currently authenticated user's profile
export async function fetchUserProfile(): Promise<UserProfile> {
  const response = await api.get<{ user?: UserProfile } | UserProfile>('/users/me');
  const data = response.data;
  return ('user' in data && data.user) ? data.user : (data as UserProfile);
}

// Update user avatar with a longer timeout to handle binary/base64 payload uploads safely
export async function updateUserAvatar(input: UpdateUserAvatarRequest): Promise<UserProfile> {
  const response = await api.patch<{ user?: UserProfile } | UserProfile>('/users/me/avatar', input, { timeout: 30000 });
  const data = response.data;
  return ('user' in data && data.user) ? data.user : (data as UserProfile);
}

// Fetch any public user profile by ID
export async function fetchPublicProfile(userId: string): Promise<UserProfile> {
  const response = await api.get<{ user?: UserProfile } | UserProfile>('/users/' + encodeURIComponent(userId));
  const data = response.data;
  return ('user' in data && data.user) ? data.user : (data as UserProfile);
}