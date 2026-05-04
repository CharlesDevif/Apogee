import { useEffect, useMemo, useRef, useState } from "react";
import {
  BoundingSphere,
  Cartesian3,
  HeadingPitchRange,
  JulianDate,
  Math as CesiumMath,
  type Viewer as CesiumViewer,
} from "cesium";
import { useMissionStore } from "../../store/mission";

type Target = { id: number; name: string; subtitle: string };

function flyToTarget(
  viewer: CesiumViewer,
  target: Target,
  pushEvent: (level: "info" | "ok" | "warn" | "alert", text: string) => void,
) {
  const id = `sat-${target.id}`;
  const entity = viewer.entities.getById(id);
  if (!entity) {
    pushEvent("alert", `entity ${id} not found`);
    return;
  }
  const now = JulianDate.now();
  const center = entity.position?.getValue(now, new Cartesian3());
  if (!center) return;
  const sphere = new BoundingSphere(center, 5_000);
  viewer.camera.flyToBoundingSphere(sphere, {
    duration: 2.5,
    offset: new HeadingPitchRange(0, CesiumMath.toRadians(-15), 1_500_000),
  });
}

export function TrackBar({ viewer }: { viewer: CesiumViewer | null }) {
  const tle = useMissionStore((s) => s.tle);
  const selectSat = useMissionStore((s) => s.selectSat);
  const pushEvent = useMissionStore((s) => s.pushEvent);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 10);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const allTargets = useMemo<Target[]>(
    () =>
      (tle?.entries ?? []).map((e) => ({
        id: e.noradId,
        name: e.name,
        subtitle: `NORAD ${e.noradId} · ${e.group.toUpperCase()}`,
      })),
    [tle],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTargets.slice(0, 12);
    return allTargets
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [allTargets, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const select = (t: Target) => {
    if (!viewer) return;
    selectSat(t.id);
    pushEvent("ok", `tracking · ${t.name}`);
    flyToTarget(viewer, t, pushEvent);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-[65] panel px-3 py-1.5 flex items-center gap-3 hover:border-phosphor/50 transition-colors boot-2"
        >
          <span className="text-phosphor text-[10px] tracking-[0.3em]">[</span>
          <span className="text-dim text-[10px] tracking-[0.3em] uppercase">
            TRACK &gt;
          </span>
          <span className="text-ink/70 text-[10px] tracking-[0.2em] min-w-[140px] text-left">
            {query || "search satellite..."}
          </span>
          <kbd className="text-[9px] tracking-[0.2em] text-dim border border-border px-1.5 py-0.5">
            /
          </kbd>
          <span className="text-phosphor text-[10px] tracking-[0.3em]">]</span>
        </button>
      )}

      {open && (
        <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-[70] w-[480px]">
          <div className="panel border-phosphor/60">
            <div className="flex items-center px-3 py-2 border-b border-border">
              <span className="text-phosphor text-[11px] tracking-[0.3em] mr-3">
                TRACK &gt;
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlight((h) => Math.min(h + 1, matches.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight((h) => Math.max(h - 1, 0));
                  }
                  if (e.key === "Enter" && matches[highlight]) {
                    select(matches[highlight]);
                  }
                }}
                placeholder="ISS · HUBBLE · STARLINK..."
                className="flex-1 bg-transparent outline-none text-ink text-[12px] tracking-[0.15em] placeholder:text-dim"
              />
              <kbd className="text-[9px] tracking-[0.2em] text-dim border border-border px-1.5 py-0.5 ml-2">
                ESC
              </kbd>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {matches.length === 0 && (
                <div className="px-3 py-4 text-[10px] tracking-[0.2em] text-dim uppercase text-center">
                  no match
                </div>
              )}
              {matches.map((t, i) => {
                const isHighlight = i === highlight;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => select(t)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between border-b border-border/40 last:border-b-0 ${
                      isHighlight ? "bg-phosphor/10" : ""
                    }`}
                  >
                    <div>
                      <div
                        className={`text-[11px] tracking-[0.18em] ${
                          isHighlight ? "phosphor" : "text-ink"
                        }`}
                      >
                        {t.name}
                      </div>
                      <div className="text-[9px] tracking-[0.25em] text-dim mt-0.5">
                        {t.subtitle}
                      </div>
                    </div>
                    <span className="text-[9px] tracking-[0.3em] text-dim">
                      ORBIT
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-1.5 border-t border-border flex items-center justify-between text-[8px] tracking-[0.3em] text-dim uppercase">
              <span>↑↓ navigate · ⏎ track</span>
              <span>{matches.length} results</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
