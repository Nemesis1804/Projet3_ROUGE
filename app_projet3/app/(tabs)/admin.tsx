import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, TextInput, FlatList, Alert, Platform } from "react-native";
import { Redirect } from "expo-router";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Image } from "expo-image";
import { useAuth } from "../../src/context/auth-context";

type Role = "ADMIN" | "USER";
type DbUser = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  createdAt: string;
};

const DEV_PC_IP = "10.43.170.75";
const API_PORT = 8080;

function getApiBase() {
  if (Platform.OS === "web") return `http://localhost:${API_PORT}`;
  return `http://${DEV_PC_IP}:${API_PORT}`;
}

async function readJsonSafe(r: Response) {
  const txt = await r.text();
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return { raw: txt };
  }
}

export default function AdminScreen() {
  // ✅ Hooks TOUJOURS en premier (important pour éviter “rules of hooks”)
  const { isAuthed, user, token } = useAuth();

  const [users, setUsers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");

  const API_BASE = useMemo(() => getApiBase(), []);
  const authHeaders = useMemo(
    () => ({
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    }),
    [token]
  );

  const canAccess = isAuthed && user?.role === "ADMIN";

  const fetchUsers = async () => {
    if (!canAccess) return;

    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders });
      const data = await readJsonSafe(r);

      if (!r.ok) {
        // ✅ message lisible
        const msg = data?.error ?? `Failed to load users (${r.status})`;
        throw new Error(msg);
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const createUser = async () => {
    if (!canAccess) return;

    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!fn || !ln || !password) {
      Alert.alert("Missing fields", "First name, last name and password are required.");
      return;
    }
    console.log("[ADMIN] token=", token);
    console.log("[ADMIN] authHeaders=", authHeaders);

    try {
      const r = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ firstName: fn, lastName: ln, password, role }),
      });
      const data = await readJsonSafe(r);

      if (!r.ok) {
        const msg = data?.error ?? `Failed to create user (${r.status})`;
        throw new Error(msg);
      }

      setFirstName("");
      setLastName("");
      setPassword("");
      setRole("USER");

      setUsers((prev) => [data, ...prev]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Network error");
    }
  };

  const toggleRole = async (u: DbUser) => {
    if (!canAccess) return;

    const next: Role = u.role === "ADMIN" ? "USER" : "ADMIN";

    try {
      const r = await fetch(`${API_BASE}/admin/users/${u.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ role: next }),
      });
      const data = await readJsonSafe(r);

      if (!r.ok) {
        const msg = data?.error ?? `Failed to update role (${r.status})`;
        throw new Error(msg);
      }

      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: data.role } : x)));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Network error");
    }
  };

  const deleteUser = async (u: DbUser) => {
    console.log("[ADMIN] delete click", u);

    if (!canAccess) {
      Alert.alert("Blocked", "Not authorized (not admin / not logged).");
      return;
    }

    if (u.id === user?.id) {
      Alert.alert("Blocked", "You cannot delete your own account.");
      return;
    }

    const doDelete = async () => {
      try {
        console.log("[ADMIN] deleting id=", u.id);

        const r = await fetch(`${API_BASE}/admin/users/${u.id}`, {
          method: "DELETE",
          headers: authHeaders,
        });

        const txt = await r.text();
        let data: any = null;
        try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }

        console.log("[ADMIN] delete status", r.status, data);

        if (!r.ok) {
          const msg = data?.error ?? `Failed to delete (${r.status})`;
          throw new Error(msg);
        }

        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        Alert.alert("OK", "User deleted.");
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Network error");
      }
    };

    // ✅ Web: confirmation native via window.confirm (plus fiable que Alert)
    if (Platform.OS === "web") {
      // @ts-ignore
      const ok = window.confirm(`Delete ${u.firstName} ${u.lastName}?`);
      if (ok) await doDelete();
      return;
    }

    // ✅ Mobile: confirmation RN
    Alert.alert("Confirm", `Delete ${u.firstName} ${u.lastName}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  // ✅ Redirect APRES hooks (pas avant)
  if (!isAuthed) return <Redirect href="/(tabs)" />;
  if (user?.role !== "ADMIN") return <Redirect href="/(tabs)" />;

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
      headerImage={<Image source={require("@/assets/images/partial-react-logo.png")} style={styles.reactLogo} />}
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Admin</ThemedText>
        <ThemedText style={{ opacity: 0.7, marginLeft: 8 }}>
          Users management {loading ? "…" : ""}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
          Create user
        </ThemedText>

        <TextInput style={styles.input} placeholder="First name" value={firstName} onChangeText={setFirstName} />
        <TextInput style={styles.input} placeholder="Last name" value={lastName} onChangeText={setLastName} />
        <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

        <View style={styles.row}>
          <Pressable onPress={() => setRole((r) => (r === "ADMIN" ? "USER" : "ADMIN"))} style={styles.btnAlt}>
            <ThemedText style={styles.btnText}>Role: {role}</ThemedText>
          </Pressable>

          <Pressable onPress={createUser} style={styles.btn}>
            <ThemedText style={styles.btnText}>Create</ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.rowSpace}>
          <ThemedText type="subtitle">Users</ThemedText>
          <Pressable onPress={fetchUsers} style={styles.smallBtn}>
            <ThemedText style={{ fontWeight: "700" }}>Refresh</ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View style={styles.userRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: "700" }}>
                  {item.firstName} {item.lastName}
                </ThemedText>
                <ThemedText style={{ opacity: 0.7 }}>
                  {item.role} — {new Date(item.createdAt).toLocaleString()}
                </ThemedText>
              </View>

              <Pressable onPress={() => toggleRole(item)} style={styles.smallBtn}>
                <ThemedText style={{ fontWeight: "700" }}>Toggle</ThemedText>
              </Pressable>

              <Pressable onPress={() => deleteUser(item)} style={[styles.smallBtn, styles.dangerBtn]}>
                <ThemedText style={{ fontWeight: "700" }}>Del</ThemedText>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<ThemedText style={{ opacity: 0.7 }}>No users.</ThemedText>}
        />
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: "absolute" },

  card: {
    margin: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3a3a3a55",
    gap: 8,
  },

  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },

  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  rowSpace: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flex: 1, alignItems: "center" },
  btnAlt: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  btnText: { fontWeight: "700" },

  userRow: { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "#3a3a3a33", borderRadius: 12, padding: 10 },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  dangerBtn: { borderColor: "#ef4444" },
});
