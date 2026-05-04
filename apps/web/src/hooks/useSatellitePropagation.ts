import { useEffect, useRef } from "react";
import { useMissionStore } from "../store/mission";
import type { WorkerOutMsg } from "../workers/sgp4.worker";

/**
 * Spawns the SGP4 worker, feeds it the TLE bundle from the store,
 * propagates positions every `intervalMs` and pushes them back to the store.
 */
export function useSatellitePropagation(intervalMs = 1000) {
  const tle = useMissionStore((s) => s.tle);
  const setPositions = useMissionStore((s) => s.setPositions);
  const setOrbit = useMissionStore((s) => s.setOrbit);
  const selectedNoradId = useMissionStore((s) => s.selectedNoradId);
  const pushEvent = useMissionStore((s) => s.pushEvent);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const w = new Worker(
      new URL("../workers/sgp4.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = w;

    w.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
      const msg = e.data;
      if (msg.type === "loaded") {
        pushEvent("ok", `sgp4 · ${msg.count} satrec loaded`);
      } else if (msg.type === "positions") {
        setPositions(msg.positions);
      } else if (msg.type === "orbit") {
        setOrbit({ noradId: msg.noradId, points: msg.points });
      }
    };

    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, [setPositions, setOrbit, pushEvent]);

  useEffect(() => {
    if (!tle || !workerRef.current) return;
    workerRef.current.postMessage({ type: "load", entries: tle.entries });
  }, [tle]);

  useEffect(() => {
    const id = window.setInterval(() => {
      workerRef.current?.postMessage({ type: "propagate", epoch: Date.now() });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  useEffect(() => {
    if (selectedNoradId == null) {
      setOrbit(null);
      return;
    }
    workerRef.current?.postMessage({
      type: "orbit",
      noradId: selectedNoradId,
      epoch: Date.now(),
    });
  }, [selectedNoradId, setOrbit]);
}
