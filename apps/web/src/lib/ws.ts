import type { CommandRequest, WSServerMessage } from "@apogee/shared-types";
import { useMissionStore } from "../store/mission";

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let backoff = 1000;

function url() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function connect() {
  const store = useMissionStore.getState();
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  store.setLink({ kind: "connecting" });
  ws = new WebSocket(url());

  ws.onopen = () => {
    backoff = 1000;
    useMissionStore.getState().setLink({ kind: "open", since: Date.now() });
    useMissionStore.getState().pushEvent("ok", "ws · link established");
  };

  ws.onmessage = (e) => {
    let msg: WSServerMessage;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === "tle_bundle") {
      const s = useMissionStore.getState();
      s.setTle(msg.payload);
      s.pushEvent("ok", `tle bundle · ${msg.payload.entries.length} entries`);
    } else if (msg.type === "telemetry") {
      const s = useMissionStore.getState();
      const wasNull = s.cubesat === null;
      s.setCubesat(msg.payload);
      if (wasNull) {
        s.pushEvent("ok", `cubesat link · ${msg.payload.mode}`);
      }
    } else if (msg.type === "command_sent") {
      const p = msg.payload;
      useMissionStore.getState().pushTransmissionSent({
        seq: p.seq,
        command: p.command,
        arg: pendingArgs.shift() ?? null,
        sentAt: p.ts,
        sizeBytes: p.size_bytes,
        tcBytes: hexToBytes(p.bytes_hex),
      });
    } else if (msg.type === "command_ack") {
      const p = msg.payload;
      useMissionStore.getState().resolveTransmissionAck(p.tc_seq, {
        ackAt: p.ts,
        success: p.success,
        failureCode: p.failure_code,
        ackBytes: hexToBytes(p.bytes_hex),
      });
    }
  };

  ws.onerror = () => {
    useMissionStore.getState().pushEvent("alert", "ws · error");
  };

  ws.onclose = () => {
    useMissionStore.getState().setLink({ kind: "closed" });
    useMissionStore.getState().pushEvent("warn", `ws · closed · retry ${Math.round(backoff / 1000)}s`);
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };
}

export function sendCommand(req: CommandRequest): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  /* Stash the human-readable arg so the console can render it before the
   * backend even acknowledges. The store's transmission entry is created
   * later by the command_sent message; we use a side channel keyed by
   * insertion order via a small in-flight queue. */
  pendingArgs.push(req.command === "SET_MODE" ? req.mode : null);
  ws.send(JSON.stringify({ type: "command", payload: req }));
  return true;
}

const pendingArgs: (string | null)[] = [];

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length >> 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function disconnect() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}
