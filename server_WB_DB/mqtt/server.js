import mqtt from "mqtt";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Prisma client (généré chez toi)
import { PrismaClient } from "../generated/prisma/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charge le .env à la racine du projet
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ---------- ENV ----------
const MQTT_URL = process.env.MQTT_URL;
const MQTT_USER = process.env.MQTT_USER || undefined;
const MQTT_PASS = process.env.MQTT_PASS || undefined;
const MQTT_TOPIC = process.env.MQTT_TOPIC || "application/+/device/+/event/up";
const DEVICE_FILTER = (process.env.DEVICE_FILTER || "").trim(); // "" => pas de filtre
const DEBUG = (process.env.DEBUG || "0") === "1";

if (!MQTT_URL) {
    console.error("❌ MQTT_URL manquant dans .env");
    process.exit(1);
}

// ---------- PRISMA ----------
const prisma = new PrismaClient();

// ---------- HELPERS ----------
function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function extractDeviceId(topic, obj) {
    // topic: application/<...>/device/<devEUI>/event/up
    const parts = topic.split("/");
    const idx = parts.findIndex((p) => p === "device" || p === "devices");
    const fromTopic = idx !== -1 ? parts[idx + 1] : null;

    // ChirpStack v4 (fréquent)
    const fromJson =
        obj?.deviceInfo?.deviceName ||
        obj?.deviceInfo?.devEui ||
        obj?.devEUI ||
        obj?.devEui ||
        null;

    return fromTopic || fromJson || null;
}

function extractBase64Payload(obj) {
    // ChirpStack v4: obj.data souvent base64
    if (typeof obj?.data === "string") return obj.data;

    // autres variantes
    if (typeof obj?.uplink_message?.frm_payload === "string") return obj.uplink_message.frm_payload;
    if (typeof obj?.uplink_message?.data === "string") return obj.uplink_message.data;

    return null;
}

function decodeBase64ToUtf8(b64) {
    try {
        return Buffer.from(b64, "base64").toString("utf8");
    } catch {
        return null;
    }
}

async function saveLog(status) {
    // Ton modèle Logs: status String, timestamp auto
    await prisma.logs.create({
        data: { status },
    });
}

// ---------- MQTT ----------
const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASS,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
});

client.on("connect", () => {
    console.log("✅ Connecté MQTT:", MQTT_URL);
    console.log("📡 Subscribe:", MQTT_TOPIC);

    client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
        if (err) console.error("❌ Subscribe error:", err.message);
    });
});

client.on("reconnect", () => console.log("🔄 Reconnexion MQTT..."));
client.on("error", (e) => console.error("❌ MQTT error:", e.message));
client.on("close", () => console.log("⚠️ MQTT closed"));

client.on("message", async (topic, buf) => {
    const raw = buf.toString("utf8");
    const obj = safeJsonParse(raw);

    if (!obj) return;

    const deviceId = extractDeviceId(topic, obj);
    if (!deviceId) return;

    // Filtre device si défini (accepte nom OU devEUI)
    if (DEVICE_FILTER) {
        const f = DEVICE_FILTER.toLowerCase();
        const d = String(deviceId).toLowerCase();
        const devName = String(obj?.deviceInfo?.deviceName || "").toLowerCase();
        const devEui = String(obj?.deviceInfo?.devEui || "").toLowerCase();

        if (!(d === f || devName === f || devEui === f)) return;
    }

    const b64 = extractBase64Payload(obj);
    const decoded = b64 ? decodeBase64ToUtf8(b64) : null;

    if (!decoded) return;

    const clean = decoded.trim();
    const logLine = `[${new Date().toISOString()}] device=${obj?.deviceInfo?.deviceName || deviceId} payload=${clean}`;

    if (DEBUG) {
        console.log("\n📨 UPLINK ✅");
        console.log("Topic:", topic);
        console.log("Device:", obj?.deviceInfo?.deviceName || deviceId);
        console.log("Decoded:", clean);
        console.log("➡️ DB log:", logLine);
    }

    try {
        await saveLog(logLine);
        console.log("✅ Log enregistré en DB");
    } catch (e) {
        console.error("❌ Erreur DB:", e.message);
    }
});

// fermeture propre
process.on("SIGINT", async () => {
    console.log("\n🛑 Stop...");
    try {
        await prisma.$disconnect();
    } catch { }
    process.exit(0);
});
