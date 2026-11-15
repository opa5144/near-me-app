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
  name?: string;
  username?: string;
  avatar?: string;
}

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface FriendshipRecord {
  _id: string;
  requester: string;
  recipient: string;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  createdAt?: string;
  updatedAt?: string;
}

export interface FriendMutationResponse {
  success: boolean;
  friendship: FriendshipRecord;
}

// Request IDs identify Friendship records. Network item IDs identify User records.
export function friendshipFromNetwork(network: FriendsNetworkResponse, targetUserId: string): {
  status: FriendshipStatus; requestId?: string;
} {
  const target = targetUserId.toLowerCase();
  if (network.friends.some(friend => friend.id.toLowerCase() === target)) return { status: 'accepted' };
  const incoming = network.pendingRequests.find(request => request.id.toLowerCase() === target);
  if (incoming) return { status: 'pending_received', requestId: incoming.requestId };
  if (network.sentRequests.some(request => request.id.toLowerCase() === target)) return { status: 'pending_sent' };
  return { status: 'none' };
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
export async function sendFriendRequest(recipientId: string): Promise<FriendMutationResponse> {
  const response = await api.post<FriendMutationResponse>('/friends/request', { recipientId });
  return response.data;
}

// Accept or reject a pending friend request ('accept' | 'reject')
export async function respondToFriendRequest(requestId: string, action: 'accept' | 'reject'): Promise<FriendMutationResponse> {
  const response = await api.patch<FriendMutationResponse>(`/friends/request/${encodeURIComponent(requestId)}`, { action });
  return response.data;
}
