// CCSDS Space Packet Protocol (133.0-B-2) + minimal PUS-C secondary header.
// Symmetric with apps/firmware/src/ccsds.{h,c}. Big-endian on the wire.
// See docs/PROTOCOL.md.

export const CCSDS_PRIMARY_HEADER_SIZE = 6;
export const CCSDS_PUS_TM_SEC_HDR_SIZE = 7;
export const CCSDS_PUS_TC_SEC_HDR_SIZE = 4;
export const CCSDS_CRC_SIZE = 2;

export const CCSDS_PVN = 0;
export const CCSDS_TYPE_TM = 0;
export const CCSDS_TYPE_TC = 1;
export const CCSDS_SEQF_UNSEGMENTED = 3;

export const PUS_VERSION_C = 0x10;

// APIDs — must match the firmware definitions.
export const APID = {
  HK: 0x100,
  EVENT: 0x101,
  ACK: 0x102,
  TC: 0x200,
} as const;

export const PUS = {
  VERIFICATION: 1,
  VERIF_ACCEPT_OK: 1,
  VERIF_ACCEPT_FAIL: 2,
  HOUSEKEEPING: 3,
  HK_REPORT: 25,
  EVENT: 5,
  EVENT_INFO: 1,
  EVENT_HIGH: 4,
  FUNCTION: 8,
  FUNCTION_CALL: 1,
  TEST: 17,
  TEST_REQUEST: 1,
  TEST_REPORT: 2,
} as const;

export const APOGEE_FN = {
  SET_MODE: 0x01,
  REBOOT: 0x02,
} as const;

// CRC-16-CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflect, no xor-out.
export function crc16Ccitt(buf: Buffer | Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= (buf[i] as number) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

// --- Encoding ----------------------------------------------------------

export function packPrimaryHeader(
  buf: Buffer,
  offset: number,
  type: 0 | 1,
  secHdr: boolean,
  apid: number,
  seqCount: number,
  dataLengthMinus1: number,
): number {
  let w0 = (CCSDS_PVN & 0x07) << 13;
  w0 |= (type & 0x01) << 12;
  w0 |= (secHdr ? 1 : 0) << 11;
  w0 |= apid & 0x07ff;

  let w1 = (CCSDS_SEQF_UNSEGMENTED & 0x03) << 14;
  w1 |= seqCount & 0x3fff;

  buf.writeUInt16BE(w0, offset);
  buf.writeUInt16BE(w1, offset + 2);
  buf.writeUInt16BE(dataLengthMinus1 & 0xffff, offset + 4);
  return CCSDS_PRIMARY_HEADER_SIZE;
}

export function packPusTmSecondary(
  buf: Buffer,
  offset: number,
  service: number,
  subtype: number,
  cucSeconds: number,
): number {
  buf.writeUInt8(PUS_VERSION_C, offset);
  buf.writeUInt8(service, offset + 1);
  buf.writeUInt8(subtype, offset + 2);
  buf.writeUInt32BE(cucSeconds >>> 0, offset + 3);
  return CCSDS_PUS_TM_SEC_HDR_SIZE;
}

export function packPusTcSecondary(
  buf: Buffer,
  offset: number,
  ackFlags: number,
  service: number,
  subtype: number,
): number {
  buf.writeUInt8(PUS_VERSION_C, offset);
  buf.writeUInt8(ackFlags, offset + 1);
  buf.writeUInt8(service, offset + 2);
  buf.writeUInt8(subtype, offset + 3);
  return CCSDS_PUS_TC_SEC_HDR_SIZE;
}

export function appendCrc(buf: Buffer, packetLen: number): number {
  const crc = crc16Ccitt(buf.subarray(0, packetLen));
  buf.writeUInt16BE(crc, packetLen);
  return packetLen + CCSDS_CRC_SIZE;
}

// --- Decoding ----------------------------------------------------------

export type CcsdsPrimaryHeader = {
  version: number;
  type: 0 | 1;
  secHdrFlag: boolean;
  apid: number;
  seqFlags: number;
  seqCount: number;
  dataLength: number; // real bytes after PH = (PDL field) + 1
};

export type CcsdsPusTmSecondary = {
  pusVersion: number;
  service: number;
  subtype: number;
  cucSeconds: number;
};

export type CcsdsPusTcSecondary = {
  pusVersion: number;
  ackFlags: number;
  service: number;
  subtype: number;
};

export function parsePrimaryHeader(buf: Buffer): CcsdsPrimaryHeader | null {
  if (buf.length < CCSDS_PRIMARY_HEADER_SIZE) return null;
  const w0 = buf.readUInt16BE(0);
  const w1 = buf.readUInt16BE(2);
  const pdl = buf.readUInt16BE(4);
  const version = (w0 >> 13) & 0x07;
  if (version !== CCSDS_PVN) return null;
  const type = ((w0 >> 12) & 0x01) as 0 | 1;
  return {
    version,
    type,
    secHdrFlag: ((w0 >> 11) & 0x01) !== 0,
    apid: w0 & 0x07ff,
    seqFlags: (w1 >> 14) & 0x03,
    seqCount: w1 & 0x3fff,
    dataLength: pdl + 1,
  };
}

export function parsePusTmSecondary(buf: Buffer): CcsdsPusTmSecondary | null {
  if (buf.length < CCSDS_PUS_TM_SEC_HDR_SIZE) return null;
  const pusVersion = buf.readUInt8(0);
  if (pusVersion !== PUS_VERSION_C) return null;
  return {
    pusVersion,
    service: buf.readUInt8(1),
    subtype: buf.readUInt8(2),
    cucSeconds: buf.readUInt32BE(3),
  };
}

export function parsePusTcSecondary(buf: Buffer): CcsdsPusTcSecondary | null {
  if (buf.length < CCSDS_PUS_TC_SEC_HDR_SIZE) return null;
  const pusVersion = buf.readUInt8(0);
  if (pusVersion !== PUS_VERSION_C) return null;
  return {
    pusVersion,
    ackFlags: buf.readUInt8(1),
    service: buf.readUInt8(2),
    subtype: buf.readUInt8(3),
  };
}

export function verifyCrc(buf: Buffer): boolean {
  if (buf.length < CCSDS_CRC_SIZE) return false;
  const body = buf.length - CCSDS_CRC_SIZE;
  const got = buf.readUInt16BE(body);
  const expected = crc16Ccitt(buf.subarray(0, body));
  return got === expected;
}
