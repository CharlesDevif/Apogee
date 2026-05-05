/* CCSDS Space Packet decoder — frontend mirror of apps/server/src/ccsds.ts.
 * Returns a structural decomposition suitable for the Packet Inspector:
 * groups (PH/PUS/payload/CRC) for hex view tinting, and named fields for
 * the readable list. See docs/PROTOCOL.md for the field-level rationale. */

export type FieldGroup = "primary" | "secondary" | "payload" | "crc";

export type ByteRange = {
  group: FieldGroup;
  start: number;
  length: number;
};

export type Field = {
  group: FieldGroup;
  name: string;
  /** Byte offset of the field's first byte. */
  byteStart: number;
  /** Number of bytes spanned (always whole bytes for visual highlight). */
  byteLength: number;
  /** Optional sub-byte range within byteStart for bit-level fields. */
  bitStart?: number;
  bitLength?: number;
  /** Human-readable formatted value. */
  value: string;
  /** One-line semantic hint for the inspector. */
  hint?: string;
};

export type DecodedPacket = {
  direction: "TM" | "TC";
  apid: number;
  apidName: string;
  totalLength: number;
  ranges: ByteRange[];
  fields: Field[];
  crcOk: boolean;
  /** Free-form summary line, e.g. "PUS 17/1 · Connection Test" */
  summary: string;
};

/* ----- Helpers ----- */

function u16be(b: Uint8Array, off: number): number {
  return ((b[off] ?? 0) << 8) | (b[off + 1] ?? 0);
}
function u32be(b: Uint8Array, off: number): number {
  return (
    ((b[off] ?? 0) * 0x1000000) +
    (((b[off + 1] ?? 0) << 16) >>> 0) +
    (((b[off + 2] ?? 0) << 8) >>> 0) +
    (b[off + 3] ?? 0)
  );
}
function i32be(b: Uint8Array, off: number): number {
  const v = u32be(b, off);
  return v >= 0x80000000 ? v - 0x100000000 : v;
}

