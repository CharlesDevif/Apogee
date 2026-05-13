// One TLE entry as we send it through the wire
export type TleEntry = {
  noradId: number;
  name: string;
  /** Celestrak group key, e.g. "stations", "active", "starlink" */
  group: string;
  line1: string;
  line2: string;
};

export type TleBundle = {
  fetchedAt: number; // unix ms
  entries: TleEntry[];
};

// WebSocket protocol
export type WSServerMessage =
  | { type: "tle_bundle"; payload: TleBundle }
  | { type: "telemetry"; payload: TelemetrySample }
  | { type: "alert"; payload: Alert }
  | { type: "pong"; payload: { t: number } }
  | { type: "command_sent"; payload: CommandSent }
  | { type: "command_ack"; payload: CommandAck };

export type WSClientMessage =
  | { type: "ping"; payload: { t: number } }
  | { type: "command"; payload: CommandRequest }
  /* Red-team only: send raw bytes verbatim to the firmware TC port,
   * bypassing the backend's signing logic. The server still broadcasts the
   * resulting command_sent so the operator log captures the attack. */
  | { type: "command_raw"; payload: { bytes_hex: string; label?: string } };

export type CommandSent = {
  ts: number;
  seq: number;
  command: CommandRequest["command"] | "RAW";
  size_bytes: number;
  /** Hex string of the raw CCSDS TC packet emitted on the wire. */
  bytes_hex: string;
  /** "operator" = legitimately signed by the backend.
   *  "attack"   = raw bytes injected by the red-team console. */
  origin: "operator" | "attack";
  /** Free-text tag attached to red-team transmissions (e.g. "REPLAY",
   *  "STRIP_MAC", "FORGE_REBOOT"). Undefined for operator commands. */
  attack_label?: string;
};

export type CommandAck = {
  ts: number;
  success: boolean;
  /** PUS-mapped failure code (matches firmware CommandOutcome enum) */
  failure_code: number | null;
  tc_apid: number;
  tc_seq: number;
  /** Hex string of the raw CCSDS TM ack packet received from the firmware. */
  bytes_hex: string;
};

// Reserved for Phase 2 / Phase 3
export type TelemetrySample = {
  ts: number;
  mode: "BOOT" | "SAFE" | "NOMINAL" | "COMMS" | "FAULT";
  lat: number;
  lon: number;
  alt_m: number;
  battery_v: number;
  attitude_deg: { roll: number; pitch: number; yaw: number };
};

export type Alert = {
  ts: number;
  severity: "info" | "warn" | "critical";
  message: string;
};

export type CommandRequest =
  | { command: "PING" }
  | { command: "SET_MODE"; mode: "SAFE" | "NOMINAL" | "COMMS" | "FAULT" }
  | { command: "REBOOT" };
