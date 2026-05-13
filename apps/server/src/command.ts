// Encode CCSDS Space Packet TC for Apogée. Symmetric with the firmware decoder.
// Layout: PH (6) + PUS-TC (4) + Payload (N) + HMAC-SHA-256 trunc (16) + CRC (2).

import { createHmac } from "node:crypto";
import {
  APID,
  APOGEE_FN,
  CCSDS_PRIMARY_HEADER_SIZE,
  CCSDS_PUS_TC_SEC_HDR_SIZE,
  CCSDS_TYPE_TC,
  PUS,
  appendCrc,
  packPrimaryHeader,
  packPusTcSecondary,
} from "./ccsds.js";

export type EncodedCommand = { buffer: Buffer; seq: number };

export const APOGEE_TC_MAC_LEN = 16;

const MODE_VALUES = {
  SAFE: 0,
  NOMINAL: 1,
  COMMS: 2,
  FAULT: 3,
} as const;

export type CommandMode = keyof typeof MODE_VALUES;

let tcSeq = 0;
const TC_SEQ_MASK = 0x3fff;

function nextSeq(): number {
  const s = tcSeq;
  tcSeq = (tcSeq + 1) & TC_SEQ_MASK;
  return s;
}

/* PSK loaded once from APOGEE_HMAC_KEY env var (hex). */
let psk: Buffer | null = null;

function getPsk(): Buffer {
  if (psk) return psk;
  const hex = process.env.APOGEE_HMAC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "APOGEE_HMAC_KEY missing or wrong length — expected 64 hex chars (32 bytes)",
    );
  }
  psk = Buffer.from(hex, "hex");
  if (psk.length !== 32) throw new Error("APOGEE_HMAC_KEY: invalid hex");
  return psk;
}

function computeMac(data: Buffer): Buffer {
  return createHmac("sha256", getPsk()).update(data).digest().subarray(0, APOGEE_TC_MAC_LEN);
}

function encode(
  serviceType: number,
  subtype: number,
  payload: Buffer,
): EncodedCommand {
  const total =
    CCSDS_PRIMARY_HEADER_SIZE +
    CCSDS_PUS_TC_SEC_HDR_SIZE +
    payload.length +
    APOGEE_TC_MAC_LEN +
    2; // CRC

  const buf = Buffer.alloc(total);
  const seq = nextSeq();

  const bodyLen = CCSDS_PUS_TC_SEC_HDR_SIZE + payload.length + APOGEE_TC_MAC_LEN + 2;
  let off = 0;
  off += packPrimaryHeader(buf, off, CCSDS_TYPE_TC, true, APID.TC, seq, bodyLen - 1);
  off += packPusTcSecondary(buf, off, 0, serviceType, subtype);
  payload.copy(buf, off);
  off += payload.length;

  /* HMAC over everything written so far (PH + PUS + payload). */
  const mac = computeMac(buf.subarray(0, off));
  mac.copy(buf, off);
  off += APOGEE_TC_MAC_LEN;

  appendCrc(buf, off);
  return { buffer: buf, seq };
}

export function encodePing(): EncodedCommand {
  return encode(PUS.TEST, PUS.TEST_REQUEST, Buffer.alloc(0));
}

export function encodeSetMode(mode: CommandMode): EncodedCommand {
  const payload = Buffer.from([APOGEE_FN.SET_MODE, MODE_VALUES[mode]]);
  return encode(PUS.FUNCTION, PUS.FUNCTION_CALL, payload);
}

export function encodeReboot(): EncodedCommand {
  const payload = Buffer.from([APOGEE_FN.REBOOT]);
  return encode(PUS.FUNCTION, PUS.FUNCTION_CALL, payload);
}
