// SGP4 propagation worker. Receives a TLE bundle, computes positions
// for all satellites at a given epoch, posts back ECEF lon/lat/alt.
//
// Runs in a dedicated worker thread to keep the main React thread free.

import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
  type SatRec,
} from "satellite.js";
import type { TleEntry } from "@apogee/shared-types";

type WorkerInMsg =
  | { type: "load"; entries: TleEntry[] }
  | { type: "propagate"; epoch: number }
  | { type: "orbit"; noradId: number; epoch: number };

export type SatPosition = {
  noradId: number;
  name: string;
  /** WGS84 longitude in degrees (-180..180) */
  lon: number;
  /** WGS84 latitude in degrees (-90..90) */
  lat: number;
  /** Altitude above ellipsoid in meters */
  alt: number;
};

export type OrbitPoint = { lon: number; lat: number; alt: number };

export type WorkerOutMsg =
  | { type: "loaded"; count: number }
  | { type: "positions"; epoch: number; positions: SatPosition[] }
  | { type: "orbit"; noradId: number; points: OrbitPoint[] };

const records: Array<{ noradId: number; name: string; rec: SatRec }> = [];

self.onmessage = (e: MessageEvent<WorkerInMsg>) => {
  const msg = e.data;
  if (msg.type === "load") {
    records.length = 0;
    for (const entry of msg.entries) {
      try {
        const rec = twoline2satrec(entry.line1, entry.line2);
        records.push({ noradId: entry.noradId, name: entry.name, rec });
      } catch {
        // skip malformed
      }
    }
    const out: WorkerOutMsg = { type: "loaded", count: records.length };
    (self as DedicatedWorkerGlobalScope).postMessage(out);
    return;
  }

  if (msg.type === "propagate") {
    const date = new Date(msg.epoch);
    const gmst = gstime(date);
    const positions: SatPosition[] = [];
    for (const r of records) {
      const result = propagate(r.rec, date);
      if (!result.position || typeof result.position === "boolean") continue;
      const geo = eciToGeodetic(result.position, gmst);
      positions.push({
        noradId: r.noradId,
        name: r.name,
        lon: degreesLong(geo.longitude),
        lat: degreesLat(geo.latitude),
        alt: geo.height * 1000,
      });
    }
    const out: WorkerOutMsg = {
      type: "positions",
      epoch: msg.epoch,
      positions,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(out);
    return;
  }

  if (msg.type === "orbit") {
    const r = records.find((x) => x.noradId === msg.noradId);
    if (!r) return;

    // Mean motion in revs/day → orbital period in seconds.
    const meanMotion = r.rec.no * (1440 / (2 * Math.PI));
    const periodSec = meanMotion > 0 ? 86400 / meanMotion : 5400;
    const samples = 90;
    const step = (periodSec * 1000) / samples;
    const points: OrbitPoint[] = [];
    for (let i = 0; i <= samples; i++) {
      const date = new Date(msg.epoch + i * step);
      const result = propagate(r.rec, date);
      if (!result.position || typeof result.position === "boolean") continue;
      const geo = eciToGeodetic(result.position, gstime(date));
      points.push({
        lon: degreesLong(geo.longitude),
        lat: degreesLat(geo.latitude),
        alt: geo.height * 1000,
      });
    }
    const out: WorkerOutMsg = {
      type: "orbit",
      noradId: msg.noradId,
      points,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(out);
  }
};
