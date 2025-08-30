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

            // Handle fetch of historical logs (reply only to requester)
            if (json.type === "command" && json.action === "getLogs") {
                const limit = Math.min(Number(json.limit) || 300, 300);
                const rows = await prisma.logs.findMany({
                    orderBy: { timestamp: "desc" },
                    take: limit,
                    select: { id: true, timestamp: true, status: true },
                });
                const payload = {
                    type: "logs",
                    items: rows.map((r) => ({
                        id: r.id,
                        timestamp: r.timestamp.getTime(),
                        status: r.status,
                    })),
                };
                ws.send(JSON.stringify(payload));
                return;
            }

            if (json.type === "log") {
                // Save log to database
                await prisma.logs.create({
                    data: {
                        status: json.status,
                        timestamp:
                            json.epoch
                                ? new Date(json.epoch)
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