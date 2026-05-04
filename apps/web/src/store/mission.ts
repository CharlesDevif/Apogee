import { create } from "zustand";
import type { TelemetrySample, TleEntry, TleBundle } from "@apogee/shared-types";
import type { OrbitPoint, SatPosition } from "../workers/sgp4.worker";

export type LinkState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "open"; since: number }
  | { kind: "closed"; lastError?: string };

type MissionState = {
  link: LinkState;
  tle: TleBundle | null;
  positions: Map<number, SatPosition>;
  selectedNoradId: number | null;
  selectedOrbit: { noradId: number; points: OrbitPoint[] } | null;
  cubesat: TelemetrySample | null;
  cubesatLastAt: number | null;
  events: Array<{ ts: number; level: "info" | "ok" | "warn" | "alert"; text: string }>;

  setLink: (s: LinkState) => void;
  setTle: (b: TleBundle) => void;
  setPositions: (p: SatPosition[]) => void;
  selectSat: (id: number | null) => void;
  setOrbit: (orbit: { noradId: number; points: OrbitPoint[] } | null) => void;
  setCubesat: (sample: TelemetrySample) => void;
  pushEvent: (level: "info" | "ok" | "warn" | "alert", text: string) => void;
};

export const useMissionStore = create<MissionState>((set) => ({
  link: { kind: "idle" },
  tle: null,
  positions: new Map(),
  selectedNoradId: null,
  selectedOrbit: null,
  cubesat: null,
  cubesatLastAt: null,
  events: [
    { ts: Date.now(), level: "ok", text: "boot complete" },
    { ts: Date.now(), level: "info", text: "awaiting tle source" },
  ],

  setLink: (link) => set({ link }),
  setTle: (tle) => set({ tle }),
  setPositions: (p) => {
    const map = new Map<number, SatPosition>();
    for (const pos of p) map.set(pos.noradId, pos);
    set({ positions: map });
  },
  selectSat: (id) => set({ selectedNoradId: id, selectedOrbit: null }),
  setOrbit: (orbit) => set({ selectedOrbit: orbit }),
  setCubesat: (sample) => set({ cubesat: sample, cubesatLastAt: Date.now() }),
  pushEvent: (level, text) =>
    set((s) => ({
      events: [...s.events, { ts: Date.now(), level, text }].slice(-50),
    })),
}));

export function tleEntryById(
  bundle: TleBundle | null,
  id: number,
): TleEntry | undefined {
  return bundle?.entries.find((e) => e.noradId === id);
}
