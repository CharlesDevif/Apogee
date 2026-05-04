// Decoder for the firmware's binary TelemetryPacket.
// Layout must match `apps/firmware/src/telemetry.h`. Keep the offsets in sync.

import type { TelemetrySample } from "@apogee/shared-types";

export const TELEMETRY_PACKET_SIZE = 40;
export const TELEMETRY_MAGIC = 0xab1e;
export const TELEMETRY_VERSION = 0x01;

const MODE_NAMES = ["SAFE", "NOMINAL", "COMMS", "FAULT", "BOOT"] as const;

function crc16Ccitt(buf: Buffer | Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export type DecodeError =
  | "wrong_size"
  | "bad_magic"
  | "bad_version"
  | "bad_crc"
  | "bad_mode";

export type DecodeResult =
  | { ok: true; sample: TelemetrySample; tick: number }
  | { ok: false; error: DecodeError };

export function decodeTelemetry(data: Buffer): DecodeResult {
  if (data.length !== TELEMETRY_PACKET_SIZE) return { ok: false, error: "wrong_size" };

  const magic = data.readUInt16LE(0);
  if (magic !== TELEMETRY_MAGIC) return { ok: false, error: "bad_magic" };

  const version = data.readUInt8(2);
  if (version !== TELEMETRY_VERSION) return { ok: false, error: "bad_version" };

  const crcRecv = data.readUInt16LE(38);
  const crcCalc = crc16Ccitt(data.subarray(0, 38));
  if (crcRecv !== crcCalc) return { ok: false, error: "bad_crc" };

  const modeRaw = data.readUInt8(3);
  const mode = MODE_NAMES[modeRaw];
  if (!mode) return { ok: false, error: "bad_mode" };

  const tick = data.readUInt32LE(4);
  const tsUs = data.readBigUInt64LE(8);
  const latE7 = data.readInt32LE(16);
  const lonE7 = data.readInt32LE(20);
  const altM = data.readUInt32LE(24);
  const battMv = data.readUInt16LE(28);
  const roll10 = data.readInt16LE(30);
  const pitch10 = data.readInt16LE(32);
  const yaw10 = data.readInt16LE(34);

  return {
    ok: true,
    tick,
    sample: {
      ts: Number(tsUs / 1000n),
      mode,
      lat: latE7 / 1e7,
      lon: lonE7 / 1e7,
      alt_m: altM,
      battery_v: battMv / 1000,
      attitude_deg: {
        roll: roll10 / 10,
        pitch: pitch10 / 10,
        yaw: yaw10 / 10,
      },
    },
  };
}
