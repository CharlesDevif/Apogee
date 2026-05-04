// Encode CCSDS Space Packet TC for Apogée. Symmetric with the firmware decoder.
// Each call returns a fully-formed packet (primary header + PUS-C TC secondary
// + payload + CRC) ready to push on the UDP TC port.

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

function encode(serviceType: number, subtype: number, payload: Buffer): EncodedCommand {
  const total =
    CCSDS_PRIMARY_HEADER_SIZE +
    CCSDS_PUS_TC_SEC_HDR_SIZE +
    payload.length +
    2; // CRC

  const buf = Buffer.alloc(total);
  const seq = nextSeq();

  const bodyLen = CCSDS_PUS_TC_SEC_HDR_SIZE + payload.length + 2;
  let off = 0;
  off += packPrimaryHeader(buf, off, CCSDS_TYPE_TC, true, APID.TC, seq, bodyLen - 1);
  off += packPusTcSecondary(buf, off, 0, serviceType, subtype);
  payload.copy(buf, off);
  off += payload.length;
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
