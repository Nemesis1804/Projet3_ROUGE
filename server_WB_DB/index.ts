import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import bcrypt from "bcrypt";
import mqtt from "mqtt";
import { PrismaClient } from "./generated/prisma/index.js";

const prisma = new PrismaClient();
const PORT = 8080;

// --------------------
// ENV
// --------------------
const MQTT_URL = process.env.MQTT_URL || "";
const MQTT_USER = process.env.MQTT_USER || "";
const MQTT_PASS = process.env.MQTT_PASS || "";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "#";
const DEVICE_FILTER = (process.env.DEVICE_FILTER || "").toLowerCase();
const DEBUG = process.env.DEBUG === "1";

// --------------------
// MQTT (status)
// --------------------
let mqttClient: mqtt.MqttClient | null = null;
let mqttConnected = false;
let mqttLastError: string | null = null;
let mqttMessages = 0;
let lastMqttMessageAt: number | null = null;
let lastMqttTopic: string | null = null;

function safeJsonParse(s: string) {
    try { return JSON.parse(s); } catch { return null; }
}

function extractDevEuiFromChirpstack(topic: string, payloadStr: string): string | null {
    const m = topic.match(/\/device\/([0-9a-fA-F]{16})\/event\/up$/);
    if (m?.[1]) return m[1].toLowerCase();

    // fallback: try payload JSON
    const j = safeJsonParse(payloadStr);
    const dev = j?.deviceInfo?.devEui;
    return typeof dev === "string" ? dev.toLowerCase() : null;
}


function startMqtt() {
    if (!MQTT_URL) {
        console.log("[MQTT] MQTT_URL missing -> mqtt status will stay false");
        return;
    }

    const opts: mqtt.IClientOptions = {
        reconnectPeriod: 2000,
        keepalive: 30,
    };

    if (MQTT_USER) opts.username = MQTT_USER;
    if (MQTT_PASS) opts.password = MQTT_PASS;

    mqttClient = mqtt.connect(MQTT_URL, opts);

    mqttClient.on("connect", () => {
        mqttConnected = true;
        mqttLastError = null;
        console.log("[MQTT] connected ->", MQTT_URL);

        mqttClient?.subscribe(MQTT_TOPIC, (err) => {
            if (err) {
                mqttLastError = err.message;
                console.log("[MQTT] subscribe error:", err.message);
            } else {
                console.log("[MQTT] subscribed ->", MQTT_TOPIC);
            }
        });
    });

    mqttClient.on("reconnect", () => {
        mqttConnected = false;
        console.log("[MQTT] reconnecting...");
    });

    mqttClient.on("close", () => {
        mqttConnected = false;
        console.log("[MQTT] closed");
    });

    mqttClient.on("error", (err) => {
        mqttConnected = false;
        mqttLastError = err?.message ?? String(err);
        console.log("[MQTT] error:", mqttLastError);
    });

    mqttClient.on("message", async (topic, payload) => {
        mqttMessages += 1;
        lastMqttMessageAt = Date.now();
        lastMqttTopic = topic;

        const payloadStr = payload?.toString?.() ?? "";
        const devEui = extractDevEuiFromChirpstack(topic, payloadStr);

        if (DEBUG) {
            console.log("[MQTT] rx topic:", topic);
            console.log("[MQTT] rx devEui:", devEui);
        }

        if (DEVICE_FILTER && devEui && devEui !== DEVICE_FILTER) {
            if (DEBUG) console.log("[MQTT] ignored (device filter)");
            return;
        }
    });
}


startMqtt();

// --------------------
// Mini auth tokens (DEV)
// --------------------
const TOKEN_SECRET = process.env.TOKEN_SECRET || "dev-secret-change-me";
const sessions = new Map<string, string>(); // token -> userId

