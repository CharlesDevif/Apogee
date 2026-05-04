import express from "express";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { WebSocketServer, WebSocket } from "ws";
import type { CommandRequest, WSServerMessage } from "@apogee/shared-types";
import { getCachedBundle, getCacheAgeMs, refreshCache } from "./celestrak.js";
import { decodeTelemetry } from "./telemetry.js";
import { decodeAck } from "./ack.js";
import { APID, parsePrimaryHeader } from "./ccsds.js";
import {
  type EncodedCommand,
  encodePing,
  encodeReboot,
  encodeSetMode,
} from "./command.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FW_LISTEN_PORT = Number(process.env.FW_LISTEN_PORT) || 5001;
const FW_TC_PORT = Number(process.env.FW_TC_PORT) || 5002;
const FW_TC_HOST = process.env.FW_TC_HOST || "127.0.0.1";
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

wss.on("connection", (ws) => {
  console.log(`[ws] client connected (${wss.clients.size} total)`);

  /* Register handlers synchronously before any await so we don't drop early
   * client messages that arrive while we're fetching the initial TLE bundle. */
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { type: string; payload?: unknown };
      if (msg.type === "ping") {
        send(ws, { type: "pong", payload: { t: Date.now() } });
        return;
      }
      if (msg.type === "command") {
        handleCommandRequest(msg.payload as CommandRequest);
        return;
      }
    } catch {
      // ignore malformed
    }
  });

  ws.on("close", () =>
    console.log(`[ws] client disconnected (${wss.clients.size} remaining)`),
  );

  void getCachedBundle()
    .then((bundle) => send(ws, { type: "tle_bundle", payload: bundle }))
    .catch((err) => console.error("[ws] failed to send initial TLE bundle:", err));
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

function broadcast(msg: WSServerMessage): void {
  const json = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(json);
  }
}

function handleCommandRequest(req: CommandRequest): void {
  let encoded: EncodedCommand;
  try {
    if (req.command === "PING") encoded = encodePing();
    else if (req.command === "SET_MODE") encoded = encodeSetMode(req.mode);
    else if (req.command === "REBOOT") encoded = encodeReboot();
    else return;
  } catch (err) {
    console.error("[tc] encode failed:", (err as Error).message);
    return;
  }

  fwSocket.send(encoded.buffer, FW_TC_PORT, FW_TC_HOST, (err) => {
    if (err) {
      console.error(`[tc] send failed: ${err.message}`);
      return;
    }
    console.log(
      `[tc] sent ${req.command} seq=${encoded.seq} (${encoded.buffer.length}B) -> ${FW_TC_HOST}:${FW_TC_PORT}`,
    );
    broadcast({
      type: "command_sent",
      payload: {
        ts: Date.now(),
        seq: encoded.seq,
        command: req.command,
        size_bytes: encoded.buffer.length,
      },
    });
  });
}

function logBad(reason: string, length: number, from: string): void {
  fwBadPackets += 1;
  if (fwBadPackets <= 5 || fwBadPackets % 100 === 0) {
    console.warn(`[fw] bad packet (${reason}) from ${from} · ${length}B`);
  }
}

fwSocket.on("message", (data, rinfo) => {
  lastFwPacketAt = Date.now();
  const from = `${rinfo.address}:${rinfo.port}`;
  const ph = parsePrimaryHeader(data);
  if (!ph) {
    logBad("bad_primary_header", data.length, from);
    return;
  }

  if (ph.apid === APID.HK) {
    const result = decodeTelemetry(data);
    if (!result.ok) {
      logBad(result.error, data.length, from);
      return;
    }
    fwPacketCount += 1;
    if (fwPacketCount === 1 || fwPacketCount % 100 === 0) {
      const s = result.sample;
      console.log(
        `[fw] #${fwPacketCount} tick=${result.tick} mode=${s.mode} ` +
          `pos=${s.lat.toFixed(3)},${s.lon.toFixed(3)} alt=${s.alt_m}m batt=${s.battery_v}V`,
      );
    }
    /* Throttle to ~5 Hz so the browser isn't drowned at the firmware's 10 Hz. */
    if (fwPacketCount % 2 === 0) {
      broadcast({ type: "telemetry", payload: result.sample });
    }
    return;
  }

  if (ph.apid === APID.ACK) {
    const result = decodeAck(data);
    if (!result.ok) {
      logBad(result.error, data.length, from);
      return;
    }
    console.log(
      `[ack] tc_seq=${result.tcSeq} ${result.success ? "OK" : `FAIL(${result.failureCode})`}`,
    );
    broadcast({
      type: "command_ack",
      payload: {
        ts: result.ts || Date.now(),
        success: result.success,
        failure_code: result.failureCode,
        tc_apid: result.tcApid,
        tc_seq: result.tcSeq,
      },
    });
    return;
  }

  logBad(`unhandled_apid_0x${ph.apid.toString(16)}`, data.length, from);
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
