const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const wss = new WebSocket.Server({ noServer: true });
const clients = new Map(); // userId -> ws

function initWebSocket(server) {
  server.on("upgrade", (req, socket, head) => {
    try {
      console.log("🔁 WS upgrade request:", req.url);

      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");

      if (!token) {
        console.warn("❌ WS rejected: no token");
        socket.destroy();
        return;
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);

      wss.handleUpgrade(req, socket, head, ws => {
        ws.userId = payload.id;
        ws.role = payload.role;

        clients.set(payload.id, ws);
        console.log(`🔌 WS connected: user ${payload.id}`);

        ws.on("close", () => {
          clients.delete(payload.id);
          console.log(`❌ WS closed: user ${payload.id}`);
        });

        ws.on("error", err => {
          console.error("WS error:", err.message);
        });
      });
    } catch (e) {
      console.error("❌ WS upgrade failed:", e.message);
      socket.destroy();
    }
  });
}

/* 🔔 PUSH NOTIFICATION (SAFE + STANDARDIZED) */
function pushNotification(userId, notification) {
  const ws = clients.get(userId);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn(`⚠️ WS not available for user ${userId}`);
    return;
  }

  ws.send(JSON.stringify({
  event: "notification",
  data: {
    id: notification.id,
    type: notification.type,
    message: notification.message,
    created_at: notification.created_at,
    is_read: 0
  }
}));


  console.log(`📤 WS notification sent → user ${userId}`);
}

module.exports = {
  initWebSocket,
  pushNotification
};
