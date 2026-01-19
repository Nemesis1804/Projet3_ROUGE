import React, { useEffect, useState } from "react";
import { StyleSheet, View, Platform, Pressable } from "react-native";
import { Redirect } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useAuth } from "../../src/context/auth-context";

type ServiceStatus = {
  api: boolean;
  database: boolean;
  mqtt: boolean;
  timestamp?: number;
};

const DEV_PC_IP = "10.43.170.75";
const API_PORT = 8080;

function getApiBase() {
  if (Platform.OS === "web") return `http://localhost:${API_PORT}`;
  return `http://${DEV_PC_IP}:${API_PORT}`;
}

export default function DataScreen() {
  // ✅ Hooks TOUJOURS en premier, jamais après un return conditionnel
  const { isAuthed } = useAuth();

  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${getApiBase()}/status`);
      const data = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error(data?.error ?? `HTTP ${r.status}`);
      }

      setStatus(data);
    } catch (e: any) {
      setStatus(null);
      setError(e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthed) return; // ✅ ok: on ne return pas du composant, juste du useEffect
    fetchStatus();
  }, [isAuthed]);

  // ✅ Maintenant seulement, on peut return conditionnellement
  if (!isAuthed) {
    return <Redirect href="/(tabs)" />;
  }

  const dotColor = (ok: boolean) => ({ backgroundColor: ok ? "#22c55e" : "#ef4444" });

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#D0D0D0", dark: "#353636" }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="gearshape.2"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">System Status</ThemedText>

        <Pressable
          style={[styles.refreshBtn, loading && { opacity: 0.6 }]}
          onPress={fetchStatus}
          disabled={loading}
        >
          <ThemedText style={styles.refreshTxt}>{loading ? "Refreshing…" : "Refresh"}</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.row}>
          <ThemedText style={styles.kvKey}>API Server</ThemedText>
          <View style={[styles.dot, dotColor(status?.api === true)]} />
        </View>

        <View style={styles.row}>
          <ThemedText style={styles.kvKey}>Database</ThemedText>
          <View style={[styles.dot, dotColor(status?.database === true)]} />
        </View>

        <View style={styles.row}>
          <ThemedText style={styles.kvKey}>MQTT</ThemedText>
          <View style={[styles.dot, dotColor(status?.mqtt === true)]} />
        </View>

        {status?.timestamp && (
          <ThemedText style={styles.ts}>
            Last check: {new Date(status.timestamp).toLocaleString()}
          </ThemedText>
        )}

        {error && (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorTitle}>Error</ThemedText>
            <ThemedText>{error}</ThemedText>
          </View>
        )}

        {!error && !status && (
          <ThemedText style={{ opacity: 0.7 }}>No status yet. Tap Refresh.</ThemedText>
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: { color: "#808080", bottom: -90, left: -35, position: "absolute" },
  titleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  refreshTxt: { fontWeight: "700" },

  card: {
    margin: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3a3a3a55",
    gap: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kvKey: { fontWeight: "600" },
  dot: { width: 14, height: 14, borderRadius: 999 },
  ts: { opacity: 0.7, marginTop: 6, fontSize: 12 },

  errorBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ef444455",
    backgroundColor: "#ef44440f",
  },
  errorTitle: { fontWeight: "700", marginBottom: 2 },
});
