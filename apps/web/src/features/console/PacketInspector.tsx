import { useMemo, useState } from "react";
import {
  decodePacket,
  type DecodedPacket,
  type Field,
  type FieldGroup,
} from "./ccsdsDecode";

const BYTES_PER_ROW = 16;

const GROUP_BG: Record<FieldGroup, string> = {
  primary: "bg-phosphor/15 border-phosphor/40",
  secondary: "bg-jade/15 border-jade/40",
  payload: "bg-ink/10 border-ink/30",
  crc: "bg-alert/15 border-alert/40",
};

const GROUP_BAR: Record<FieldGroup, string> = {
  primary: "bg-phosphor",
  secondary: "bg-jade",
  payload: "bg-ink/60",
  crc: "bg-alert",
};

const GROUP_LABEL: Record<FieldGroup, string> = {
  primary: "HEADER",
  secondary: "PUS",
  payload: "PAYLOAD",
  crc: "CRC",
};

/* ---------- Human summary -------------------------------------- */

type Summary = {
  /** Big headline, e.g. "SET_MODE → NOMINAL", "PING", "ACK OK · TC#001" */
  headline: string;
  headlineTone: "phosphor" | "jade" | "alert-glow";
  /** Plain-language one-liner. */
  description: string;
  /** Where it goes / what it references. */
  target: string;
  /** Protocol descriptor. */
  protocol: string;
  /** Integrity status string. */
  integrity: string;
  integrityOk: boolean;
};

function summarize(d: DecodedPacket): Summary {
  /* Find a few fields by name for context. */
  const fieldByName = (n: string) => d.fields.find((f) => f.name === n);
  const service = fieldByName("Service Type")?.value;
  const subtype = fieldByName("Service Subtype")?.value;
  const seqCount = fieldByName("Sequence Count")?.value ?? "—";

  let headline = `${d.direction} · APID ${d.apidName}`;
  let tone: Summary["headlineTone"] = "phosphor";
  let description = d.summary;

  if (d.direction === "TC") {
    if (service === "17" && subtype === "1") {
      headline = "PING";
      description = "Connection test — ask the OBC if it's alive";
    } else if (service === "8" && subtype === "1") {
      const fnId = fieldByName("Function ID")?.value ?? "?";
      const mode = fieldByName("Mode")?.value;
      if (fnId.startsWith("0x01") && mode) {
        const modeName = mode.match(/\(([A-Z]+)\)/)?.[1] ?? mode;
        headline = `SET_MODE → ${modeName}`;
        description = `Switch operating mode to ${modeName}`;
      } else if (fnId.startsWith("0x02")) {
        headline = "REBOOT";
        tone = "alert-glow";
        description = "Force the firmware to re-initialize state and physics";
      } else {
        headline = "FUNCTION CALL";
        description = `PUS 8/1 function call · id ${fnId}`;
      }
    }
  } else if (d.apid === 0x102) {
    if (subtype === "1") {
      const tcSeq = fieldByName("TC Sequence Control")?.value.match(/seq=(\d+)/)?.[1] ?? "?";
      headline = `ACK OK · TC#${String(tcSeq).padStart(3, "0")}`;
      tone = "jade";
      description = "Onboard accepted and executed the referenced telecommand";
    } else if (subtype === "2") {
      const tcSeq = fieldByName("TC Sequence Control")?.value.match(/seq=(\d+)/)?.[1] ?? "?";
      const fc = fieldByName("Failure Code")?.value ?? "?";
      headline = `ACK FAIL · TC#${String(tcSeq).padStart(3, "0")}`;
      tone = "alert-glow";
      description = `Onboard rejected the telecommand · failure code ${fc}`;
    }
  } else if (d.apid === 0x100) {
    const mode = fieldByName("Mode")?.value;
    const modeName = mode?.match(/\(([A-Z]+)\)/)?.[1] ?? mode ?? "?";
    headline = `HOUSEKEEPING · ${modeName}`;
    tone = "jade";
    description = "Periodic state report from the spacecraft";
  }

  const target =
    d.direction === "TC"
      ? "→ OBC · APID 0x200 (telecommand)"
      : d.apid === 0x102
        ? "← OBC · APID 0x102 (TC verification)"
        : d.apid === 0x100
          ? "← OBC · APID 0x100 (housekeeping)"
          : `APID 0x${d.apid.toString(16)}`;

  const protocol =
    service && subtype
      ? `CCSDS Space Packet · PUS-C ${service}/${subtype} · seq #${seqCount}`
      : `CCSDS Space Packet · seq #${seqCount}`;

  const integrity = d.crcOk
    ? "CRC-16-CCITT verified"
    : "CRC mismatch · packet integrity broken";

  return { headline, headlineTone: tone, description, target, protocol, integrity, integrityOk: d.crcOk };
}

