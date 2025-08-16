import { WebSocketServer, WebSocket } from "ws";

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

const clients: Set<WebSocket> = new Set();

wss.on("connection", (ws: WebSocket) => {
    console.log("✅ Client connecté");
    clients.add(ws);

    ws.on("message", (message: string | Buffer) => {
        const msg = message.toString();
        console.log("📨 Message reçu:", msg);

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

console.log(`🚀 Serveur WebSocket lancé sur ws://localhost:${PORT}`);