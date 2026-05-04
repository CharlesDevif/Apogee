import type { TleBundle, TleEntry } from "@apogee/shared-types";

const GROUPS = ["stations", "active"] as const;
type Group = (typeof GROUPS)[number];

const FEATURED_NORAD_IDS = new Set<number>([
  25544, // ISS (ZARYA)
  20580, // Hubble Space Telescope
  39084, // Landsat 8
  43013, // NOAA-20
  48274, // CSS (Tianhe-1)
]);

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

let cache: TleBundle | null = null;
let inflight: Promise<TleBundle> | null = null;

function parse3LE(text: string, group: string): TleEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: TleEntry[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!name || !line1?.startsWith("1 ") || !line2?.startsWith("2 ")) continue;
    const noradId = Number(line1.slice(2, 7).trim());
    if (!Number.isFinite(noradId)) continue;
    out.push({ noradId, name, group, line1, line2 });
  }
  return out;
}

async function fetchGroup(group: Group): Promise<TleEntry[]> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Apogee-MissionControl/0.0.1 (educational)" },
  });
  if (!r.ok) throw new Error(`Celestrak ${group} fetch failed: ${r.status}`);
  const text = await r.text();
  return parse3LE(text, group);
}

function sampleN<T>(arr: T[], n: number): T[] {
  const out = arr.slice();
  const limit = Math.min(n, out.length);
  for (let i = 0; i < limit; i++) {
    const j = i + Math.floor(Math.random() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, limit);
}

export async function refreshCache(): Promise<TleBundle> {
  if (inflight) return inflight;
  inflight = (async () => {
    const groups = await Promise.all(GROUPS.map(fetchGroup));
    const byId = new Map<number, TleEntry>();
    for (const list of groups) {
      for (const e of list) {
        const existing = byId.get(e.noradId);
        if (!existing || e.group === "stations") byId.set(e.noradId, e);
      }
    }
    const featured: TleEntry[] = [];
    const others: TleEntry[] = [];
    for (const e of byId.values()) {
      if (FEATURED_NORAD_IDS.has(e.noradId)) featured.push(e);
      else others.push(e);
    }
    const bundle: TleBundle = {
      fetchedAt: Date.now(),
      entries: [...featured, ...sampleN(others, 30)],
    };
    cache = bundle;
    return bundle;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function getCachedBundle(): Promise<TleBundle> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    return refreshCache();
  }
  return cache;
}

export function getCacheAgeMs(): number | null {
  return cache ? Date.now() - cache.fetchedAt : null;
}
