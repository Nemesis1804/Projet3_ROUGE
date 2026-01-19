import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

type Role = "ADMIN" | "USER";
export type User = { id: string; firstName: string; lastName: string; role: Role };

type AuthResult = { ok: boolean; error?: string };

type AuthCtx = {
    isAuthed: boolean;
    user: User | null;
    token: string | null;

    login: (firstName: string, lastName: string, password: string) => Promise<AuthResult>;
    register: (firstName: string, lastName: string, password: string) => Promise<AuthResult>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// ✅ IP du PC (ton serveur/API tourne sur le PC)
const DEV_PC_IP = "10.43.170.75";
const API_PORT = 8080;

function getApiBase() {
    if (Platform.OS === "web") return `http://localhost:${API_PORT}`;
    return `http://${DEV_PC_IP}:${API_PORT}`;
}

async function saveSession(token: string, user: User) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function clearSession() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
}

async function loadSession(): Promise<{ token: string | null; user: User | null }> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const userStr = await AsyncStorage.getItem(USER_KEY);
    return { token: token ?? null, user: userStr ? (JSON.parse(userStr) as User) : null };
}

async function readJsonSafe(r: Response) {
    const txt = await r.text();
    try {
        return txt ? JSON.parse(txt) : null;
    } catch {
        return { raw: txt };
    }
}

// petit helper pour timeout réseau (évite "ça tourne dans le vide")
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

// ✅ envoie un log dans la DB via POST /logs (même si l'app n'utilise pas de websocket)
async function postLog(status: string): Promise<{ ok: boolean; id?: number; error?: string }> {
    const API_BASE = getApiBase();

    try {
        console.log("[AUTH] postLog ->", `${API_BASE}/logs`, status);

        const r = await fetchWithTimeout(
            `${API_BASE}/logs`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            },
            8000
        );

        const data = await readJsonSafe(r);

        if (!r.ok) {
            console.log("[AUTH] postLog failed status:", r.status, data);
            return { ok: false, error: data?.error ?? `HTTP ${r.status}` };
        }

        console.log("[AUTH] postLog OK id=", data?.id);
        return { ok: true, id: data?.id };
    } catch (e: any) {
        console.log("[AUTH] postLog error:", e?.message ?? e);
        return { ok: false, error: e?.message ?? "Network error" };
    }
}


export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);

    const isAuthed = !!token && !!user;

    useEffect(() => {
        (async () => {
            const s = await loadSession();
            setToken(s.token);
            setUser(s.user);
        })();
    }, []);

    const login = async (firstName: string, lastName: string, password: string): Promise<AuthResult> => {
        const API_BASE = getApiBase();
        try {
            const r = await fetchWithTimeout(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName, password }),
            });

            const data = await readJsonSafe(r);
            if (!r.ok) return { ok: false, error: data?.error ?? `Login failed (${r.status})` };

            await saveSession(data.token, data.user);
            setToken(data.token);
            setUser(data.user);

            // ✅ LOG en DB
            await postLog(`USER CONNECTED: ${data.user.firstName} ${data.user.lastName}`);

            return { ok: true };
        } catch (e: any) {
            if (e?.name === "AbortError") return { ok: false, error: "Timeout: serveur injoignable" };
            return { ok: false, error: e?.message ?? "Network error" };
        }
    };

    const register = async (firstName: string, lastName: string, password: string): Promise<AuthResult> => {
        const API_BASE = getApiBase();
        try {
            const r = await fetchWithTimeout(`${API_BASE}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName, password }),
            });

            const data = await readJsonSafe(r);
            if (!r.ok) return { ok: false, error: data?.error ?? `Register failed (${r.status})` };

            await saveSession(data.token, data.user);
            setToken(data.token);
            setUser(data.user);

            // ✅ LOG en DB
            await postLog(`NEW USER CREATED: ${data.user.firstName} ${data.user.lastName}`);

            return { ok: true };
        } catch (e: any) {
            if (e?.name === "AbortError") return { ok: false, error: "Timeout: serveur injoignable" };
            return { ok: false, error: e?.message ?? "Network error" };
        }
    };

    const logout = async () => {
        await clearSession();
        setToken(null);
        setUser(null);
    };

    const value = useMemo(
        () => ({ isAuthed, user, token, login, register, logout }),
        [isAuthed, user, token]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
