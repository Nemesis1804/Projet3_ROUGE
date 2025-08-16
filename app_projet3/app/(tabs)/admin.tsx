import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Image } from 'expo-image';

type WSStatus = 'connecting' | 'open' | 'closing' | 'closed';

export default function AdminScreen() {
  const WS_URL = 'ws://192.168.1.11:8080';

  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WSStatus>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);

  const statusColor = useMemo(() => {
    switch (wsStatus) {
      case 'open': return '#22c55e';
      case 'connecting': return '#f59e0b';
      case 'closing': return '#a3a3a3';
      case 'closed': return '#ef4444';
      default: return '#a3a3a3';
    }
  }, [wsStatus]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setWsStatus('connecting');
    setLastError(null);

    ws.onopen = () => setWsStatus('open');
    ws.onclose = () => setWsStatus('closed');
    ws.onerror = (e: any) => setLastError(e?.message ?? 'WebSocket error');

    return () => {
      setWsStatus('closing');
      try { ws.close(); } catch { }
      wsRef.current = null;
    };
  }, [WS_URL]);

  const send = (payload: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  const sendOpen = () => {
    send({ type: 'command', action: 'openDoor', source: 'admin-app', ts: Date.now() });
  };

  const sendClose = () => {
    send({ type: 'command', action: 'closeDoor', source: 'admin-app', ts: Date.now() });
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <ThemedText type="title">Admin </ThemedText>
        <ThemedText style={{ opacity: 0.7, marginLeft: 8 }}>{WS_URL}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Door Control</ThemedText>

        <View style={styles.row}>
          <Pressable
            onPress={sendOpen}
            disabled={wsStatus !== 'open'}
            style={({ pressed }) => [
              styles.btn,
              { opacity: wsStatus === 'open' ? (pressed ? 0.7 : 1) : 0.5 }
            ]}
          >
            <ThemedText style={styles.btnText}>Open Door</ThemedText>
          </Pressable>

          <Pressable
            onPress={sendClose}
            disabled={wsStatus !== 'open'}
            style={({ pressed }) => [
              styles.btnAlt,
              { opacity: wsStatus === 'open' ? (pressed ? 0.7 : 1) : 0.5 }
            ]}
          >
            <ThemedText style={styles.btnText}>Close Door</ThemedText>
          </Pressable>
        </View>

        {lastError && (
          <ThemedText style={{ color: '#ef4444', marginTop: 8 }}>
            Error: {lastError}
          </ThemedText>
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: 'absolute' },
  dot: { width: 10, height: 10, borderRadius: 999 },
  card: {
    margin: 12, padding: 12, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#3a3a3a55', gap: 8
  },
  row: { flexDirection: 'row', gap: 10 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  btnAlt: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  btnText: { fontWeight: '600' },
});
