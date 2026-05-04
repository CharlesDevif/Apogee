// Decode CCSDS Space Packet (PUS Service 3 / Subtype 25 — Housekeeping report)
// emitted by the Apogée firmware. Layout matches apps/firmware/src/telemetry.{h,c}.

import type { TelemetrySample } from "@apogee/shared-types";
import {
  APID,
  CCSDS_PRIMARY_HEADER_SIZE,
  CCSDS_PUS_TM_SEC_HDR_SIZE,
  CCSDS_TYPE_TM,
  PUS,
  parsePrimaryHeader,
  parsePusTmSecondary,
  verifyCrc,
} from "./ccsds.js";

export const HK_PAYLOAD_SIZE = 25;
export const HK_PACKET_SIZE =
  CCSDS_PRIMARY_HEADER_SIZE + CCSDS_PUS_TM_SEC_HDR_SIZE + HK_PAYLOAD_SIZE + 2;

const MODE_NAMES = ["SAFE", "NOMINAL", "COMMS", "FAULT", "BOOT"] as const;

export type DecodeError =
  | "wrong_size"
  | "bad_primary_header"
  | "wrong_type"
  | "wrong_apid"
  | "missing_secondary"
  | "bad_pus_secondary"
  | "wrong_service"
  | "bad_crc"
  | "bad_mode";

export type DecodeResult =
  | { ok: true; sample: TelemetrySample; tick: number; seqCount: number }
  | { ok: false; error: DecodeError };

export function decodeTelemetry(data: Buffer): DecodeResult {
  if (data.length !== HK_PACKET_SIZE) return { ok: false, error: "wrong_size" };

  const ph = parsePrimaryHeader(data);
  if (!ph) return { ok: false, error: "bad_primary_header" };
  if (ph.type !== CCSDS_TYPE_TM) return { ok: false, error: "wrong_type" };
  if (ph.apid !== APID.HK) return { ok: false, error: "wrong_apid" };
  if (!ph.secHdrFlag) return { ok: false, error: "missing_secondary" };

  if (!verifyCrc(data)) return { ok: false, error: "bad_crc" };

  const secHdrStart = CCSDS_PRIMARY_HEADER_SIZE;
  const sec = parsePusTmSecondary(
    data.subarray(secHdrStart, secHdrStart + CCSDS_PUS_TM_SEC_HDR_SIZE),
  );
  if (!sec) return { ok: false, error: "bad_pus_secondary" };
  if (sec.service !== PUS.HOUSEKEEPING || sec.subtype !== PUS.HK_REPORT) {
    return { ok: false, error: "wrong_service" };
  }

  const payloadStart = secHdrStart + CCSDS_PUS_TM_SEC_HDR_SIZE;
  const p = data.subarray(payloadStart, payloadStart + HK_PAYLOAD_SIZE);

  const modeRaw = p.readUInt8(0);
  const mode = MODE_NAMES[modeRaw];
  if (!mode) return { ok: false, error: "bad_mode" };

  const battMv = p.readUInt16BE(1);
  const latE7 = p.readInt32BE(3);
  const lonE7 = p.readInt32BE(7);
  const altM = p.readUInt32BE(11);
  const roll10 = p.readInt16BE(15);
  const pitch10 = p.readInt16BE(17);
  const yaw10 = p.readInt16BE(19);
  const tick = p.readUInt32BE(21);

  return {
    ok: true,
    tick,
    seqCount: ph.seqCount,
    sample: {
      ts: sec.cucSeconds * 1000,
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
