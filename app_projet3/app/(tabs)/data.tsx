import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useAuth } from '../context/auth-context';

type WSStatus = 'connecting' | 'open' | 'closing' | 'closed';
type DoorStatus = 'open' | 'closed' | 'unknown';

export default function DataScreen() {
  const WS_URL = 'ws://192.168.1.11:8080';

  const { isAuthed } = useAuth();

  // ✅ Si non authentifié → redirection immédiate vers Home
  if (!isAuthed) {
    return <Redirect href='/(tabs)' />;
  }

  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WSStatus>('connecting');
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [msgCount, setMsgCount] = useState(0);
  const [bytesRx, setBytesRx] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastRaw, setLastRaw] = useState<string | null>(null);
  const [lastDecoded, setLastDecoded] = useState<any>(null);
  const [doorStatus, setDoorStatus] = useState<DoorStatus>('unknown');

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

    ws.onopen = () => {
      setWsStatus('open');
      setConnectedAt(Date.now());
      ws.send(JSON.stringify({
        type: 'command',
        action: 'getState',
        source: 'diagnostics',
        ts: Date.now()
      }));
    };

    ws.onmessage = (event) => {
      const dataStr = typeof event.data === 'string' ? event.data : '';
      setLastRaw(dataStr);
      setMsgCount((c) => c + 1);
      setBytesRx((b) => b + dataStr.length);

      const parsed = safeParse(dataStr);
      setLastDecoded(parsed);

      if (isEvent(parsed)) {
        if (parsed.status === 'door_opened') setDoorStatus('open');
        else if (parsed.status === 'door_closed') setDoorStatus('closed');
      }
    };

    ws.onerror = (err: any) => {
      setLastError(err?.message ? String(err.message) : 'WebSocket error');
    };

    ws.onclose = () => setWsStatus('closed');

    return () => {
      setWsStatus('closing');
      try { ws.close(); } catch { }
      wsRef.current = null;
    };
  }, [WS_URL]);

  function safeParse(s: string) {
    try { return JSON.parse(s); } catch { return s; }
  }
  function isEvent(x: any): x is { type: 'event'; status: string } {
    return x && typeof x === 'object' && x.type === 'event' && typeof x.status === 'string';
  }
  function pretty(x: any) {
    try { return JSON.stringify(x, null, 2); } catch { return String(x); }
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">WebSocket Diagnostics</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <ThemedText style={styles.statusText}>{wsStatus.toUpperCase()}</ThemedText>
        </View>

        <View style={styles.kvRow}>
          <ThemedText style={styles.kvKey}>Server</ThemedText>
          <ThemedText style={styles.kvVal}>{WS_URL}</ThemedText>
        </View>

        <View style={styles.kvRow}>
          <ThemedText style={styles.kvKey}>Connected</ThemedText>
          <ThemedText style={styles.kvVal}>
            {connectedAt ? new Date(connectedAt).toLocaleString() : '—'}
          </ThemedText>
        </View>

        <View style={styles.kvRow}>
          <ThemedText style={styles.kvKey}>Door status</ThemedText>
          <ThemedText style={styles.kvVal}>
            {doorStatus === 'open' ? 'Open' : doorStatus === 'closed' ? 'Closed' : 'Unknown'}
          </ThemedText>
        </View>

        <View style={styles.kvRow}>
          <ThemedText style={styles.kvKey}>Messages received</ThemedText>
          <ThemedText style={styles.kvVal}>{msgCount}</ThemedText>
        </View>

        <View style={styles.kvRow}>
          <ThemedText style={styles.kvKey}>Bytes received</ThemedText>
          <ThemedText style={styles.kvVal}>{bytesRx}</ThemedText>
        </View>

        <View style={[styles.kvRow, { alignItems: 'flex-start' }]}>
          <ThemedText style={styles.kvKey}>Last raw message</ThemedText>
          <ThemedText style={[styles.kvVal, styles.mono]} numberOfLines={4}>
            {lastRaw ?? '—'}
          </ThemedText>
        </View>

        <View style={[styles.kvRow, { alignItems: 'flex-start' }]}>
          <ThemedText style={styles.kvKey}>Last decoded message</ThemedText>
          <ThemedText style={[styles.kvVal, styles.mono]} numberOfLines={6}>
            {lastDecoded ? pretty(lastDecoded) : '—'}
          </ThemedText>
        </View>

        {lastError && (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorTitle}>Error</ThemedText>
            <ThemedText style={styles.errorText}>{lastError}</ThemedText>
          </View>
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: { color: '#808080', bottom: -90, left: -35, position: 'absolute' },
  titleContainer: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  card: {
    margin: 12, padding: 12, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#3a3a3a55', gap: 6
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  statusText: { fontWeight: '600' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  kvKey: { opacity: 0.7, width: 140 },
  kvVal: { flex: 1, textAlign: 'right' },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  errorBox: {
    marginTop: 8, padding: 8, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#ef444455',
    backgroundColor: '#ef44440f'
  },
  errorTitle: { fontWeight: '700', marginBottom: 2 },
  errorText: {},
});
