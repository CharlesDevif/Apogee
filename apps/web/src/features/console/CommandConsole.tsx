import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useMissionStore, type Transmission } from "../../store/mission";
import { sendCommand } from "../../lib/ws";
import { complete, parse, VOCAB } from "./parser";
import { PacketInspector } from "./PacketInspector";

/* PUS-mapped failure codes (mirror of firmware CommandOutcome enum). */
const FAILURE_LABEL: Record<number, string> = {
  2: "BAD_PACKET",
  3: "WRONG_TYPE",
  4: "WRONG_APID",
  5: "BAD_CRC",
  6: "BAD_PUS",
  7: "UNKNOWN_SVC",
  8: "REJECTED",
  9: "BAD_PAYLOAD",
};

const REBOOT_ARM_MS = 2000;

type Filter = "ALL" | "OK" | "FAIL" | "PENDING";

type Status = "pending" | "ok" | "fail";

function statusOf(t: Transmission): Status {
  if (t.success === true) return "ok";
  if (t.success === false) return "fail";
  return "pending";
}

function formatUtc(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function CommandConsole() {
  const targetId = useMissionStore((s) => s.selectedCubesat);
  const transmissions = useMissionStore((s) => s.transmissions);
  const order = useMissionStore((s) => s.transmissionOrder);
  const link = useMissionStore((s) => s.link);
  const cubesat = useMissionStore((s) => s.cubesat);
  const cubesatLastAt = useMissionStore((s) => s.cubesatLastAt);
  const clearSelection = useMissionStore((s) => s.clearSelection);

  const linkOpen = link.kind === "open";

  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "info" | "alert"; text: string } | null>(null);
  const [hiddenBefore, setHiddenBefore] = useState<number>(-1);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [armedDeadline, setArmedDeadline] = useState<number | null>(null);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
  const [inspectorView, setInspectorView] = useState<"tc" | "ack">("tc");
  const [, forceTick] = useState(0);

  /* Console height — resizable via top handle, persisted across sessions. */
  const [consoleHeight, setConsoleHeight] = useState<number>(() => {
    if (typeof window === "undefined") return 380;
    const saved = window.localStorage.getItem("apogee.console.height");
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= 240 && n <= 900 ? n : 380;
  });
  const resizeStartRef = useRef<{ startY: number; startH: number } | null>(null);

  /* 1Hz tick so "LAST TM" age advances even when no new TM lands. */
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const visibleSeqs = useMemo(
    () => order.filter((s) => s > hiddenBefore),
    [order, hiddenBefore],
  );

  const filteredSeqs = useMemo(() => {
    if (filter === "ALL") return visibleSeqs;
    return visibleSeqs.filter((seq) => {
      const t = transmissions.get(seq);
      if (!t) return false;
      const s = statusOf(t);
      if (filter === "OK") return s === "ok";
      if (filter === "FAIL") return s === "fail";
      return s === "pending";
    });
  }, [visibleSeqs, filter, transmissions]);

  const counts = useMemo(() => {
    let sent = 0, ok = 0, fail = 0, pending = 0, lastLat = 0;
    for (const seq of visibleSeqs) {
      const t = transmissions.get(seq);
      if (!t) continue;
      sent++;
      const s = statusOf(t);
      if (s === "ok") {
        ok++;
        if (t.ackAt !== null) lastLat = t.ackAt - t.sentAt;
      } else if (s === "fail") fail++;
      else pending++;
    }
    return { sent, ok, fail, pending, lastLat };
  }, [transmissions, visibleSeqs]);

  /* Pin the log to the bottom whenever something changes. */
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transmissions, filteredSeqs.length]);

  /* Transient feedback fades after 2s. */
  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(id);
  }, [feedback]);

  /* Disarm REBOOT if the operator doesn't confirm in time. */
  useEffect(() => {
    if (armedDeadline === null) return;
    const left = armedDeadline - Date.now();
    if (left <= 0) {
      setArmedDeadline(null);
      setFeedback({ tone: "info", text: "reboot · arm expired" });
      return;
    }
    const id = window.setTimeout(() => {
      setArmedDeadline(null);
      setFeedback({ tone: "info", text: "reboot · arm expired" });
    }, left);
    return () => window.clearTimeout(id);
  }, [armedDeadline]);

  /* Resize handlers — pointer events for both mouse and touch. */
  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    resizeStartRef.current = { startY: e.clientY, startH: consoleHeight };
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const ref = resizeStartRef.current;
    if (!ref) return;
    /* Console grows upward, so dragging up (negative dy) increases height.
     * Cap so we always leave ~140px clear at the top for the header band. */
    const maxH = Math.max(280, window.innerHeight - 140);
    const next = Math.max(240, Math.min(maxH, ref.startH - (e.clientY - ref.startY)));
    setConsoleHeight(next);
  }
  function onResizeEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeStartRef.current) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    resizeStartRef.current = null;
    window.localStorage.setItem("apogee.console.height", String(Math.round(consoleHeight)));
  }

  /* Auto-focus the input when the console is first opened on a target. */
  useEffect(() => {
    if (!targetId) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [targetId]);


  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  function submit() {
    const result = parse(input);
    if (!result) return;
    if (result.kind === "error") {
      setFeedback({ tone: "alert", text: result.message });
      return;
    }
    if (result.kind === "local") {
      if (result.action === "clear") {
        const last = order.length > 0 ? order[order.length - 1]! : -1;
        setHiddenBefore(last);
      } else if (result.action === "help") {
        setFeedback({
          tone: "info",
          text: "ping · safe · nominal · fault · comms · reboot · clear",
        });
      }
      pushHistory();
      reset();
      return;
    }
    if (!linkOpen) {
      setFeedback({ tone: "alert", text: "link offline · command not sent" });
      return;
    }

    /* Two-step confirmation for destructive commands. */
    if (result.request.command === "REBOOT") {
      if (armedDeadline === null || Date.now() > armedDeadline) {
        setArmedDeadline(Date.now() + REBOOT_ARM_MS);
        setFeedback({
          tone: "alert",
          text: `reboot armed · press ⏎ within ${REBOOT_ARM_MS / 1000}s to execute`,
        });
        /* Keep the input populated so a second Enter re-fires through here. */
        return;
      }
      /* Confirmed. Fall through to send and clear arm. */
      setArmedDeadline(null);
    }

    const sent = sendCommand(result.request);
    if (!sent) {
      setFeedback({ tone: "alert", text: "send failed · ws not ready" });
      return;
    }
    pushHistory();
    reset();
  }

  function pushHistory() {
    setHistory((h) => [...h, input.trim()].slice(-50));
  }
  function reset() {
    setInput("");
    setHistoryIdx(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = historyIdx === null
        ? history.length - 1
        : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setInput(history[next] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === null) return;
      const next = historyIdx + 1;
      if (next >= history.length) {
        setHistoryIdx(null);
        setInput("");
      } else {
        setHistoryIdx(next);
        setInput(history[next] ?? "");
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const head = input.split(/\s+/)[0] ?? "";
      const completion = complete(head);
      if (completion) {
        setInput(
          completion + (input.includes(" ") ? input.slice(head.length) : ""),
        );
      }
      return;
    }
    if (e.key === "Escape") {
      if (input.length === 0 && armedDeadline === null && !feedback) {
        clearSelection();
        return;
      }
      reset();
      setArmedDeadline(null);
      setFeedback(null);
    }
  }

  /* ----- State strip data ----- */
  const mode = cubesat?.mode ?? null;
  const modeColor =
    mode === "NOMINAL"
      ? "jade"
      : mode === "FAULT"
        ? "alert-glow"
        : mode === "SAFE" || mode === "COMMS" || mode === "BOOT"
          ? "phosphor"
          : "text-dim";
  const battery = cubesat?.battery_v;
  const batteryColor =
    battery === undefined
      ? "text-dim"
      : battery >= 7.0
        ? "jade"
        : battery >= 6.5
          ? "phosphor"
          : "alert-glow";
  const tmAgeSec = cubesatLastAt ? (Date.now() - cubesatLastAt) / 1000 : null;
  const tmStatus =
    tmAgeSec === null
      ? { label: "OFFLINE", tone: "text-dim" }
      : tmAgeSec < 1
        ? { label: `${tmAgeSec.toFixed(1)}s`, tone: "jade" }
        : tmAgeSec < 3
          ? { label: `${tmAgeSec.toFixed(1)}s`, tone: "phosphor" }
          : { label: `STALE ${tmAgeSec.toFixed(0)}s`, tone: "alert-glow" };

  /* ----- Render ----- */
  if (!targetId) return null;

  return (
    <section
      onClick={focusInput}
      className="pointer-events-auto absolute left-6 right-6 bottom-12 z-[70] boot-6 cursor-text"
      style={{ height: `${consoleHeight}px` }}
      aria-label="Operator console"
    >
      {/* Resize handle — drag up/down to grow/shrink. */}
      <div
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onClick={(e) => e.stopPropagation()}
        className="group absolute -top-1.5 left-0 right-0 h-3 cursor-ns-resize z-10"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize console"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <span className="block h-px w-8 bg-border group-hover:bg-phosphor/80 transition-colors" />
          <span className="block h-1 w-1 bg-border group-hover:bg-phosphor transition-colors" />
          <span className="block h-px w-8 bg-border group-hover:bg-phosphor/80 transition-colors" />
        </div>
      </div>

      <div className="bracket panel h-full flex flex-col">
        {/* ────────────────── Target bar ────────────────── */}
        <div className="flex items-center justify-between border-b border-border bg-rail/40 px-4 py-1.5 shrink-0">
          <div className="flex items-baseline gap-3">
            <span className="text-[9px] tracking-[0.3em] text-dim uppercase">
              TARGET
            </span>
            <span className="font-display text-phosphor text-[14px] tracking-[0.18em]">
              {targetId}
            </span>
            <span className="text-[9px] tracking-[0.3em] text-dim uppercase">
              · COMMANDABLE · CCSDS PUS-C
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearSelection();
            }}
            className="text-[9px] tracking-[0.3em] text-dim hover:text-ink uppercase"
            aria-label="Deselect target"
          >
            ✕ DESELECT
            <span className="text-deep ml-2">·</span>
            <span className="ml-2">ESC</span>
          </button>
        </div>

        {/* ────────────────── State strip ────────────────── */}
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.6fr] gap-0 border-b border-border shrink-0">
          <StateCell label="MODE" big>
            <span className={`font-display text-[20px] tracking-[0.18em] ${modeColor}`}>
              {mode ?? "OFFLINE"}
            </span>
          </StateCell>
          <StateCell label="BATTERY">
            <span className={`text-[16px] tnum ${batteryColor}`}>
              {battery !== undefined ? battery.toFixed(2) : "—"}
              <span className="text-[10px] text-dim ml-1 tracking-widest">V</span>
            </span>
          </StateCell>
          <StateCell label="LAST TM">
            <span className={`text-[14px] tnum tracking-widest ${tmStatus.tone}`}>
              {tmStatus.label}
            </span>
          </StateCell>
          <StateCell label="LINK">
            <span
              className={`text-[14px] tracking-[0.25em] ${linkOpen ? "jade" : "alert-glow"}`}
            >
              {linkOpen ? "OPEN" : link.kind === "connecting" ? "..." : "DOWN"}
            </span>
          </StateCell>
          <StateCell label="TC OK · FAIL · PEND · LAT">
            <div className="flex items-center gap-2 text-[14px] tnum">
              <span className="jade">{String(counts.ok).padStart(2, "0")}</span>
              <span className="text-deep">·</span>
              <span className={counts.fail > 0 ? "alert-glow" : "text-dim"}>
                {String(counts.fail).padStart(2, "0")}
              </span>
              <span className="text-deep">·</span>
              <span className={counts.pending > 0 ? "phosphor" : "text-dim"}>
                {String(counts.pending).padStart(2, "0")}
              </span>
              <span className="text-deep ml-2">·</span>
              <span className="text-ink">
                {counts.lastLat > 0 ? `${counts.lastLat}ms` : "—"}
              </span>
            </div>
          </StateCell>
        </div>

        {/* ────────────────── Filter chips ────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 text-[9px] tracking-[0.3em] uppercase">
            <span className="text-phosphor">[</span>
            <span className="text-dim">CMD LOG</span>
            <span className="text-phosphor">]</span>
            <span className="text-deep">·</span>
            {(["ALL", "OK", "FAIL", "PENDING"] as Filter[]).map((f, i) => (
              <span key={f} className="contents">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilter(f);
                  }}
                  className={`uppercase tracking-[0.3em] cursor-pointer ${
                    filter === f
                      ? f === "OK"
                        ? "jade"
                        : f === "FAIL"
                          ? "alert-glow"
                          : f === "PENDING"
                            ? "phosphor"
                            : "text-ink"
                      : "text-dim hover:text-ink"
                  }`}
                >
                  {f}
                </button>
                {i < 3 ? <span className="text-deep">·</span> : null}
              </span>
            ))}
          </div>
          <div className="text-[9px] tracking-[0.3em] uppercase text-dim tnum">
            {filteredSeqs.length} / {visibleSeqs.length} ENTRIES
          </div>
        </div>

        {/* ────────────────── Log ────────────────── */}
        <div
          ref={logRef}
          className="flex-1 min-h-0 text-[11px] leading-[1.55] tnum overflow-y-auto"
          aria-live="polite"
        >
          {filteredSeqs.length === 0 ? (
            <div className="px-4 py-3 text-dim italic">
              {visibleSeqs.length === 0
                ? "no transmissions yet · type help to list commands"
                : `no entries match filter ${filter}`}
            </div>
          ) : (
            filteredSeqs.map((seq) => {
              const t = transmissions.get(seq);
              if (!t) return null;
              const expanded = expandedSeq === seq;
              return (
                <div key={seq}>
                  <LogRow
                    t={t}
                    expanded={expanded}
                    onToggle={() => {
                      if (expanded) {
                        setExpandedSeq(null);
                      } else {
                        setExpandedSeq(seq);
                        setInspectorView("tc");
                      }
                    }}
                  />
                  {expanded ? (
                    <InspectorPanel
                      t={t}
                      view={inspectorView}
                      onChangeView={setInspectorView}
                      onClose={() => setExpandedSeq(null)}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* ────────────────── Input ────────────────── */}
        <div
          className={`border-t flex items-center gap-3 px-4 py-2.5 shrink-0 ${
            armedDeadline !== null ? "border-alert/60" : "border-border"
          }`}
        >
          <span
            className={`text-[14px] leading-none select-none ${
              armedDeadline !== null ? "alert-glow" : "phosphor"
            }`}
          >
            ▶
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder={linkOpen ? "type a command…" : "link offline"}
            className="flex-1 bg-transparent border-0 outline-none text-[13px] text-ink placeholder:text-dim/60 caret-phosphor"
            aria-label="Command input"
          />
          {armedDeadline !== null ? (
            <span className="alert-glow text-[10px] tracking-[0.3em] uppercase animate-pulseDot">
              ◆ ARMED
            </span>
          ) : null}
          <span className="inline-block w-2 h-3 bg-phosphor align-middle animate-blink" />
        </div>

        {/* ────────────────── Vocab + hotkeys ────────────────── */}
        <div className="flex items-center justify-between gap-4 px-4 pb-2 text-[9px] tracking-[0.25em] uppercase shrink-0">
          <div className="flex items-center gap-2 text-dim flex-wrap">
            <span className="text-deep">[</span>
            {VOCAB.map((v, i) => (
              <span key={v} className="contents">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInput(v);
                    inputRef.current?.focus();
                  }}
                  className="text-dim hover:text-ink uppercase tracking-[0.25em] cursor-pointer"
                >
                  {v}
                </button>
                {i < VOCAB.length - 1 ? <span className="text-deep">·</span> : null}
              </span>
            ))}
            <span className="text-deep">]</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {feedback ? (
              <span
                className={`normal-case tracking-normal text-[10px] ${
                  feedback.tone === "alert" ? "alert-glow" : "phosphor"
                }`}
              >
                {feedback.text}
              </span>
            ) : null}
            <span className="text-dim">↑↓ HISTORY</span>
            <span className="text-deep">·</span>
            <span className="text-dim">TAB COMPLETE</span>
            <span className="text-deep">·</span>
            <span className="text-dim">ESC CLEAR</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────── State strip cell ─────────────── */

function StateCell({
  label,
  children,
  big = false,
}: {
  label: string;
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 border-r border-border last:border-r-0">
      <div className="text-[8px] tracking-[0.32em] text-dim uppercase">{label}</div>
      <div className={`mt-1 leading-none ${big ? "" : ""}`}>{children}</div>
    </div>
  );
}

/* ─────────────── Log row ─────────────── */

function LogRow({
  t,
  expanded,
  onToggle,
}: {
  t: Transmission;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = statusOf(t);
  const barColor =
    status === "ok"
      ? "bg-jade/70"
      : status === "fail"
        ? "bg-alert/80"
        : t.command === "REBOOT"
          ? "bg-phosphor/70"
          : "bg-phosphor/40";
  const arrowColor =
    status === "ok" ? "jade" : status === "fail" ? "alert-glow" : "phosphor";
  const cmdColor = t.command === "REBOOT" ? "alert-glow" : "text-ink";
  const utcLabel = formatUtc(t.sentAt);
  const cmdLabel = t.command + (t.arg ? ` ${t.arg}` : "");

  let trailing: React.ReactNode = (
    <span className="text-dim">…awaiting ack</span>
  );
  if (status === "ok" && t.ackAt !== null) {
    const lat = Math.max(0, t.ackAt - t.sentAt);
    trailing = (
      <>
        <span className="jade">ACK OK</span>
        <span className="text-dim ml-2">{lat}ms</span>
      </>
    );
  } else if (status === "fail" && t.ackAt !== null) {
    const lat = Math.max(0, t.ackAt - t.sentAt);
    const code =
      t.failureCode !== null
        ? FAILURE_LABEL[t.failureCode] ?? `FC=${t.failureCode}`
        : "—";
    trailing = (
      <>
        <span className="alert-glow">ACK FAIL</span>
        <span className="text-dim ml-2">{lat}ms</span>
        <span className="alert-glow ml-2">· {code}</span>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`w-full flex items-stretch text-left transition-colors ${
        expanded ? "bg-rail/60" : "hover:bg-rail/40"
      }`}
      aria-expanded={expanded}
    >
      <div className={`w-[3px] ${barColor}`} />
      <div className="flex-1 px-4 py-1 flex items-baseline gap-3 whitespace-pre">
        <span className={`${expanded ? "phosphor" : "text-deep"} w-[10px] shrink-0`}>
          {expanded ? "▼" : "▶"}
        </span>
        <span className="text-dim">{utcLabel}</span>
        <span className="text-deep">·</span>
        <span className={arrowColor}>▶</span>
        <span className="text-dim w-[60px] inline-block">
          TC#{String(t.seq).padStart(3, "0")}
        </span>
        <span className={`${cmdColor} w-[180px] inline-block`}>{cmdLabel}</span>
        <span className="flex-1">{trailing}</span>
      </div>
    </button>
  );
}

function InspectorPanel({
  t,
  view,
  onChangeView,
  onClose,
}: {
  t: Transmission;
  view: "tc" | "ack";
  onChangeView: (v: "tc" | "ack") => void;
  onClose: () => void;
}) {
  const hasAck = t.ackBytes !== null;
  const bytes = view === "tc" || !hasAck ? t.tcBytes : (t.ackBytes ?? t.tcBytes);
  const title =
    view === "tc"
      ? `TC#${String(t.seq).padStart(3, "0")} · ${t.command}${t.arg ? ` ${t.arg}` : ""}`
      : `ACK · TC#${String(t.seq).padStart(3, "0")}`;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Tab bar TC / ACK */}
      <div className="flex items-center gap-2 border-t border-border/60 bg-rail/40 px-4 py-1.5 text-[9px] tracking-[0.3em] uppercase">
        <button
          type="button"
          onClick={() => onChangeView("tc")}
          className={`px-2 py-0.5 ${
            view === "tc" ? "phosphor border-b border-phosphor" : "text-dim hover:text-ink"
          }`}
        >
          TC · {t.tcBytes.length}B
        </button>
        <button
          type="button"
          onClick={() => onChangeView("ack")}
          disabled={!hasAck}
          className={`px-2 py-0.5 ${
            !hasAck
              ? "text-deep cursor-not-allowed"
              : view === "ack"
                ? "jade border-b border-jade"
                : "text-dim hover:text-ink"
          }`}
        >
          ACK {hasAck ? `· ${t.ackBytes!.length}B` : "· pending"}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="text-dim hover:text-ink"
          aria-label="Close inspector"
        >
          ✕ CLOSE
        </button>
      </div>
      <PacketInspector bytes={bytes} title={title} />
    </div>
  );
}
