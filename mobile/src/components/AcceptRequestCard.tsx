// components/AcceptRequestCard.tsx
import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from './AppText';

interface AcceptRequestCardProps {
  item: {
    requestId: string;
    id: string;
    name: string;
    username: string;
    avatar: string;
  };
  colors: any;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export function AcceptRequestCard({ item, colors, onAccept, onReject }: AcceptRequestCardProps) {
  return (
    <View style={[styles.modalItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Image source={{ uri: item.avatar }} style={styles.friendAvatar} />
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{item.name}</AppText>
        <AppText style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>@{item.username}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <TouchableOpacity 
          onPress={() => onAccept(item.requestId)} 
          style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <AppText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Accept</AppText>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => onReject(item.requestId)} 
          style={[styles.modalActionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <AppText style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>Decline</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10, gap: 10 },
  friendAvatar: { width: 42, height: 42, borderRadius: 21 },
  modalActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
});