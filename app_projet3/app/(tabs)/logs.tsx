import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { FlatList, StyleSheet, View, Pressable, Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useAuth } from '../../src/context/auth-context';

type Log = { id: number; timestamp: number; status: string };

// ✅ IP du PC
const DEV_PC_IP = '10.43.170.75';
const API_PORT = 8080;

function getWsUrl() {
  if (Platform.OS === 'web') return `ws://localhost:${API_PORT}`;
  return `ws://${DEV_PC_IP}:${API_PORT}`;
}

export default function LogsScreen() {
  const { isAuthed } = useAuth();

  const WS_URL = useMemo(() => getWsUrl(), []);
  const wsRef = useRef<WebSocket | null>(null);

  const [logs, setLogs] = useState<Log[]>([]);
  const anchorRef = useRef<{ wall: number; uptime: number } | null>(null);

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const [refreshing, setRefreshing] = useState(false);

  const connectWs = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // À l’ouverture : on charge direct
      try {
        ws.send(JSON.stringify({ type: 'command', action: 'getLogs', limit: 300 }));
      } catch { }
      setRefreshing(false);
    };

    ws.onmessage = (event) => {
      const dataStr = typeof event.data === 'string' ? event.data : '';
      const parsed = safeParse(dataStr);

      if (isLogsBatch(parsed)) {
        const items = (parsed.items || [])
          .map((x: any) => coerceToLog(x))
          .filter(Boolean) as Log[];
        items.sort((a, b) => b.timestamp - a.timestamp);
        setLogs(cap(items));
        setPage(1);
        setRefreshing(false);
        return;
      }

      if (isEvent(parsed)) {
        const item: Log = {
          id: Date.now(),
          timestamp: normalizeTs(parsed),
          status: parsed.status === 'door_opened' ? 'Door opened (event)' : 'Door closed (event)',
        };
        setLogs((prev) => cap([item, ...prev]));
        setPage(1);
        return;
      }

      const maybeLog = coerceToLog(parsed);
      if (maybeLog) {
        setLogs((prev) => cap([maybeLog, ...prev]));
        setPage(1);
      }
    };

    ws.onerror = () => {
      setRefreshing(false);
    };

    ws.onclose = () => {
      // ne rien faire
      setRefreshing(false);
    };

    return ws;
  }, [WS_URL]);

  const requestLogs = useCallback(() => {
    if (!isAuthed) return;

    setRefreshing(true);

    const ws = wsRef.current;

    // Si déjà ouvert : on demande juste les logs
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'command', action: 'getLogs', limit: 300 }));
        return;
      } catch {
        // si erreur, on retombe sur reconnexion
      }
    }

    // Si pas connecté : on reconnecte
    try {
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        // laisse faire
        return;
      }
    } catch { }

    connectWs();
  }, [isAuthed, connectWs]);

  useEffect(() => {
    if (!isAuthed) return;

    // Connexion initiale
    connectWs();

    return () => {
      try { wsRef.current?.close(); } catch { }
      wsRef.current = null;
    };
  }, [isAuthed, connectWs]);

  function isLogsBatch(x: any): x is { type: 'logs'; items: any[] } {
    return x && typeof x === 'object' && x.type === 'logs' && Array.isArray(x.items);
  }

  function safeParse(s: string) { try { return JSON.parse(s); } catch { return s; } }

  function isEvent(x: any): x is { type: 'event'; status: 'door_opened' | 'door_closed'; epoch?: number; timestamp?: number } {
    return x && typeof x === 'object' && x.type === 'event' && typeof x.status === 'string';
  }

  function normalizeTs(obj: any): number {
    const epoch = Number(obj?.epoch);
    if (Number.isFinite(epoch) && epoch > 1e12) return epoch;

    const ts = Number(obj?.timestamp);
    if (Number.isFinite(ts)) {
      if (ts < 1e12) {
        if (!anchorRef.current) { anchorRef.current = { wall: Date.now(), uptime: ts }; return Date.now(); }
        return anchorRef.current.wall + (ts - anchorRef.current.uptime);
      }
      return ts;
    }
    return Date.now();
  }

  function coerceToLog(x: any): Log | null {
    if (!x) return null;
    if (typeof x === 'object' && typeof x.status === 'string') {
      const id = typeof x.id === 'number' ? x.id : Number.isFinite(Number(x.id)) ? Number(x.id) : Date.now();
      const ts = normalizeTs(x);
      return { id, timestamp: ts, status: x.status };
    }
    if (typeof x === 'string') {
      const ts = Date.now();
      return { id: ts, timestamp: ts, status: x };
    }
    return null;
  }

  function cap(arr: Log[], max = 300) { return arr.slice(0, max); }

  if (!isAuthed) {
    return <Redirect href="/(tabs)" />;
  }

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = logs.slice(start, start + PAGE_SIZE);

  const canPrev = page > 1;
  const canNext = page < totalPages;

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

        {/* ✅ bouton refresh à côté du titre */}
        <Pressable
          onPress={requestLogs}
          style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
          disabled={refreshing}
        >
          <ThemedText style={styles.refreshTxt}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.listCard}>
        <FlatList
          data={pageItems}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <ThemedText style={styles.logTs}>
                {new Date(item.timestamp).toLocaleString()}
              </ThemedText>
              <ThemedText style={styles.logStatus}>{item.status}</ThemedText>
            </View>
          )}
          ListEmptyComponent={<ThemedText style={{ opacity: 0.7 }}>No events yet.</ThemedText>}
        />

        <View style={styles.pagerRow}>
          <Pressable
            onPress={() => canPrev && setPage((p) => Math.max(1, p - 1))}
            style={[styles.pagerBtn, !canPrev && styles.pagerBtnDisabled]}
            disabled={!canPrev}
          >
            <ThemedText style={styles.pagerTxt}>Prev</ThemedText>
          </Pressable>

          <ThemedText style={styles.pageIndicator}>
            {page}/{totalPages}
          </ThemedText>

          <Pressable
            onPress={() => canNext && setPage((p) => Math.min(totalPages, p + 1))}
            style={[styles.pagerBtn, !canNext && styles.pagerBtnDisabled]}
            disabled={!canNext}
          >
            <ThemedText style={styles.pagerTxt}>Next</ThemedText>
          </Pressable>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },

  refreshBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  refreshBtnDisabled: {
    opacity: 0.6,
  },
  refreshTxt: {
    fontWeight: '700',
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

  pagerRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pagerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pagerBtnDisabled: {
    opacity: 0.5,
  },
  pagerTxt: { fontWeight: '600' },
  pageIndicator: { fontWeight: '600' },
});
