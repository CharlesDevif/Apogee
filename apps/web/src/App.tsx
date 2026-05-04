import { useCallback, useEffect, useState } from "react";
import { Viewer, type CesiumComponentRef } from "resium";
import {
  Cartesian3,
  Color,
  Math as CesiumMath,
  Viewer as CesiumViewer,
  Ion,
} from "cesium";
import {
  Bracket,
  CornerFrame,
  Crosshair,
  Module,
  Readout,
  Strip,
} from "./components/Hud";
import { useMissionStore, tleEntryById } from "./store/mission";
import { connect } from "./lib/ws";
import { useSatellitePropagation } from "./hooks/useSatellitePropagation";
import { useFreeFly } from "./hooks/useFreeFly";
import { useUtcClock } from "./hooks/useUtcClock";
import { SatelliteLayer } from "./features/satellites/SatelliteLayer";
import { OrbitLayer } from "./features/satellites/OrbitLayer";
import { CubeSatLayer } from "./features/cubesat/CubeSatLayer";
import { TrackBar } from "./features/track/TrackBar";
import { CommandConsole } from "./features/console/CommandConsole";

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (ionToken) Ion.defaultAccessToken = ionToken;

function fmtUtc(d: Date) {
  return d.toISOString().replace("T", " · ").replace("Z", "Z");
}
function fmtDoy(d: Date) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - start) / 86_400_000);
  return `${d.getUTCFullYear()}/${String(doy).padStart(3, "0")}`;
}

function eventLevelClass(level: "info" | "ok" | "warn" | "alert"): string {
  switch (level) {
    case "ok":
      return "jade";
    case "warn":
      return "phosphor";
    case "alert":
      return "alert-glow";
    default:
      return "text-ink/80";
  }
}

