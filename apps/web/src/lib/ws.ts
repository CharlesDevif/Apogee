import type { WSServerMessage } from "@apogee/shared-types";
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

export function disconnect() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}
