import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { battleManager } from "./tiktok-battle";
import { log } from "./index";
import type { BattleState } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, request: any) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const username = url.searchParams.get("username")?.replace("@", "") || "";
    const role = url.searchParams.get("role") || "overlay";

    log(`WebSocket connected: role=${role}, username=${username}`, "ws");

    const stateCallback = (state: BattleState) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "battle_state", payload: state }));
      }
    };

    if (username) {
      battleManager.subscribe(username, stateCallback);
    }

    ws.on("message", async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const targetUsername = username || msg.payload?.username;

        switch (msg.type) {
          case "connect": {
            const connectUser = msg.payload?.username || targetUsername;
            if (!connectUser) {
              ws.send(JSON.stringify({ type: "error", payload: { message: "Username required" } }));
              return;
            }
            try {
              log(`Attempting to connect to TikTok: ${connectUser}`, "ws");
              const state = await battleManager.connect(connectUser);
              ws.send(JSON.stringify({ type: "battle_state", payload: state }));

              if (!username) {
                battleManager.subscribe(connectUser, stateCallback);
              }
            } catch (err: any) {
              log(`Connection failed: ${err.message}`, "ws");
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: `Falha ao conectar: ${err.message}` }
              }));
            }
            break;
          }

          case "disconnect": {
            if (targetUsername) {
              battleManager.disconnect(targetUsername);
            }
            break;
          }

          case "adjust_hearts": {
            if (targetUsername && msg.payload?.side && msg.payload?.delta !== undefined) {
              battleManager.adjustHearts(targetUsername, msg.payload.side, msg.payload.delta);
            }
            break;
          }

          case "reset_hearts": {
            if (targetUsername) {
              const count = msg.payload?.count ?? 5;
              battleManager.resetHearts(targetUsername, count);
            }
            break;
          }

          case "set_battle_mode": {
            if (targetUsername && msg.payload?.hearts !== undefined) {
              battleManager.setBattleMode(targetUsername, msg.payload.hearts);
            }
            break;
          }

          case "reset_battle": {
            if (targetUsername) {
              battleManager.resetBattle(targetUsername);
            }
            break;
          }
        }
      } catch (e: any) {
        log(`WS message error: ${e.message}`, "ws");
      }
    });

    ws.on("close", () => {
      if (username) {
        battleManager.unsubscribe(username, stateCallback);
      }
      log(`WebSocket disconnected: role=${role}`, "ws");
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/avatar-proxy", async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).send("Missing url parameter");
      return;
    }
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!response.ok) {
        res.status(response.status).send("Failed to fetch avatar");
        return;
      }
      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch {
      res.status(500).send("Proxy error");
    }
  });

  return httpServer;
}
