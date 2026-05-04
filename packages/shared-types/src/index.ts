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
  | { type: "command"; payload: CommandRequest };

export type CommandSent = {
  ts: number;
  seq: number;
  command: CommandRequest["command"];
  size_bytes: number;
};

export type CommandAck = {
  ts: number;
  success: boolean;
  /** PUS-mapped failure code (matches firmware CommandOutcome enum) */
  failure_code: number | null;
  tc_apid: number;
  tc_seq: number;
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