function makeToken(userId: string) {
    const raw = `${userId}.${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
    const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(raw).digest("hex");
    const token = `${raw}.${sig}`;
    sessions.set(token, userId);
    return token;
}

function getBearer(req: http.IncomingMessage) {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer (.+)$/i);
    return m ? m[1] : null;
}

function send(res: http.ServerResponse, code: number, body: any) {
    res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    });
    res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                reject(e);
            }
        });
    });
}

function assertNonEmptyString(value: unknown, msg: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw { status: 400, message: msg };
    }
}

function isLockoutAdmin(u: { firstName: string; lastName: string }) {
    return u.firstName.toLowerCase() === "admin" && u.lastName.toLowerCase() === "admin";
}

async function requireAuth(req: http.IncomingMessage) {
    const token = getBearer(req);
    if (!token) throw { status: 401, message: "Missing token" };

    const userId = sessions.get(token);
    if (!userId) throw { status: 401, message: "Invalid token" };

    const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, role: true },
    });

    if (!me) throw { status: 401, message: "User not found" };
    return me;
}

// --------------------
// HTTP API
// --------------------
const server = http.createServer(async (req, res) => {
    try {
        // CORS preflight
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            });
            return res.end();
        }

        const url = req.url || "/";

        // Health check
        if (req.method === "GET" && url === "/health") {
            return send(res, 200, { ok: true, service: "server_WB_DB", port: PORT });
        }

        // -------- STATUS GLOBAL --------
        if (req.method === "GET" && url === "/status") {
            let database = false;
            let dbError: string | null = null;

            try {
                await prisma.$queryRaw`SELECT 1`;
                database = true;
            } catch (e: any) {
                dbError = e?.message ?? String(e);
            }

            return send(res, 200, {
                api: true,
                database,
                dbError,

                mqtt: mqttConnected,
                mqttUrl: MQTT_URL || null,
                mqttTopic: MQTT_TOPIC || null,
                mqttMessages,
                lastMqttMessageAt,
                lastMqttTopic,
                mqttLastError,

                timestamp: Date.now(),
            });
        }

        // -------- AUTH: REGISTER --------
        if (req.method === "POST" && url === "/auth/register") {
            const body = await readJson(req);

            const fn = String(body.firstName || "").trim();
            const ln = String(body.lastName || "").trim();
            const pw = String(body.password || "");

            if (!fn || !ln || !pw) return send(res, 400, { error: "Missing fields" });
            if (pw.length < 3) return send(res, 400, { error: "Password too short" });

            if (isLockoutAdmin({ firstName: fn, lastName: ln })) {
                return send(res, 403, { error: "This account is reserved (anti-lockout)." });
            }

            const existing = await prisma.user.findUnique({
                where: { firstName_lastName: { firstName: fn, lastName: ln } },
            });
            if (existing) return send(res, 409, { error: "User already exists" });

            const passwordHash = await bcrypt.hash(pw, 12);

            const created = await prisma.user.create({
                data: { firstName: fn, lastName: ln, passwordHash, role: "USER" },
                select: { id: true, firstName: true, lastName: true, role: true },
            });

            const token = makeToken(created.id);
            return send(res, 200, { token, user: created });
        }

        // -------- AUTH: LOGIN --------
        if (req.method === "POST" && url === "/auth/login") {
            const body = await readJson(req);

            const fn = String(body.firstName || "").trim();
            const ln = String(body.lastName || "").trim();
            const pw = String(body.password || "");

            if (!fn || !ln || !pw) return send(res, 400, { error: "Missing fields" });

            const u = await prisma.user.findUnique({
                where: { firstName_lastName: { firstName: fn, lastName: ln } },
            });
            if (!u) return send(res, 401, { error: "Invalid credentials" });

            const ok = await bcrypt.compare(pw, u.passwordHash);
            if (!ok) return send(res, 401, { error: "Invalid credentials" });

            const token = makeToken(u.id);
            return send(res, 200, {
                token,
                user: { id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role },
            });
        }

        // -------- ADMIN: LIST USERS --------
        if (req.method === "GET" && url === "/admin/users") {
            const me = await requireAuth(req);
            if (me.role !== "ADMIN") return send(res, 403, { error: "Admin only" });

            const rows = await prisma.user.findMany({
                orderBy: { createdAt: "desc" },
                select: { id: true, firstName: true, lastName: true, role: true, createdAt: true },
            });

            return send(res, 200, rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
        }

        // -------- ADMIN: CREATE USER --------
        if (req.method === "POST" && url === "/admin/users") {
            const me = await requireAuth(req);
            if (me.role !== "ADMIN") return send(res, 403, { error: "Admin only" });

            const body = await readJson(req);

            const fn = String(body.firstName || "").trim();
            const ln = String(body.lastName || "").trim();
            const pw = String(body.password || "");
            const rl = body.role === "ADMIN" ? "ADMIN" : "USER";

            if (!fn || !ln || !pw) return send(res, 400, { error: "Missing fields" });

            if (isLockoutAdmin({ firstName: fn, lastName: ln })) {
                return send(res, 403, { error: "This account is reserved (anti-lockout)." });
            }

            const existing = await prisma.user.findUnique({
                where: { firstName_lastName: { firstName: fn, lastName: ln } },
            });
            if (existing) return send(res, 409, { error: "User already exists" });

            const passwordHash = await bcrypt.hash(pw, 12);

            const created = await prisma.user.create({
                data: { firstName: fn, lastName: ln, passwordHash, role: rl },
                select: { id: true, firstName: true, lastName: true, role: true, createdAt: true },
            });

            return send(res, 200, { ...created, createdAt: created.createdAt.toISOString() });
        }

        // -------- ADMIN: PATCH / DELETE USER BY ID --------
        const userIdMatch = url.match(/^\/admin\/users\/([^/]+)$/);
        const userId = userIdMatch ? userIdMatch[1] : null;

        if ((req.method === "PATCH" || req.method === "DELETE") && userIdMatch) {
            assertNonEmptyString(userId, "Missing user id in URL");

            const me = await requireAuth(req);
            if (me.role !== "ADMIN") return send(res, 403, { error: "Admin only" });

            const target = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, firstName: true, lastName: true, role: true },
            });
            if (!target) return send(res, 404, { error: "User not found" });

            // anti-lockout
            if (isLockoutAdmin(target)) {
                if (req.method === "DELETE") return send(res, 403, { error: "Cannot delete anti-lockout admin." });
                const body = await readJson(req);
                if (body?.role && body.role !== "ADMIN") {
                    return send(res, 403, { error: "Cannot change role of anti-lockout admin." });
                }
            }

            // no self delete
            if (req.method === "DELETE" && userId === me.id) {
                return send(res, 403, { error: "You cannot delete your own account." });
            }

            if (req.method === "DELETE") {
                await prisma.user.delete({ where: { id: userId } });
                return send(res, 200, { ok: true });
            }

            const body = await readJson(req);
            const data: any = {};

            if (typeof body?.role === "string") data.role = body.role === "ADMIN" ? "ADMIN" : "USER";
            if (typeof body?.password === "string" && body.password.length > 0) {
                data.passwordHash = await bcrypt.hash(body.password, 12);
            }

            if (Object.keys(data).length === 0) return send(res, 400, { error: "Nothing to update" });

            const updated = await prisma.user.update({
                where: { id: userId },
                data,
                select: { id: true, role: true },
            });

            return send(res, 200, updated);
        }

        // -------- LOGS: CREATE --------
        if (req.method === "POST" && url === "/logs") {
            const body = await readJson(req);

            const status = String(body?.status || "").trim();
            if (!status) return send(res, 400, { ok: false, error: "Missing status" });

            const created = await prisma.logs.create({
                data: { status }, // timestamp auto
            });

            if (DEBUG) console.log("[LOGS] inserted:", created.id, created.status);
            return send(res, 200, { ok: true, id: created.id });
        }

        // default
        return send(res, 404, { error: "Not found" });
    } catch (e: any) {
        const status = e?.status ?? 500;
        const message = e?.message ?? "Server error";
        console.error("HTTP error:", e);
        return send(res, status, { error: message });
    }
});

// --------------------
// WebSocket (same server/port) - inchangé
// --------------------
const wss = new WebSocketServer({ server });
const clients: Set<WebSocket> = new Set();

wss.on("connection", (ws: WebSocket) => {
    console.log("✅ Client connecté (WS)");
    clients.add(ws);

    ws.on("message", async (message: string | Buffer) => {
        const msg = message.toString();

        try {
            const json = JSON.parse(msg);

            if (json.type === "command" && json.action === "getLogs") {
                const limit = Math.min(Number(json.limit) || 300, 300);
                const rows = await prisma.logs.findMany({
                    orderBy: { timestamp: "desc" },
                    take: limit,
                    select: { id: true, timestamp: true, status: true },
                });

                ws.send(
                    JSON.stringify({
                        type: "logs",
                        items: rows.map((r) => ({
                            id: r.id,
                            timestamp: r.timestamp.getTime(),
                            status: r.status,
                        })),
                    })
                );
                return;
            }
        } catch (err) {
            console.error("❌ Erreur parsing JSON:", err);
        }

        clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    });

    ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 HTTP API  : http://localhost:${PORT}`);
    console.log(`🚀 WebSocket : ws://localhost:${PORT}`);
});
