import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, Alert } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

import { AuthProvider, useAuth } from "../../src/context/auth-context";

function TabsInner() {
  const colorScheme = useColorScheme();
  const { isAuthed, user } = useAuth();
  const router = useRouter();

  const protectUser = () => ({
    tabPress: (e: any) => {
      if (!isAuthed) {
        e.preventDefault();
        Alert.alert("Authentication required", "Please sign in or create an account on Home.");
        router.push("/(tabs)");
      }
    },
  });

  const protectAdmin = () => ({
    tabPress: (e: any) => {
      if (!isAuthed) {
        e.preventDefault();
        Alert.alert("Authentication required", "Please sign in on Home.");
        router.push("/(tabs)");
        return;
      }
      if (user?.role !== "ADMIN") {
        e.preventDefault();
        Alert.alert("Forbidden", "Admin access only.");
        router.push("/(tabs)");
      }
    },
  });

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: { position: "absolute" },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="logs"
        options={{
          title: "Logs",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text.fill" color={color} />,
        }}
        listeners={protectUser()}
      />

      <Tabs.Screen
        name="data"
        options={{
          title: "Data",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
        listeners={protectUser()}
      />

      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="lock.shield" color={color} />,
        }}
        listeners={protectAdmin()}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <AuthProvider>
      <TabsInner />
    </AuthProvider>
  );
}
