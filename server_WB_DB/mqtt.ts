"use strict";

import "dotenv/config";
import mqtt from "mqtt";
import { PrismaClient } from "./generated/prisma/index.js";

const prisma = new PrismaClient();

const {
    MQTT_URL,
    MQTT_USER,
    MQTT_PASS,
    MQTT_TOPIC = "#",
    DEVICE_NAME = "el_communicator",
} = process.env;

if (!MQTT_URL) {
    console.error("❌ MQTT_URL manquant dans .env");
    process.exit(1);
}

function extractDeviceName(topic: string, payloadObj: any) {
    const parts = topic.split("/");
    const idx = parts.findIndex((p) => p === "device" || p === "devices");
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];

    return (
        payloadObj?.deviceName ||
        payloadObj?.devName ||
        payloadObj?.end_device_ids?.device_id ||
        payloadObj?.uplink_message?.end_device_ids?.device_id ||
        payloadObj?.deviceInfo?.deviceName ||
        null
    );
}

function extractMetrics(payloadObj: any) {
    let fPort = null;
    let devEui = null;
    let rssi = null;
    let snr = null;

    if (!payloadObj) return { fPort, devEui, rssi, snr };

    if (payloadObj?.fPort != null) fPort = payloadObj.fPort;
    if (payloadObj?.devEui) devEui = payloadObj.devEui;
    if (payloadObj?.rxInfo?.[0]?.rssi != null) rssi = payloadObj.rxInfo[0].rssi;
    if (payloadObj?.rxInfo?.[0]?.snr != null) snr = payloadObj.rxInfo[0].snr;

    if (payloadObj?.uplink_message?.f_port != null) fPort = payloadObj.uplink_message.f_port;
    if (payloadObj?.end_device_ids?.dev_eui) devEui = payloadObj.end_device_ids.dev_eui;
    if (payloadObj?.uplink_message?.rx_metadata?.[0]?.rssi != null)
        rssi = payloadObj.uplink_message.rx_metadata[0].rssi;
    if (payloadObj?.uplink_message?.rx_metadata?.[0]?.snr != null)
        snr = payloadObj.uplink_message.rx_metadata[0].snr;

    return { fPort, devEui, rssi, snr };
}

const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER || undefined,
    password: MQTT_PASS || undefined,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
});

client.on("connect", () => {
    console.log("✅ MQTT connecté :", MQTT_URL);
    console.log("📡 Subscribe :", MQTT_TOPIC);
    client.subscribe(MQTT_TOPIC);
});

client.on("error", (e) => console.error("❌ MQTT error:", e.message));

client.on("message", async (topic, buf) => {
    const raw = buf.toString("utf8");

    let obj: any = null;
    try { obj = JSON.parse(raw); } catch { }

    const dev = extractDeviceName(topic, obj);
    if (dev !== DEVICE_NAME) return;

    const { fPort, devEui, rssi, snr } = extractMetrics(obj);

    try {
        await prisma.mqttMessage.create({
            data: {
                device: dev,
                topic,
                raw,
                json: obj ?? undefined,
                fPort: fPort ?? undefined,
                devEui: devEui ?? undefined,
                rssi: rssi ?? undefined,
                snr: snr ?? undefined,
            },
        });

        console.log("✅ MQTT saved:", dev, topic);
    } catch (err: any) {
        console.error("❌ DB insert failed:", err.message);
    }
});

process.on("SIGINT", async () => {
    console.log("\n🛑 MQTT stop...");
    client.end(true);
    await prisma.$disconnect();
    process.exit(0);
});
