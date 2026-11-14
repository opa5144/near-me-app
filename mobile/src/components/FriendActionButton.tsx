import React, { useState, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { sendFriendRequest, respondToFriendRequest } from '../api/friends';

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

interface FriendActionButtonProps {
  targetUserId: string;
  initialStatus: FriendshipStatus;
  requestId?: string;
  onStatusChange?: (newStatus: FriendshipStatus) => void;
}

export function FriendActionButton({
  targetUserId,
  initialStatus,
  requestId,
  onStatusChange,
}: FriendActionButtonProps) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<FriendshipStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  // Keep state synchronized whenever parent fetches updated database status
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const handlePress = async () => {
    // LOGIC CHECK: Only allow pressing if status is strictly 'none' or 'pending_received'
    if (busy || (status !== 'none' && status !== 'pending_received')) return;

    setBusy(true);
    try {
      if (status === 'none') {
        await sendFriendRequest(targetUserId);
        setStatus('pending_sent');
        onStatusChange?.('pending_sent');
      } else if (status === 'pending_received' && requestId) {
        await respondToFriendRequest(requestId, 'accept');
        setStatus('accepted');
        onStatusChange?.('accepted');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || '';
      // If a request already exists in the database, safely snap state to requested
      if (errorMsg.includes('already exists')) {
        setStatus('pending_sent');
        onStatusChange?.('pending_sent');
      }
    } finally {
      setBusy(false);
    }
  };

  // LOGIC CHECK: Only 'none' ("Add Friend") and 'pending_received' ("Accept Request") should be interactive
  const isPressable = status === 'none' || status === 'pending_received';

  // Clean, theme-consistent styling configuration
  const config = {
    none: { 
      label: 'Add Friend', 
      icon: 'person-add-outline', 
      bg: colors.primary, 
      text: '#FFFFFF', 
      border: 'transparent',
    },
    pending_sent: { 
      label: 'Requested', 
      icon: 'time-outline', 
      bg: colors.surface, 
      text: colors.muted, 
      border: colors.border,
    },
    pending_received: { 
      label: 'Accept Request', 
      icon: 'checkmark-circle-outline', 
      bg: colors.primary, 
      text: '#FFFFFF', 
      border: 'transparent',
    },
    accepted: { 
      label: 'Friends', 
      icon: 'people', 
      bg: colors.surface, 
      text: colors.text, 
      border: colors.border,
    },
  }[status];

  return (
    <TouchableOpacity
      disabled={!isPressable || busy}
      onPress={handlePress}
      activeOpacity={0.8}
      style={[
        styles.button,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          borderWidth: config.border !== 'transparent' ? 1 : 0,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={config.text} />
      ) : (
        <>
          <Ionicons name={config.icon as any} size={14} color={config.text} />
          <AppText style={[styles.text, { color: config.text }]}>
            {config.label}
          </AppText>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  text: { fontSize: 12, fontWeight: '800' },
});