import type { ReactNode } from "react";

export function Bracket({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`bracket ${className}`}>{children}</div>;
}

export function Strip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[10px] tracking-[0.25em] text-dim uppercase">
      {children}
    </div>
  );
}

export function Module({
  label,
  value,
  state = "ok",
  hint,
  index,
}: {
  label: string;
  value: ReactNode;
  state?: "ok" | "warn" | "down" | "idle";
  hint?: string;
  index: number;
}) {
  const dot =
    state === "ok"
      ? "bg-jade shadow-[0_0_10px_#7dffb1]"
      : state === "warn"
        ? "bg-phosphor shadow-[0_0_10px_#ffb700]"
        : state === "down"
          ? "bg-alert shadow-[0_0_10px_#ff4d3d]"
          : "bg-dim";

  return (
    <div
      className={`panel px-3 py-2 boot-${Math.min(index, 6)}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-[0.3em] text-dim uppercase">
          {label}
        </span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${dot} ${
            state === "warn" ? "animate-pulseDot" : ""
          }`}
        />
      </div>
      <div className="mt-1.5 text-[13px] leading-tight text-ink tnum">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[8px] tracking-[0.2em] text-dim uppercase">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function Readout({
  k,
  v,
  unit,
  warn,
}: {
  k: string;
  v: ReactNode;
  unit?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-dashed border-border/50 last:border-b-0">
      <span className="text-[9px] tracking-[0.3em] text-dim uppercase">
        {k}
      </span>
      <span
        className={`text-[12px] tnum ${warn ? "alert-glow" : "text-ink"}`}
      >
        {v}
        {unit ? (
          <span className="ml-1 text-[9px] text-dim tracking-widest">
            {unit}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function CornerFrame() {
  return (
    <>
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
        (pos) => {
          const cls: Record<typeof pos, string> = {
            "top-left": "top-2 left-2 border-t border-l",
            "top-right": "top-2 right-2 border-t border-r",
            "bottom-left": "bottom-2 left-2 border-b border-l",
            "bottom-right": "bottom-2 right-2 border-b border-r",
          };
          return (
            <span
              key={pos}
              className={`pointer-events-none fixed h-3 w-3 ${cls[pos]} border-phosphor/70 z-[55]`}
            />
          );
        },
      )}
    </>
  );
}

export function Crosshair() {
  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-[40]">
      <div className="relative h-72 w-72 opacity-30">
        <div className="absolute inset-0 border border-phosphor/40 rounded-full" />
        <div className="absolute inset-6 border border-phosphor/20 rounded-full" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-phosphor/30" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-phosphor/30" />
        <div
          className="absolute inset-0 origin-center"
          style={{ animation: "sweep 14s linear infinite" }}
        >
          <div className="absolute left-1/2 top-0 h-1/2 w-px bg-gradient-to-b from-jade/80 to-transparent" />
        </div>
      </div>
    </div>
  );
}
