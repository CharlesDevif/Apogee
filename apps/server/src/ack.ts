// Decode a CCSDS Space Packet carrying a PUS Service 1 (TC verification)
// report — symmetric with telemetry_compose_ack on the firmware side.

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

export type AckResult =
  | {
      ok: true;
      success: boolean;
      failureCode: number | null; // null on success
      tcApid: number;
      tcSeq: number;
      ts: number; // unix ms
      seqCount: number;
    }
  | { ok: false; error: string };

const HDR_BLOCK = CCSDS_PRIMARY_HEADER_SIZE + CCSDS_PUS_TM_SEC_HDR_SIZE;

export function decodeAck(data: Buffer): AckResult {
  const ph = parsePrimaryHeader(data);
  if (!ph) return { ok: false, error: "bad_primary_header" };
  if (ph.type !== CCSDS_TYPE_TM) return { ok: false, error: "wrong_type" };
  if (ph.apid !== APID.ACK) return { ok: false, error: "wrong_apid" };
  if (!ph.secHdrFlag) return { ok: false, error: "missing_secondary" };
  if (!verifyCrc(data)) return { ok: false, error: "bad_crc" };

  const sec = parsePusTmSecondary(
    data.subarray(CCSDS_PRIMARY_HEADER_SIZE, HDR_BLOCK),
  );
  if (!sec) return { ok: false, error: "bad_pus_secondary" };
  if (sec.service !== PUS.VERIFICATION) {
    return { ok: false, error: "wrong_service" };
  }

  const success = sec.subtype === PUS.VERIF_ACCEPT_OK;
  if (!success && sec.subtype !== PUS.VERIF_ACCEPT_FAIL) {
    return { ok: false, error: "bad_subtype" };
  }

  const expectedPayload = success ? 4 : 5;
  const payloadEnd = HDR_BLOCK + expectedPayload;
  if (data.length !== payloadEnd + 2) {
    return { ok: false, error: "wrong_size" };
  }

  const pktId = data.readUInt16BE(HDR_BLOCK);
  const seqCtl = data.readUInt16BE(HDR_BLOCK + 2);
  const tcApid = pktId & 0x07ff;
  const tcSeq = seqCtl & 0x3fff;
  const failureCode = success ? null : data.readUInt8(HDR_BLOCK + 4);

  return {
    ok: true,
    success,
    failureCode,
    tcApid,
    tcSeq,
    ts: sec.cucSeconds * 1000,
    seqCount: ph.seqCount,
  };
}
