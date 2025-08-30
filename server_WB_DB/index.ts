import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient } from "./generated/prisma/index.js";

const prisma = new PrismaClient();

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

const clients: Set<WebSocket> = new Set();

wss.on("connection", (ws: WebSocket) => {
    console.log("✅ Client connecté");
    clients.add(ws);

    ws.on("message", async (message: string | Buffer) => {
        const msg = message.toString();
        console.log("📨 Message reçu:", msg);

        // Parse message
        try {
            const json = JSON.parse(msg);
            console.log("📥 Message JSON:", json);
            if (json.type === "log") {
                // Save log to database
                await prisma.logs.create({
                    data: {
                        status: json.status,
                        timestamp:
                            json.epoch && json.timestamp
                                ? new Date(json.epoch + json.timestamp)
                                : new Date(),
                    },
                });
            } else if (json.type === "command") {
                await prisma.logs.create({
                    data: {
                        status: json.action,
                        timestamp: json.ts ? new Date(json.ts) : new Date(),
                    },
                });
            }
        } catch (err) {
            console.error("❌ Erreur de parsing JSON:", err);
        }

        // Re-broadcast à tous les autres clients
        clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    });

    ws.on("close", () => {
        console.log("❌ Client déconnecté");
        clients.delete(ws);
    });

    ws.on("error", (err) => {
        console.error("⚠️ Erreur WebSocket:", err);
    });
});

wss.on("listening", () => {
    console.log(`🚀 Serveur WebSocket lancé sur ws://localhost:${PORT}`);
});