import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { IconSymbol } from '@/components/ui/IconSymbol';

type Log = {
  id: number;
  timestamp: number;
  status: string;
};

export default function LogsScreen() {
  const WS_URL = 'ws://192.168.1.11:8080';

  const wsRef = useRef<WebSocket | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const anchorRef = useRef<{ wall: number; uptime: number } | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const dataStr = typeof event.data === 'string' ? event.data : '';
      const parsed = safeParse(dataStr);

      if (isEvent(parsed)) {
        setLogs(prev => cap([
          {
            id: Date.now(),
            timestamp: normalizeTs(parsed),
            status: parsed.status === 'door_opened' ? 'Door opened (event)' : 'Door closed (event)',
          },
          ...prev
        ]));
        return;
      }

      const maybeLog = coerceToLog(parsed);
      if (maybeLog) setLogs(prev => cap([maybeLog, ...prev]));
    };

    return () => {
      try { ws.close(); } catch { }
      wsRef.current = null;
    };
  }, [WS_URL]);

  function safeParse(s: string) {
    try { return JSON.parse(s); } catch { return s; }
  }
  function isEvent(x: any): x is { type: 'event'; status: 'door_opened' | 'door_closed'; epoch?: number; timestamp?: number } {
    return x && typeof x === 'object' && x.type === 'event' && typeof x.status === 'string';
  }
  function normalizeTs(obj: any): number {
    const epoch = Number(obj?.epoch);
    if (Number.isFinite(epoch) && epoch > 1e12) return epoch;
    const ts = Number(obj?.timestamp);
    if (Number.isFinite(ts)) {
      if (ts < 1e12) {
        if (!anchorRef.current) {
          anchorRef.current = { wall: Date.now(), uptime: ts };
          return Date.now();
        }
        return anchorRef.current.wall + (ts - anchorRef.current.uptime);
      }
      return ts;
    }
    return Date.now();
  }
  function coerceToLog(x: any): Log | null {
    if (!x) return null;
    if (typeof x === 'object' && typeof x.status === 'string') {
      const id =
        typeof x.id === 'number' ? x.id :
          Number.isFinite(Number(x.id)) ? Number(x.id) :
            Date.now();
      const ts = normalizeTs(x);
      return { id, timestamp: ts, status: x.status };
    }
    if (typeof x === 'string') {
      const ts = Date.now();
      return { id: ts, timestamp: ts, status: x };
    }
    return null;
  }
  function cap(arr: Log[], max = 300) {
    return arr.slice(0, max);
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
        <ThemedText type="title">Event History</ThemedText>
      </ThemedView>

      <ThemedView style={styles.listCard}>
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          inverted
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <ThemedText style={styles.logTs}>
                {new Date(item.timestamp).toLocaleString()}
              </ThemedText>
              <ThemedText style={styles.logStatus}>{item.status}</ThemedText>
            </View>
          )}
          ListEmptyComponent={
            <ThemedText style={{ opacity: 0.7 }}>
              No events yet.
            </ThemedText>
          }
        />
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  listCard: {
    marginHorizontal: 12,
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3a3a55',
  },
  logRow: {
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3a3a33',
  },
  logTs: { opacity: 0.7, marginBottom: 2 },
  logStatus: { fontWeight: '500' },
});