export default function App() {
  const now = useUtcClock();
  const [viewerInstance, setViewerInstance] = useState<CesiumViewer | null>(
    null,
  );

  const link = useMissionStore((s) => s.link);
  const tle = useMissionStore((s) => s.tle);
  const positions = useMissionStore((s) => s.positions);
  const selectedId = useMissionStore((s) => s.selectedNoradId);
  const cubesat = useMissionStore((s) => s.cubesat);
  const events = useMissionStore((s) => s.events);

  useEffect(() => {
    connect();
  }, []);
  useSatellitePropagation(1000);
  useFreeFly(viewerInstance);

  const viewerRefCallback = useCallback(
    (node: CesiumComponentRef<CesiumViewer> | null) => {
      const v = node?.cesiumElement;
      if (v && !v.isDestroyed()) setViewerInstance(v);
    },
    [],
  );

  useEffect(() => {
    const viewer = viewerInstance;
    if (!viewer) return;

    const { scene } = viewer;
    scene.globe.enableLighting = true;
    scene.globe.baseColor = Color.fromCssColorString("#04070a");
    scene.backgroundColor = Color.fromCssColorString("#04070a");

    if (scene.skyBox) scene.skyBox.show = true;
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.brightnessShift = 0.15;
      scene.skyAtmosphere.saturationShift = -0.1;
    }
    scene.fog.enabled = true;
    scene.fog.density = 1e-4;

    const bloom = scene.postProcessStages.bloom;
    bloom.enabled = true;
    const u = bloom.uniforms as Record<string, number>;
    u.contrast = 128;
    u.brightness = -0.3;
    u.glowOnly = 0;
    u.delta = 1;
    u.sigma = 3.78;
    u.stepSize = 5;

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(2.0, 46.0, 22_000_000),
      orientation: {
        heading: 0,
        pitch: -CesiumMath.PI_OVER_TWO,
        roll: 0,
      },
    });
  }, [viewerInstance]);

  const selectedEntry = selectedId ? tleEntryById(tle, selectedId) : undefined;
  const selectedPos = selectedId ? positions.get(selectedId) : undefined;

  const linkValue =
    link.kind === "open"
      ? "NOMINAL"
      : link.kind === "connecting"
        ? "..."
        : link.kind === "closed"
          ? "OFFLINE"
          : "IDLE";
  const linkState =
    link.kind === "open" ? "ok" : link.kind === "closed" ? "down" : "idle";
  const linkHint =
    link.kind === "open"
      ? `since ${new Date(link.since).toLocaleTimeString()}`
      : "ws · :3001/ws";

  const tleHint = tle
    ? `${tle.entries.length} entries · age ${Math.floor((Date.now() - tle.fetchedAt) / 1000)}s`
    : "celestrak · pending";
  const tleValue = tle ? "LOADED" : "WAITING";
  const tleStateOk: "ok" | "idle" = tle ? "ok" : "idle";

  const trackingValue = selectedEntry?.name ?? "—";
  const utc = fmtUtc(now);
  const doy = fmtDoy(now);

  return (
    <div className="relative h-screen w-screen overflow-hidden scanlines grain vignette">
      <Viewer
        ref={viewerRefCallback}
        full
        animation={false}
        timeline={false}
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
      />

      <SatelliteLayer viewer={viewerInstance} />
      <OrbitLayer viewer={viewerInstance} />
      <CubeSatLayer viewer={viewerInstance} />
      <TrackBar viewer={viewerInstance} />
      <Crosshair />
      <CornerFrame />
      <CommandConsole />

      <header className="pointer-events-none absolute top-0 left-0 right-0 px-6 pt-4 z-[60]">
        <div className="flex items-start justify-between gap-8">
          <div className="boot-1 pointer-events-auto">
            <div className="flex items-center gap-3">
              <span className="text-phosphor font-display text-[28px] leading-none tracking-[0.18em]">
                APOGÉE
              </span>
              <span className="text-dim text-[10px] tracking-[0.3em]">
                / MISSION CONTROL
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[9px] tracking-[0.32em] text-dim uppercase">
              <span>STA · BSN-01</span>
              <span className="text-deep">·</span>
              <span>43.343°N 003.420°E</span>
              <span className="text-deep">·</span>
              <span className="jade">PHASE 1 · TRACKING</span>
            </div>
          </div>

          <div className="boot-2 panel px-4 py-2 flex items-center gap-5 text-[10px] tracking-[0.25em] uppercase">
            <span className="text-dim">UTC</span>
            <span className="phosphor tnum text-[13px] tracking-[0.18em]">
              {utc}
            </span>
            <span className="text-dim">DOY</span>
            <span className="text-ink tnum">{doy}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-phosphor animate-pulseDot ml-2" />
          </div>

          <div className="boot-3 text-right">
            <div className="text-dim text-[9px] tracking-[0.32em]">
              BUILD · v0.1.0 / TRACKING
            </div>
            <div className="mt-1 text-ghost text-[11px] text-jadeDim tracking-[0.2em]">
              ~/apogee · charles@bsn
            </div>
          </div>
        </div>
        <div className="dashed-h mt-4" />
      </header>

      <aside className="pointer-events-auto absolute left-6 top-28 z-[60] w-[220px] flex flex-col gap-2">
        <Strip>
          <span className="text-phosphor">[</span>
          <span>SEGMENT SOL</span>
          <span className="text-phosphor flex-1 text-right">]</span>
        </Strip>

        <Module
          index={2}
          label="Backend Link"
          value={linkValue}
          state={linkState}
          hint={linkHint}
        />
        <Module
          index={3}
          label="TLE Source"
          value={tleValue}
          state={tleStateOk}
          hint={tleHint}
        />
        <Module
          index={4}
          label="Satellites"
          value={`${positions.size} TRACKED`}
          state={positions.size > 0 ? "ok" : "idle"}
          hint={tle ? `from ${tle.entries.length} TLE` : "—"}
        />
        <Module
          index={5}
          label="Auth · HMAC"
          value="DISARMED"
          state="warn"
          hint="phase 3 · v2"
        />

        <div className="mt-3 panel px-3 py-2 boot-6">
          <div className="text-[9px] tracking-[0.3em] text-dim uppercase mb-2">
            Free-Fly · Camera
          </div>
          <div className="text-[9px] tracking-[0.2em] text-ink/80 space-y-0.5">
            <div>
              <span className="phosphor">W/S</span>{" "}
              <span className="text-dim">·</span> forward/back
            </div>
            <div>
              <span className="phosphor">A/D</span>{" "}
              <span className="text-dim">·</span> strafe
            </div>
            <div>
              <span className="phosphor">SPACE/SHIFT</span>{" "}
              <span className="text-dim">·</span> up/down
            </div>
            <div>
              <span className="phosphor">Q/E</span>{" "}
              <span className="text-dim">·</span> roll
            </div>
            <div>
              <span className="phosphor">DRAG</span>{" "}
              <span className="text-dim">·</span> orbit
            </div>
          </div>
        </div>
      </aside>

      <aside className="pointer-events-auto absolute right-6 top-28 z-[60] w-[260px] flex flex-col gap-2">
        <Strip>
          <span className="text-phosphor">[</span>
          <span>
            {selectedId
              ? "TRACKING TARGET"
              : cubesat
                ? "APOGÉE-1 · LIVE"
                : "BEACON · 0xAB1E"}
          </span>
          <span className="text-phosphor flex-1 text-right">]</span>
        </Strip>

        <Bracket className="panel px-4 py-3 boot-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] tracking-[0.3em] text-dim uppercase">
              {selectedEntry ? "Target" : "Mode"}
            </span>
            <span className="font-display text-phosphor text-[15px] tracking-[0.18em] truncate max-w-[160px]">
              {selectedEntry ? trackingValue : "IDLE"}
            </span>
          </div>
          <div className="mt-3">
            {selectedEntry ? (
              <>
                <Readout k="NORAD" v={selectedEntry.noradId} />
                <Readout k="Group" v={selectedEntry.group.toUpperCase()} />
                <Readout
                  k="Lat"
                  v={selectedPos ? selectedPos.lat.toFixed(3) : "—"}
                  unit="°"
                />
                <Readout
                  k="Lon"
                  v={selectedPos ? selectedPos.lon.toFixed(3) : "—"}
                  unit="°"
                />
                <Readout
                  k="Alt"
                  v={selectedPos ? (selectedPos.alt / 1000).toFixed(1) : "—"}
                  unit="km"
                />
              </>
            ) : cubesat ? (
              <>
                <Readout k="Mode" v={cubesat.mode} />
                <Readout
                  k="Battery"
                  v={cubesat.battery_v.toFixed(2)}
                  unit="V"
                  warn={cubesat.battery_v < 7.0}
                />
                <Readout
                  k="Roll"
                  v={cubesat.attitude_deg.roll.toFixed(1)}
                  unit="°"
                />
                <Readout
                  k="Pitch"
                  v={cubesat.attitude_deg.pitch.toFixed(1)}
                  unit="°"
                />
                <Readout
                  k="Yaw"
                  v={cubesat.attitude_deg.yaw.toFixed(1)}
                  unit="°"
                />
                <Readout k="Lat" v={cubesat.lat.toFixed(3)} unit="°" />
                <Readout k="Lon" v={cubesat.lon.toFixed(3)} unit="°" />
                <Readout
                  k="Alt"
                  v={(cubesat.alt_m / 1000).toFixed(1)}
                  unit="km"
                />
              </>
            ) : (
              <>
                <Readout k="Tick" v="—" />
                <Readout k="Battery" v="—" unit="V" />
                <Readout k="Roll · Pitch · Yaw" v="—" unit="°" />
                <Readout k="Lat" v="—" unit="°" />
                <Readout k="Lon" v="—" unit="°" />
                <Readout k="Alt" v="—" unit="km" />
              </>
            )}
          </div>
          <div className="mt-3 text-[8px] tracking-[0.3em] text-dim uppercase">
            {selectedEntry
              ? "live sgp4 · 1 hz"
              : cubesat
                ? "live firmware · ~5 hz"
                : "click a satellite or boot the firmware"}
          </div>
        </Bracket>

        <Bracket className="panel px-4 py-3 boot-5">
          <div className="text-[9px] tracking-[0.3em] text-dim uppercase mb-2">
            Event log
          </div>
          <div className="text-[10px] leading-relaxed space-y-1 tnum max-h-[220px] overflow-y-auto">
            {events.slice(-10).map((e, i) => {
              const t = ((e.ts - events[0].ts) / 1000).toFixed(2);
              return (
                <div key={`${e.ts}-${i}`}>
                  <span className="text-dim">[T+{t}]</span>{" "}
                  <span className={eventLevelClass(e.level)}>{e.text}</span>
                </div>
              );
            })}
            <div className="text-dim">
              <span className="phosphor">awaiting operator command_</span>
              <span className="inline-block w-2 h-3 ml-0.5 bg-phosphor align-middle animate-blink" />
            </div>
          </div>
        </Bracket>
      </aside>

      <footer className="pointer-events-none absolute bottom-0 left-0 right-0 px-6 pb-3 z-[60]">
        <div className="dashed-h mb-2" />
        <div className="flex items-center justify-between text-[9px] tracking-[0.3em] uppercase">
          <div className="flex items-center gap-4 boot-6">
            <span className="text-dim">CHANNEL</span>
            <span className="phosphor">α-1</span>
            <span className="text-deep">|</span>
            <span className="text-dim">PROTO</span>
            <span className="text-ink">UDP/40B</span>
            <span className="text-deep">|</span>
            <span className="text-dim">CRC</span>
            <span className="text-ink">CCITT-16</span>
          </div>

          <div className="flex items-center gap-3 boot-6">
            <span className="text-dim">SEGMENT</span>
            <span className="text-ink">CHARLES @ BESSAN · 34</span>
            <span
              className={`h-1.5 w-1.5 rounded-full ml-2 ${
                link.kind === "open"
                  ? "bg-jade shadow-[0_0_8px_#7dffb1]"
                  : "bg-alert shadow-[0_0_8px_#ff4d3d]"
              }`}
            />
          </div>

          <div className="flex items-center gap-4 boot-6">
            <span className="text-dim">SATS</span>
            <span className="phosphor tnum">
              {String(positions.size).padStart(3, "0")}
            </span>
            <span className="text-deep">|</span>
            <span className="text-dim">EVT</span>
            <span className="text-ink tnum">
              {String(events.length).padStart(3, "0")}
            </span>
            <span className="text-deep">|</span>
            <span className="text-dim">ALERT</span>
            <span className="phosphor tnum">000</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
