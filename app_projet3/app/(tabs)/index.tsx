import React, { useState } from "react";
import {
  StyleSheet,
  Pressable,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useAuth } from "@/src/context/auth-context";

type Mode = "LOGIN" | "REGISTER";

function notify(title: string, msg: string) {
  console.log(`[UI] ${title}: ${msg}`);
  if (Platform.OS === "web") {
    // web: sûr à 100%
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

export default function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("LOGIN");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");

  const { isAuthed, user, login, register, logout } = useAuth();

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPassword("");
  };

  const openModal = (m: Mode) => {
    setMode(m);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const pw = password;

    if (!fn || !ln || !pw) {
      notify("Missing fields", "Please enter first name, last name and password.");
      return;
    }

    console.log("[UI] submit:", { mode, firstName: fn, lastName: ln });

    const res = mode === "LOGIN" ? await login(fn, ln, pw) : await register(fn, ln, pw);

    console.log("[UI] auth result:", res);

    if (res.ok) {
      setModalVisible(false);
      resetForm();
      notify("Success", mode === "LOGIN" ? "Logged in." : "Account created.");
    } else {
      notify("Error", res.error ?? "Unknown error");
    }
  };

  return (
    <View style={styles.screen}>
      <ParallaxScrollView
        headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
        headerImage={
          <Image
            source={require("@/assets/images/partial-react-logo.png")}
            style={styles.reactLogo}
          />
        }
      >
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Welcome!</ThemedText>
          <HelloWave />
        </ThemedView>

        {!isAuthed ? (
          <>
            <Pressable style={styles.button} onPress={() => openModal("LOGIN")}>
              <Text style={styles.buttonText}>Sign in</Text>
            </Pressable>

            <Pressable style={[styles.button, styles.buttonAlt]} onPress={() => openModal("REGISTER")}>
              <Text style={styles.buttonText}>Create account</Text>
            </Pressable>

            <ThemedView style={styles.stepContainer}>
              <ThemedText type="subtitle">Authentication required</ThemedText>
              <ThemedText>
                <ThemedText type="defaultSemiBold">
                  Users can access Logs and Data. Only Admins can access Admin.
                </ThemedText>
              </ThemedText>
            </ThemedView>
          </>
        ) : (
          <>
            <ThemedView style={styles.stepContainer}>
              <ThemedText type="subtitle">You are authenticated</ThemedText>
              <ThemedText>
                Logged in as: {user?.firstName} {user?.lastName} ({user?.role})
              </ThemedText>
              <ThemedText>
                {user?.role === "ADMIN"
                  ? "You can access Logs, Data and Admin."
                  : "You can access Logs and Data."}
              </ThemedText>
            </ThemedView>

            <Pressable style={[styles.button, { backgroundColor: "#E53935" }]} onPress={logout}>
              <Text style={styles.buttonText}>Log out</Text>
            </Pressable>
          </>
        )}
      </ParallaxScrollView>

      {modalVisible && (
        <View style={styles.overlay} pointerEvents="auto">
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {mode === "LOGIN" ? "Sign in" : "Create account"}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="First name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={handleSubmit} style={styles.modalButton}>
                <Text style={styles.modalButtonText}>
                  {mode === "LOGIN" ? "Sign in" : "Create"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, position: "relative" },
  titleContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepContainer: { gap: 8, marginBottom: 8 },

  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: "absolute" },

  button: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    alignSelf: "center",
    marginVertical: 10,
    minWidth: 220,
    alignItems: "center",
  },
  buttonAlt: { backgroundColor: "#4CAF50" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    width: "86%",
    maxWidth: 420,
    borderRadius: 12,
    padding: 24,
    backgroundColor: "#fff",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  modalTitle: { fontSize: 20, marginBottom: 16, fontWeight: "bold" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtons: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  modalButton: { backgroundColor: "#2196F3", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  cancelButton: { backgroundColor: "#888" },
  modalButtonText: { color: "#fff", fontWeight: "bold" },
});
