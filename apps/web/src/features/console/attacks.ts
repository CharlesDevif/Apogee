/* Red-team attack toolkit — operations that take a captured TC and produce
 * a modified version to inject. The goal is to stress the firmware's
 * defense-in-depth: CRC trailer, HMAC, anti-replay.
 *
 * None of these have any safety net: that's the point. */

import { APOGEE_TC_MAC_LEN } from "./ccsdsDecode";

const CRC_LEN = 2;

function crc16Ccitt(buf: Uint8Array, len: number): number {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= (buf[i] ?? 0) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function recomputeCrc(buf: Uint8Array): void {
  if (buf.length < CRC_LEN) return;
  const crc = crc16Ccitt(buf, buf.length - CRC_LEN);
  buf[buf.length - CRC_LEN] = (crc >> 8) & 0xff;
  buf[buf.length - 1] = crc & 0xff;
}

export type AttackResult = {
  label: string;
  bytes: Uint8Array;
  /** One-line explanation surfaced in the UI before send. */
  description: string;
  /** What the firmware is expected to do — for the operator to compare. */
  expected: string;
};

/** REPLAY — resend the captured TC verbatim. */
export function attackReplay(original: Uint8Array): AttackResult {
  return {
    label: "REPLAY",
    bytes: new Uint8Array(original),
    description: "Re-emit the captured packet byte-for-byte.",
    expected: "REPLAY · seq has already been accepted",
  };
}

/** STRIP MAC — zero the 16 MAC bytes, recompute the CRC so it reaches HMAC verify. */
export function attackStripMac(original: Uint8Array): AttackResult {
  const out = new Uint8Array(original);
  const macStart = out.length - CRC_LEN - APOGEE_TC_MAC_LEN;
  for (let i = 0; i < APOGEE_TC_MAC_LEN; i++) out[macStart + i] = 0;
  recomputeCrc(out);
  return {
    label: "STRIP_MAC",
    bytes: out,
    description: "Replace the HMAC with 16 zero bytes; recompute CRC so the firmware reaches the auth check.",
    expected: "BAD_HMAC · the MAC of all-zeros doesn't match the expected one",
  };
}

/** BIT FLIP — flip one bit in the payload region, recompute CRC. */
export function attackBitFlip(original: Uint8Array): AttackResult {
  const out = new Uint8Array(original);
  /* Aim at the payload region: after PH (6) + PUS (4) = 10. Before MAC (16) + CRC (2). */
  const payloadStart = 10;
  const payloadEnd = out.length - APOGEE_TC_MAC_LEN - CRC_LEN;
  const target =
    payloadEnd > payloadStart
      ? payloadStart + Math.floor((payloadEnd - payloadStart) / 2)
      : 0;
  out[target] = (out[target] ?? 0) ^ 0x01;
  recomputeCrc(out);
  return {
    label: "BIT_FLIP",
    bytes: out,
    description: `Flip one bit at offset ${target} (payload region); recompute CRC.`,
    expected: "BAD_HMAC · the MAC was computed over the original byte",
  };
}

/** CORRUPT CRC — flip a bit in the CRC trailer; don't recompute. */
export function attackCorruptCrc(original: Uint8Array): AttackResult {
  const out = new Uint8Array(original);
  out[out.length - 1] = (out[out.length - 1] ?? 0) ^ 0x01;
  return {
    label: "CORRUPT_CRC",
    bytes: out,
    description: "Flip one bit in the CRC trailer.",
    expected: "BAD_CRC · the firmware short-circuits at the integrity check",
  };
}

/** FORGE — build a fresh PING-shaped packet from scratch with a higher seq
 * and an all-zero MAC. No knowledge of the PSK. */
export function attackForgePing(captured: Uint8Array): AttackResult {
  /* We use the captured packet as a length template; just bump the seq +1
   * and zero the MAC. The CRC is recomputed so the firmware proceeds to
   * the auth check. */
  const out = new Uint8Array(captured);
  /* Bump sequence count by +5 (well past last accepted to dodge REPLAY). */
  const seqHi = out[2] ?? 0;
  const seqLo = out[3] ?? 0;
  const seq = ((seqHi & 0x3f) << 8) | seqLo;
  const newSeq = (seq + 5) & 0x3fff;
  out[2] = (out[2] & 0xc0) | ((newSeq >> 8) & 0x3f);
  out[3] = newSeq & 0xff;

  /* Zero the MAC. */
  const macStart = out.length - CRC_LEN - APOGEE_TC_MAC_LEN;
  for (let i = 0; i < APOGEE_TC_MAC_LEN; i++) out[macStart + i] = 0;

  recomputeCrc(out);
  return {
    label: "FORGE",
    bytes: out,
    description: `Build a packet with seq=${newSeq} and an all-zero MAC, no PSK knowledge.`,
    expected: "BAD_HMAC · without the key, no valid MAC can be produced",
  };
}

/** A grab-bag of attacks. The UI exposes them as buttons in the inspector. */
export const ATTACKS = [
  { id: "replay",       label: "REPLAY",       fn: attackReplay      },
  { id: "strip_mac",    label: "STRIP MAC",    fn: attackStripMac    },
  { id: "bit_flip",     label: "BIT FLIP",     fn: attackBitFlip     },
  { id: "corrupt_crc",  label: "CORRUPT CRC",  fn: attackCorruptCrc  },
  { id: "forge",        label: "FORGE",        fn: attackForgePing   },
] as const;
