import { create } from "zustand";
import type {
  CommandRequest,
  TelemetrySample,
  TleEntry,
  TleBundle,
} from "@apogee/shared-types";
import type { OrbitPoint, SatPosition } from "../workers/sgp4.worker";

export type LinkState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "open"; since: number }
  | { kind: "closed"; lastError?: string };

export type Transmission = {
  /** Synthetic monotonically-increasing row id. Distinct from `seq` because
   * replayed/tampered attacks reuse the original packet's seq number — they
   * still deserve their own row in the log. */
  id: number;
  seq: number;
  command: CommandRequest["command"] | "RAW";
  /** Optional argument string for display (e.g. "NOMINAL" for SET_MODE). */
  arg: string | null;
  sentAt: number;
  sizeBytes: number;
  /** Raw CCSDS TC bytes as transmitted on UDP. */
  tcBytes: Uint8Array;
  /** "operator" = signed by the backend.
   *  "attack"   = red-team raw injection (no signing). */
  origin: "operator" | "attack";
  /** Attack tag (REPLAY, STRIP_MAC, FORGE_REBOOT, …) for red-team rows. */
  attackLabel: string | null;
  ackAt: number | null;
  success: boolean | null;
  /** Maps to firmware CommandOutcome enum on failure. */
  failureCode: number | null;
  /** Raw CCSDS TM ack bytes received from the firmware, if any. */
  ackBytes: Uint8Array | null;
};

type MissionState = {
  link: LinkState;
  tle: TleBundle | null;
  positions: Map<number, SatPosition>;
  selectedNoradId: number | null;
  /** Currently focused commandable target. Null when nothing is targeted.
   * Mutually exclusive with selectedNoradId — selecting one clears the other. */
  selectedCubesat: string | null;
  selectedOrbit: { noradId: number; points: OrbitPoint[] } | null;
  cubesat: TelemetrySample | null;
  cubesatLastAt: number | null;
  events: Array<{ ts: number; level: "info" | "ok" | "warn" | "alert"; text: string }>;
  /** TC log keyed by synthetic row id. We never delete: history is the audit. */
  transmissions: Map<number, Transmission>;
  /** Order of row ids as they were sent. */
  transmissionOrder: number[];
  /** Monotonic counter used to mint new transmission ids. */
  nextTxId: number;

  setLink: (s: LinkState) => void;
  setTle: (b: TleBundle) => void;
  setPositions: (p: SatPosition[]) => void;
  selectSat: (id: number | null) => void;
  selectCubesat: (id: string | null) => void;
  clearSelection: () => void;
  setOrbit: (orbit: { noradId: number; points: OrbitPoint[] } | null) => void;
  setCubesat: (sample: TelemetrySample) => void;
  pushEvent: (level: "info" | "ok" | "warn" | "alert", text: string) => void;
  pushTransmissionSent: (
    t: Omit<Transmission, "id" | "ackAt" | "success" | "failureCode" | "ackBytes">,
  ) => void;
  resolveTransmissionAck: (
    seq: number,
    ack: {
      ackAt: number;
      success: boolean;
      failureCode: number | null;
      ackBytes: Uint8Array;
    },
  ) => void;
};

export const useMissionStore = create<MissionState>((set) => ({
  link: { kind: "idle" },
  tle: null,
  positions: new Map(),
  selectedNoradId: null,
  selectedCubesat: null,
  selectedOrbit: null,
  cubesat: null,
  cubesatLastAt: null,
  events: [
    { ts: Date.now(), level: "ok", text: "boot complete" },
    { ts: Date.now(), level: "info", text: "awaiting tle source" },
  ],
  transmissions: new Map(),
  transmissionOrder: [],
  nextTxId: 1,

  setLink: (link) => set({ link }),
  setTle: (tle) => set({ tle }),
  setPositions: (p) => {
    const map = new Map<number, SatPosition>();
    for (const pos of p) map.set(pos.noradId, pos);
    set({ positions: map });
  },
  /* selectSat(id) selects a real satellite. Selecting one clears any active
   * cubesat selection so they remain mutually exclusive. selectSat(null)
   * only clears the satellite — it does NOT auto-clear the cubesat (use
   * clearSelection for that). */
  selectSat: (id) =>
    set((s) => ({
      selectedNoradId: id,
      selectedOrbit: null,
      selectedCubesat: id !== null ? null : s.selectedCubesat,
    })),
  selectCubesat: (id) =>
    set({ selectedCubesat: id, selectedNoradId: null, selectedOrbit: null }),
  clearSelection: () =>
    set({ selectedNoradId: null, selectedCubesat: null, selectedOrbit: null }),
  setOrbit: (orbit) => set({ selectedOrbit: orbit }),
  setCubesat: (sample) => set({ cubesat: sample, cubesatLastAt: Date.now() }),
  pushEvent: (level, text) =>
    set((s) => ({
      events: [...s.events, { ts: Date.now(), level, text }].slice(-50),
    })),
  pushTransmissionSent: (t) =>
    set((s) => {
      const id = s.nextTxId;
      const next = new Map(s.transmissions);
      next.set(id, {
        id,
        ...t,
        ackAt: null,
        success: null,
        failureCode: null,
        ackBytes: null,
      });
      return {
        transmissions: next,
        transmissionOrder: [...s.transmissionOrder, id].slice(-200),
        nextTxId: id + 1,
      };
    }),
  /* Resolve the most recent unresolved transmission matching this seq.
   * Attacks reuse seqs, so multiple rows can share a seq value. */
  resolveTransmissionAck: (seq, ack) =>
    set((s) => {
      for (let i = s.transmissionOrder.length - 1; i >= 0; i--) {
        const id = s.transmissionOrder[i]!;
        const tx = s.transmissions.get(id);
        if (!tx || tx.seq !== seq || tx.ackAt !== null) continue;
        const next = new Map(s.transmissions);
        next.set(id, { ...tx, ...ack });
        return { transmissions: next };
      }
      return s;
    }),
}));

export function tleEntryById(
  bundle: TleBundle | null,
  id: number,
): TleEntry | undefined {
  return bundle?.entries.find((e) => e.noradId === id);
}