/* ---------- Component ----------------------------------------- */

export function PacketInspector({
  bytes,
  title,
}: {
  bytes: Uint8Array;
  title: string;
}) {
  const decoded = useMemo(() => decodePacket(bytes), [bytes]);
  const summary = useMemo(() => summarize(decoded), [decoded]);
  const [showAllFields, setShowAllFields] = useState(false);
  const [hoveredField, setHoveredField] = useState<number | null>(null);

  /* Field set: by default we hide the bit-level primary header internals
   * to keep the inspector readable. Operator can opt into the full dump. */
  const semanticFields = useMemo<Field[]>(() => {
    return decoded.fields.filter((f) => {
      if (showAllFields) return true;
      if (f.group !== "primary") return true;
      // Keep only the operationally meaningful primary header fields.
      return f.name === "Sequence Count" || f.name === "Packet Data Length";
    });
  }, [decoded.fields, showAllFields]);

  const highlightRange = useMemo(() => {
    if (hoveredField === null) return null;
    const f = semanticFields[hoveredField];
    if (!f) return null;
    return { start: f.byteStart, end: f.byteStart + f.byteLength };
  }, [hoveredField, semanticFields]);

  /* Anatomy bar segments — proportional to byte length. */
  const anatomy = decoded.ranges.map((r) => ({
    group: r.group,
    label: GROUP_LABEL[r.group],
    bytes: r.length,
    pct: (r.length / decoded.totalLength) * 100,
  }));

  const groupOf = (byte: number): FieldGroup | null => {
    for (const r of decoded.ranges) {
      if (byte >= r.start && byte < r.start + r.length) return r.group;
    }
    return null;
  };

  return (
    <div className="border-t border-border/60 bg-graphite/40 px-4 py-3">
      {/* ─── Headline ─────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <span
          className={`font-display text-[18px] tracking-[0.18em] ${summary.headlineTone}`}
        >
          {summary.headline}
        </span>
        <span className="text-[10px] tracking-[0.3em] uppercase text-dim tnum">
          {decoded.totalLength}B · {decoded.direction} ·{" "}
          <span className={summary.integrityOk ? "jade" : "alert-glow"}>
            CRC {summary.integrityOk ? "OK" : "FAIL"}
          </span>
        </span>
      </div>
      <div className="text-[11px] text-ink mb-3">{summary.description}</div>

      {/* ─── Context strip ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 mb-4 text-[11px]">
        <ContextRow label="ADDRESSING" value={summary.target} />
        <ContextRow label="PROTOCOL" value={summary.protocol} />
        <ContextRow label="REFERENCE" value={title} />
        <ContextRow
          label="INTEGRITY"
          value={summary.integrity}
          tone={summary.integrityOk ? "jade" : "alert-glow"}
        />
      </div>

      {/* ─── Anatomy bar ─────────────────────────────────────── */}
      <div className="mb-4">
        <div className="text-[9px] tracking-[0.3em] text-dim uppercase mb-1.5">
          PACKET ANATOMY · {decoded.totalLength} BYTES
        </div>
        <div className="flex h-4 border border-border">
          {anatomy.map((seg, i) => (
            <div
              key={i}
              className={`${GROUP_BAR[seg.group]} ${i > 0 ? "border-l border-border" : ""} flex items-center justify-center text-[8px] tracking-[0.25em] uppercase text-void font-bold`}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label} · ${seg.bytes} bytes`}
            >
              {seg.pct > 12 ? `${seg.label} ${seg.bytes}B` : ""}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Hex dump ────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="text-[9px] tracking-[0.3em] text-dim uppercase mb-1.5">
          ON-THE-WIRE BYTES
        </div>
        <div className="font-mono text-[11px] tnum leading-[1.7]">
          {Array.from({ length: Math.ceil(bytes.length / BYTES_PER_ROW) }).map(
            (_, row) => {
              const rowStart = row * BYTES_PER_ROW;
              const rowLen = Math.min(BYTES_PER_ROW, bytes.length - rowStart);
              return (
                <div key={row} className="flex items-center gap-3 flex-nowrap">
                  <span className="text-dim w-[34px] text-right shrink-0">
                    {rowStart.toString(16).padStart(4, "0").toUpperCase()}
                  </span>
                  <div className="flex gap-[3px] flex-nowrap">
                    {Array.from({ length: rowLen }).map((_, col) => {
                      const idx = rowStart + col;
                      const b = bytes[idx] ?? 0;
                      const g = groupOf(idx);
                      const isHighlighted =
                        highlightRange !== null &&
                        idx >= highlightRange.start &&
                        idx < highlightRange.end;
                      const cls = g
                        ? GROUP_BG[g]
                        : "bg-transparent border-border/30";
                      /* Add a tiny visual gap when the next byte changes group. */
                      const nextG = groupOf(idx + 1);
                      const groupBoundary =
                        idx + 1 < rowStart + rowLen && g !== nextG;
                      return (
                        <span
                          key={idx}
                          className={`px-[5px] py-[1px] border ${cls} ${
                            isHighlighted
                              ? "ring-1 ring-phosphor outline outline-1 outline-phosphor"
                              : ""
                          } ${groupBoundary ? "mr-1.5" : ""}`}
                        >
                          {b.toString(16).padStart(2, "0").toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {/* ─── Field list ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[9px] tracking-[0.3em] text-dim uppercase">
            DETAILS
          </div>
          <button
            type="button"
            onClick={() => setShowAllFields((v) => !v)}
            className="text-[9px] tracking-[0.3em] uppercase text-dim hover:text-ink"
          >
            {showAllFields ? "− HIDE BIT-LEVEL" : "+ SHOW BIT-LEVEL FIELDS"}
          </button>
        </div>
        <div className="text-[11px] divide-y divide-border/40 border border-border/40">
          {semanticFields.map((f, i) => {
            const active = hoveredField === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredField(i)}
                onMouseLeave={() => setHoveredField((h) => (h === i ? null : h))}
                className={`flex items-baseline gap-3 px-3 py-1 ${
                  active ? "bg-rail/60" : ""
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 mt-1 ${GROUP_BAR[f.group]} shrink-0`}
                />
                <span className="w-[180px] text-dim shrink-0">{f.name}</span>
                <span className="flex-1 text-ink">{f.value}</span>
                {f.hint ? (
                  <span className="text-deep italic shrink-0 max-w-[40%] text-right truncate">
                    {f.hint}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 text-[9px] tracking-[0.3em] uppercase text-dim">
          HOVER A LINE TO HIGHLIGHT ITS BYTES ABOVE
        </div>
      </div>
    </div>
  );
}

function ContextRow({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[100px] text-[9px] tracking-[0.3em] text-dim uppercase shrink-0">
        {label}
      </span>
      <span className={`flex-1 ${tone}`}>{value}</span>
    </div>
  );
}
