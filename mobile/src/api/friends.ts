import { api } from './client';

export interface FriendItem {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

export interface PendingRequest {
  requestId: string;
  id: string;
  name: string;
  username: string;
  avatar: string;
}

export interface SentRequest {
  requestId: string;
  id: string;
}

export interface FriendsNetworkResponse {
  friends: FriendItem[];
  pendingRequests: PendingRequest[];
  sentRequests: SentRequest[];
}

// Fetch accepted friends and incoming pending requests
export async function fetchFriendsNetwork(signal?: AbortSignal): Promise<FriendsNetworkResponse> {
  const response = await api.get<FriendsNetworkResponse>('/friends', { signal });
  return response.data;
}

// Send a friend request by user ID
export async function sendFriendRequest(recipientId: string): Promise<any> {
  const response = await api.post('/friends/request', { recipientId });
  return response.data;
}

// Accept or reject a pending friend request ('accept' | 'reject')
export async function respondToFriendRequest(requestId: string, action: 'accept' | 'reject'): Promise<any> {
  const response = await api.patch(`/friends/request/${encodeURIComponent(requestId)}`, { action });
  return response.data; 
}