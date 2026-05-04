import express from "express";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { WebSocketServer, WebSocket } from "ws";
import type { WSServerMessage } from "@apogee/shared-types";
import { getCachedBundle, getCacheAgeMs, refreshCache } from "./celestrak.js";
import { decodeTelemetry } from "./telemetry.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FW_LISTEN_PORT = Number(process.env.FW_LISTEN_PORT) || 5001;
const startedAt = Date.now();

let lastFwPacketAt: number | null = null;
let fwPacketCount = 0;
let fwBadPackets = 0;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  const fwAge = lastFwPacketAt ? Date.now() - lastFwPacketAt : null;
  const fwState =
    fwAge === null
      ? "disconnected"
      : fwAge < 3000
        ? "connected"
        : "stale";
  res.json({
    status: "ok",
    uptime_s: Math.floor((Date.now() - startedAt) / 1000),
    last_tle_refresh: getCacheAgeMs(),
    firmware: fwState,
    fw_packets: fwPacketCount,
    fw_bad_packets: fwBadPackets,
    fw_last_age_ms: fwAge,
  });
});

app.get("/api/satellites", async (_req, res) => {
  try {
    const bundle = await getCachedBundle();
    res.json(bundle);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.post("/api/satellites/refresh", async (_req, res) => {
  try {
    const bundle = await refreshCache();
    res.json({ ok: true, count: bundle.entries.length });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

function send(ws: WebSocket, msg: WSServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", async (ws) => {
  console.log(`[ws] client connected (${wss.clients.size} total)`);
  try {
    const bundle = await getCachedBundle();
    send(ws, { type: "tle_bundle", payload: bundle });
  } catch (err) {
    console.error("[ws] failed to send initial TLE bundle:", err);
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { type: string; payload?: unknown };
      if (msg.type === "ping") {
        send(ws, { type: "pong", payload: { t: Date.now() } });
      }
    } catch {
      // ignore malformed
    }
  });

  ws.on("close", () =>
    console.log(`[ws] client disconnected (${wss.clients.size} remaining)`),
  );
});

// Periodic TLE refresh broadcast — every 6h
setInterval(
  async () => {
    try {
      const bundle = await refreshCache();
      const msg: WSServerMessage = { type: "tle_bundle", payload: bundle };
      const json = JSON.stringify(msg);
      for (const c of wss.clients) {
        if (c.readyState === WebSocket.OPEN) c.send(json);
      }
      console.log(
        `[tle] refresh broadcast to ${wss.clients.size} clients (${bundle.entries.length} entries)`,
      );
    } catch (err) {
      console.error("[tle] periodic refresh failed:", err);
    }
  },
  6 * 60 * 60 * 1000,
);

// Firmware UDP listener — receives binary telemetry from the simulated CubeSat.
const fwSocket = createSocket("udp4");

fwSocket.on("message", (data, rinfo) => {
  lastFwPacketAt = Date.now();
  const result = decodeTelemetry(data);
  if (!result.ok) {
    fwBadPackets += 1;
    if (fwBadPackets <= 5 || fwBadPackets % 100 === 0) {
      console.warn(
        `[fw] bad packet (${result.error}) from ${rinfo.address}:${rinfo.port} · ${data.length}B`,
      );
    }
    return;
  }
  fwPacketCount += 1;
  if (fwPacketCount === 1 || fwPacketCount % 50 === 0) {
    const s = result.sample;
    console.log(
      `[fw] #${fwPacketCount} tick=${result.tick} mode=${s.mode} ` +
        `pos=${s.lat.toFixed(3)},${s.lon.toFixed(3)} alt=${s.alt_m}m batt=${s.battery_v}V`,
    );
  }
});

fwSocket.on("error", (err) => {
  console.error("[fw] udp socket error:", err.message);
});

fwSocket.bind(FW_LISTEN_PORT, "127.0.0.1", () => {
  console.log(`[fw] listening udp://127.0.0.1:${FW_LISTEN_PORT}`);
});

httpServer.listen(PORT, () => {
  console.log(`[apogee-server] http://localhost:${PORT}`);
  console.log(`[apogee-server] ws://localhost:${PORT}/ws`);
});