function crc16Ccitt(b: Uint8Array, len: number): number {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= (b[i] ?? 0) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

const APID_NAMES: Record<number, string> = {
  0x100: "HK",
  0x101: "EVENT",
  0x102: "ACK",
  0x200: "TC",
};

/* ----- Field builders for each known service/subtype ----- */

function decodeTcSecondary(b: Uint8Array, off: number): {
  fields: Field[];
  service: number;
  subtype: number;
} {
  const pvn = b[off] ?? 0;
  const ack = b[off + 1] ?? 0;
  const service = b[off + 2] ?? 0;
  const subtype = b[off + 3] ?? 0;
  return {
    service,
    subtype,
    fields: [
      {
        group: "secondary",
        name: "PUS Version",
        byteStart: off,
        byteLength: 1,
        value: `0x${pvn.toString(16).padStart(2, "0")}`,
        hint: pvn === 0x10 ? "PUS-C (version 2)" : "non-standard PUS version",
      },
      {
        group: "secondary",
        name: "Ack Flags",
        byteStart: off + 1,
        byteLength: 1,
        value: `0x${ack.toString(16).padStart(2, "0")}`,
        hint: "request additional ack stages (acceptance/start/progress/completion)",
      },
      {
        group: "secondary",
        name: "Service Type",
        byteStart: off + 2,
        byteLength: 1,
        value: String(service),
        hint: pusServiceName(service, "TC"),
      },
      {
        group: "secondary",
        name: "Service Subtype",
        byteStart: off + 3,
        byteLength: 1,
        value: String(subtype),
        hint: pusSubtypeName(service, subtype, "TC"),
      },
    ],
  };
}

function decodeTmSecondary(b: Uint8Array, off: number): {
  fields: Field[];
  service: number;
  subtype: number;
} {
  const pvn = b[off] ?? 0;
  const service = b[off + 1] ?? 0;
  const subtype = b[off + 2] ?? 0;
  const cuc = u32be(b, off + 3);
  const date = new Date(cuc * 1000);
  return {
    service,
    subtype,
    fields: [
      {
        group: "secondary",
        name: "PUS Version",
        byteStart: off,
        byteLength: 1,
        value: `0x${pvn.toString(16).padStart(2, "0")}`,
        hint: pvn === 0x10 ? "PUS-C (version 2)" : "non-standard PUS version",
      },
      {
        group: "secondary",
        name: "Service Type",
        byteStart: off + 1,
        byteLength: 1,
        value: String(service),
        hint: pusServiceName(service, "TM"),
      },
      {
        group: "secondary",
        name: "Service Subtype",
        byteStart: off + 2,
        byteLength: 1,
        value: String(subtype),
        hint: pusSubtypeName(service, subtype, "TM"),
      },
      {
        group: "secondary",
        name: "CUC Timestamp",
        byteStart: off + 3,
        byteLength: 4,
        value: `${cuc} (${date.toISOString().slice(11, 19)} UTC)`,
        hint: "CCSDS Unsegmented Code · seconds since unix epoch",
      },
    ],
  };
}

function pusServiceName(s: number, dir: "TM" | "TC"): string {
  switch (s) {
    case 1: return "Request Verification";
    case 3: return dir === "TM" ? "Housekeeping report" : "Housekeeping request";
    case 5: return "Event Reporting";
    case 8: return "Function Management";
    case 17: return "Test";
    default: return `service ${s} (unknown to Apogée)`;
  }
}

function pusSubtypeName(s: number, st: number, dir: "TM" | "TC"): string {
  if (s === 17 && st === 1) return "Connection Test request";
  if (s === 17 && st === 2) return "Connection Test report";
  if (s === 8 && st === 1) return "Function call";
  if (s === 1 && st === 1) return "TC Acceptance · success";
  if (s === 1 && st === 2) return "TC Acceptance · failure";
  if (s === 3 && st === 25) return "HK parameter report";
  if (s === 5 && st === 1) return "Informative event";
  return `subtype ${st} ${dir}`;
}

/* ----- Payload decoders ----- */

function decodeTcPayload(
  b: Uint8Array,
  off: number,
  len: number,
  service: number,
  subtype: number,
): { fields: Field[]; summary: string } {
  if (service === 17 && subtype === 1) {
    return { fields: [], summary: "PUS 17/1 · Connection Test (PING)" };
  }
  if (service === 8 && subtype === 1 && len >= 1) {
    const fnId = b[off] ?? 0;
    const fields: Field[] = [
      {
        group: "payload",
        name: "Function ID",
        byteStart: off,
        byteLength: 1,
        value: `0x${fnId.toString(16).padStart(2, "0")}`,
        hint: fnId === 0x01 ? "SET_MODE" : fnId === 0x02 ? "REBOOT" : "unknown function",
      },
    ];
    let summary = `PUS 8/1 · function call · 0x${fnId.toString(16).padStart(2, "0")}`;
    if (fnId === 0x01 && len >= 2) {
      const mode = b[off + 1] ?? 0;
      const modeName =
        ["SAFE", "NOMINAL", "COMMS", "FAULT", "BOOT"][mode] ?? `mode ${mode}`;
      fields.push({
        group: "payload",
        name: "Mode",
        byteStart: off + 1,
        byteLength: 1,
        value: `${mode} (${modeName})`,
        hint: "ApogeeMode enum value",
      });
      summary = `PUS 8/1 · SET_MODE ${modeName}`;
    } else if (fnId === 0x02) {
      summary = "PUS 8/1 · REBOOT";
    }
    return { fields, summary };
  }
  return { fields: [], summary: `PUS ${service}/${subtype}` };
}

function decodeAckPayload(
  b: Uint8Array,
  off: number,
  len: number,
  subtype: number,
): { fields: Field[]; summary: string } {
  if (len < 4) return { fields: [], summary: "ack · payload truncated" };
  const pktId = u16be(b, off);
  const seqCtl = u16be(b, off + 2);
  const tcApid = pktId & 0x07ff;
  const tcSeq = seqCtl & 0x3fff;
  const fields: Field[] = [
    {
      group: "payload",
      name: "TC Packet ID",
      byteStart: off,
      byteLength: 2,
      value: `0x${pktId.toString(16).padStart(4, "0")} (apid=0x${tcApid.toString(16)})`,
      hint: "first 16 bits of the referenced TC primary header",
    },
    {
      group: "payload",
      name: "TC Sequence Control",
      byteStart: off + 2,
      byteLength: 2,
      value: `0x${seqCtl.toString(16).padStart(4, "0")} (seq=${tcSeq})`,
      hint: "seq flags + 14-bit count of the referenced TC",
    },
  ];
  let summary =
    subtype === 1
      ? `PUS 1/1 · acceptance OK · TC#${tcSeq}`
      : `PUS 1/2 · acceptance FAIL · TC#${tcSeq}`;
  if (subtype === 2 && len >= 5) {
    const fc = b[off + 4] ?? 0;
    fields.push({
      group: "payload",
      name: "Failure Code",
      byteStart: off + 4,
      byteLength: 1,
      value: `${fc}`,
      hint: "maps to firmware CommandOutcome enum",
    });
    summary += ` (fc=${fc})`;
  }
  return { fields, summary };
}

function decodeHkPayload(
  b: Uint8Array,
  off: number,
  len: number,
): { fields: Field[]; summary: string } {
  if (len < 25) return { fields: [], summary: "hk · payload truncated" };
  const mode = b[off] ?? 0;
  const battMv = u16be(b, off + 1);
  const latE7 = i32be(b, off + 3);
  const lonE7 = i32be(b, off + 7);
  const altM = u32be(b, off + 11);
  const modeName = ["SAFE", "NOMINAL", "COMMS", "FAULT", "BOOT"][mode] ?? "?";
  return {
    fields: [
      {
        group: "payload",
        name: "Mode",
        byteStart: off,
        byteLength: 1,
        value: `${mode} (${modeName})`,
      },
      {
        group: "payload",
        name: "Battery",
        byteStart: off + 1,
        byteLength: 2,
        value: `${battMv} mV`,
      },
      {
        group: "payload",
        name: "Latitude",
        byteStart: off + 3,
        byteLength: 4,
        value: `${(latE7 / 1e7).toFixed(4)}°`,
        hint: "int32 · degrees × 10⁷",
      },
      {
        group: "payload",
        name: "Longitude",
        byteStart: off + 7,
        byteLength: 4,
        value: `${(lonE7 / 1e7).toFixed(4)}°`,
        hint: "int32 · degrees × 10⁷",
      },
      {
        group: "payload",
        name: "Altitude",
        byteStart: off + 11,
        byteLength: 4,
        value: `${altM} m`,
      },
      {
        group: "payload",
        name: "Attitude (roll/pitch/yaw)",
        byteStart: off + 15,
        byteLength: 6,
        value: "int16×3 · deg × 10",
      },
      {
        group: "payload",
        name: "Tick count",
        byteStart: off + 21,
        byteLength: 4,
        value: String(u32be(b, off + 21)),
        hint: "ticks since firmware boot (10 Hz)",
      },
    ],
    summary: `PUS 3/25 · HK report · ${modeName}`,
  };
}

/* ----- Main entry ----- */

export function decodePacket(bytes: Uint8Array): DecodedPacket {
  const total = bytes.length;
  if (total < 8) {
    return {
      direction: "TC",
      apid: 0,
      apidName: "—",
      totalLength: total,
      ranges: [],
      fields: [],
      crcOk: false,
      summary: "packet too short",
    };
  }

  const w0 = u16be(bytes, 0);
  const w1 = u16be(bytes, 2);
  const pdl = u16be(bytes, 4);
  const version = (w0 >> 13) & 0x07;
  const type = (w0 >> 12) & 0x01;
  const secHdr = ((w0 >> 11) & 0x01) !== 0;
  const apid = w0 & 0x07ff;
  const seqFlags = (w1 >> 14) & 0x03;
  const seqCount = w1 & 0x3fff;
  const direction: "TM" | "TC" = type === 1 ? "TC" : "TM";
  const apidName = APID_NAMES[apid] ?? `0x${apid.toString(16)}`;

  const fields: Field[] = [
    {
      group: "primary",
      name: "Version",
      byteStart: 0,
      byteLength: 1,
      bitStart: 0,
      bitLength: 3,
      value: `0b${version.toString(2).padStart(3, "0")}`,
      hint: "always 0b000 for CCSDS 133.0-B-2",
    },
    {
      group: "primary",
      name: "Packet Type",
      byteStart: 0,
      byteLength: 1,
      bitStart: 3,
      bitLength: 1,
      value: type === 0 ? "0 (TM)" : "1 (TC)",
      hint: type === 0 ? "telemetry · downlink" : "telecommand · uplink",
    },
    {
      group: "primary",
      name: "Sec Hdr Flag",
      byteStart: 0,
      byteLength: 1,
      bitStart: 4,
      bitLength: 1,
      value: secHdr ? "1" : "0",
      hint: secHdr ? "secondary header present" : "no secondary header",
    },
    {
      group: "primary",
      name: "APID",
      byteStart: 0,
      byteLength: 2,
      bitStart: 5,
      bitLength: 11,
      value: `0x${apid.toString(16).padStart(3, "0")} (${apidName})`,
      hint: "Application Process Identifier",
    },
    {
      group: "primary",
      name: "Seq Flags",
      byteStart: 2,
      byteLength: 1,
      bitStart: 0,
      bitLength: 2,
      value: `0b${seqFlags.toString(2).padStart(2, "0")}`,
      hint: seqFlags === 3 ? "unsegmented (standalone packet)" : "segmented",
    },
    {
      group: "primary",
      name: "Sequence Count",
      byteStart: 2,
      byteLength: 2,
      bitStart: 2,
      bitLength: 14,
      value: String(seqCount),
      hint: "increments per APID, mod 16384",
    },
    {
      group: "primary",
      name: "Packet Data Length",
      byteStart: 4,
      byteLength: 2,
      value: `${pdl} (= ${pdl + 1} bytes after header)`,
      hint: "CCSDS convention: stored value is real_length − 1",
    },
  ];

  const ranges: ByteRange[] = [{ group: "primary", start: 0, length: 6 }];

  let summary = `CCSDS · ${direction} · APID ${apidName}`;
  let after = 6;
  let service = 0, subtype = 0;
  if (secHdr) {
    if (direction === "TC") {
      const sec = decodeTcSecondary(bytes, 6);
      fields.push(...sec.fields);
      ranges.push({ group: "secondary", start: 6, length: 4 });
      after = 10;
      service = sec.service;
      subtype = sec.subtype;
    } else {
      const sec = decodeTmSecondary(bytes, 6);
      fields.push(...sec.fields);
      ranges.push({ group: "secondary", start: 6, length: 7 });
      after = 13;
      service = sec.service;
      subtype = sec.subtype;
    }
  }

  const payloadEnd = total - 2;
  const payloadLen = Math.max(0, payloadEnd - after);
  if (payloadLen > 0) {
    let payload: { fields: Field[]; summary: string };
    if (direction === "TC") {
      payload = decodeTcPayload(bytes, after, payloadLen, service, subtype);
    } else if (apid === 0x102) {
      payload = decodeAckPayload(bytes, after, payloadLen, subtype);
    } else if (apid === 0x100) {
      payload = decodeHkPayload(bytes, after, payloadLen);
    } else {
      payload = { fields: [], summary: `PUS ${service}/${subtype}` };
    }
    fields.push(...payload.fields);
    ranges.push({ group: "payload", start: after, length: payloadLen });
    summary = payload.summary;
  }

  /* CRC trailer */
  const crcExpected = crc16Ccitt(bytes, total - 2);
  const crcReceived = u16be(bytes, total - 2);
  const crcOk = crcExpected === crcReceived;
  fields.push({
    group: "crc",
    name: "CRC-16-CCITT",
    byteStart: total - 2,
    byteLength: 2,
    value: `0x${crcReceived.toString(16).padStart(4, "0")}${crcOk ? "" : ` ≠ 0x${crcExpected.toString(16).padStart(4, "0")}`}`,
    hint: crcOk ? "trailer matches computed CRC" : "MISMATCH · packet integrity broken",
  });
  ranges.push({ group: "crc", start: total - 2, length: 2 });

  return {
    direction,
    apid,
    apidName,
    totalLength: total,
    ranges,
    fields,
    crcOk,
    summary,
  };
}

export function groupColor(group: FieldGroup): string {
  switch (group) {
    case "primary":   return "phosphor";
    case "secondary": return "jade";
    case "payload":   return "ink";
    case "crc":       return "alert-glow";
  }
}

export function groupLabel(group: FieldGroup): string {
  switch (group) {
    case "primary":   return "PRIMARY HEADER";
    case "secondary": return "PUS SECONDARY";
    case "payload":   return "USER DATA";
    case "crc":       return "CRC TRAILER";
  }
}
