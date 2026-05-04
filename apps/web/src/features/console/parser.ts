import type { CommandRequest } from "@apogee/shared-types";

export type ParseResult =
  | { kind: "command"; request: CommandRequest; display: string }
  | { kind: "local"; action: "clear" | "help" }
  | { kind: "error"; message: string };

const MODES = ["SAFE", "NOMINAL", "COMMS", "FAULT"] as const;
const MODE_SET = new Set<string>(MODES);

/** Available commands surfaced in the help line. */
export const VOCAB = [
  "ping",
  "safe",
  "nominal",
  "fault",
  "comms",
  "set_mode",
  "reboot",
  "help",
  "clear",
] as const;

export function parse(line: string): ParseResult | null {
  const raw = line.trim();
  if (raw.length === 0) return null;
  const lower = raw.toLowerCase();
  const [head, ...rest] = lower.split(/\s+/);

  if (head === "help" || head === "?") return { kind: "local", action: "help" };
  if (head === "clear") return { kind: "local", action: "clear" };

  if (head === "ping") {
    return { kind: "command", request: { command: "PING" }, display: "PING" };
  }

  if (head === "reboot") {
    return { kind: "command", request: { command: "REBOOT" }, display: "REBOOT" };
  }

  /* Mode shortcuts: typing the mode name on its own. */
  if (head && MODE_SET.has(head.toUpperCase())) {
    const mode = head.toUpperCase() as (typeof MODES)[number];
    return {
      kind: "command",
      request: { command: "SET_MODE", mode },
      display: `SET_MODE ${mode}`,
    };
  }

  if (head === "set_mode") {
    const arg = rest[0]?.toUpperCase();
    if (!arg) return { kind: "error", message: "set_mode requires a mode" };
    if (!MODE_SET.has(arg)) {
      return { kind: "error", message: `unknown mode: ${arg.toLowerCase()}` };
    }
    return {
      kind: "command",
      request: { command: "SET_MODE", mode: arg as (typeof MODES)[number] },
      display: `SET_MODE ${arg}`,
    };
  }

  return { kind: "error", message: `unknown command: ${head}` };
}

/** Best prefix match against the vocabulary; returns null if nothing or
 * multiple equally long matches share the same prefix. */
export function complete(prefix: string): string | null {
  if (prefix.length === 0) return null;
  const lower = prefix.toLowerCase();
  const matches = VOCAB.filter((v) => v.startsWith(lower));
  if (matches.length === 1) return matches[0]!;
  return null;
}
