// Analytics derivations from the static corpus.
//
// We don't have a real-time data warehouse - these are derived
// in-process from corpus.json at render time. Every series is
// computed lazily and memo-friendly: pure functions, no side effects.

import { corpus } from "./corpus";

export interface DailyPoint {
  /** ISO date, e.g. "2026-05-18" */
  date: string;
  total: number;
  blue: number;
  red: number;
  draw: number;
}

export interface SeveritySeries {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface PersonaStat {
  persona: string;
  n: number;
  red: number;
  red_rate: number;
  avg_red_score: number;
  /** Most recent fight (ISO) */
  last_seen: string | null;
}

export interface ModeStat {
  mode: string;
  n: number;
  blue: number;
  red: number;
  draw: number;
  red_rate: number;
  avg_blue: number;
  avg_red: number;
}

function dayOf(iso: string | undefined | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function dailyFightCounts(): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const f of corpus) {
    const d = dayOf(f.transcript.started_at);
    if (!d) continue;
    const slot =
      map.get(d) ?? { date: d, total: 0, blue: 0, red: 0, draw: 0 };
    slot.total++;
    slot[f.verdict.winner]++;
    map.set(d, slot);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function severityOverTime(): SeveritySeries[] {
  const map = new Map<string, SeveritySeries>();
  for (const f of corpus) {
    const sev = f.fix_proposal?.taxonomy?.severity?.toLowerCase();
    if (!sev) continue;
    const d = dayOf(f.transcript.started_at);
    if (!d) continue;
    const slot =
      map.get(d) ?? { date: d, critical: 0, high: 0, medium: 0, low: 0 };
    if (sev === "critical" || sev === "high" || sev === "medium" || sev === "low") {
      slot[sev]++;
    }
    map.set(d, slot);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function asrByModeOverTime(): Array<{
  date: string;
  mode: string;
  rate: number;
  n: number;
}> {
  // Buckets by (day, mode), red_rate per bucket.
  const buckets = new Map<string, { n: number; red: number }>();
  for (const f of corpus) {
    const d = dayOf(f.transcript.started_at);
    const mode = f.transcript.blue_mode ?? "standard";
    const key = `${d}|${mode}`;
    const slot = buckets.get(key) ?? { n: 0, red: 0 };
    slot.n++;
    if (f.verdict.winner === "red") slot.red++;
    buckets.set(key, slot);
  }
  const out: Array<{ date: string; mode: string; rate: number; n: number }> = [];
  for (const [key, s] of buckets) {
    const [date, mode] = key.split("|");
    out.push({ date, mode, rate: s.n ? s.red / s.n : 0, n: s.n });
  }
  out.sort((a, b) =>
    a.date === b.date ? a.mode.localeCompare(b.mode) : a.date.localeCompare(b.date)
  );
  return out;
}

export function personaRanking(): PersonaStat[] {
  const map = new Map<
    string,
    { n: number; red: number; red_score_sum: number; last: string }
  >();
  for (const f of corpus) {
    const name = f.transcript.persona_name;
    const slot =
      map.get(name) ?? { n: 0, red: 0, red_score_sum: 0, last: "" };
    slot.n++;
    slot.red_score_sum += f.verdict.red_score ?? 0;
    if (f.verdict.winner === "red") slot.red++;
    if ((f.transcript.started_at ?? "") > slot.last) {
      slot.last = f.transcript.started_at ?? "";
    }
    map.set(name, slot);
  }
  const stats: PersonaStat[] = [];
  for (const [name, s] of map) {
    stats.push({
      persona: name,
      n: s.n,
      red: s.red,
      red_rate: s.n ? s.red / s.n : 0,
      avg_red_score: s.n ? s.red_score_sum / s.n : 0,
      last_seen: s.last || null,
    });
  }
  stats.sort((a, b) =>
    b.red_rate - a.red_rate || b.avg_red_score - a.avg_red_score
  );
  return stats;
}

export function modeRanking(): ModeStat[] {
  const map = new Map<
    string,
    {
      n: number;
      blue: number;
      red: number;
      draw: number;
      blue_score_sum: number;
      red_score_sum: number;
    }
  >();
  for (const f of corpus) {
    const m = f.transcript.blue_mode ?? "standard";
    const slot =
      map.get(m) ?? {
        n: 0,
        blue: 0,
        red: 0,
        draw: 0,
        blue_score_sum: 0,
        red_score_sum: 0,
      };
    slot.n++;
    slot[f.verdict.winner]++;
    slot.blue_score_sum += f.verdict.blue_score ?? 0;
    slot.red_score_sum += f.verdict.red_score ?? 0;
    map.set(m, slot);
  }
  const stats: ModeStat[] = [];
  for (const [mode, s] of map) {
    stats.push({
      mode,
      n: s.n,
      blue: s.blue,
      red: s.red,
      draw: s.draw,
      red_rate: s.n ? s.red / s.n : 0,
      avg_blue: s.n ? s.blue_score_sum / s.n : 0,
      avg_red: s.n ? s.red_score_sum / s.n : 0,
    });
  }
  stats.sort((a, b) => a.mode.localeCompare(b.mode));
  return stats;
}

export function coverageTrajectory(): Array<{ date: string; categories: number }> {
  // Running count of unique attack categories seen up to and
  // including each date.
  const fights = [...corpus].sort((a, b) =>
    (a.transcript.started_at ?? "").localeCompare(b.transcript.started_at ?? "")
  );
  const seen = new Set<string>();
  const byDay = new Map<string, number>();
  for (const f of fights) {
    seen.add(f.verdict.attack_category);
    const d = dayOf(f.transcript.started_at);
    if (!d) continue;
    byDay.set(d, seen.size);
  }
  return Array.from(byDay.entries())
    .map(([date, categories]) => ({ date, categories }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function fixLifecycle(): {
  total_red_wins: number;
  diagnosed: number;
  remaining: number;
  median_fight_to_fix_minutes: number | null;
} {
  const reds = corpus.filter((f) => f.verdict.winner === "red");
  const diagnosed = corpus.filter(
    (f) => f.verdict.winner === "red" && f.fix_proposal
  ).length;
  return {
    total_red_wins: reds.length,
    diagnosed,
    remaining: reds.length - diagnosed,
    median_fight_to_fix_minutes: null, // we don't currently track fix_proposal timestamps
  };
}

export function kpis() {
  const total = corpus.length;
  const red = corpus.filter((f) => f.verdict.winner === "red").length;
  const blue = corpus.filter((f) => f.verdict.winner === "blue").length;
  const draw = corpus.filter((f) => f.verdict.winner === "draw").length;
  const personas = new Set(corpus.map((f) => f.transcript.persona_name)).size;
  const scenarios = new Set(corpus.map((f) => f.transcript.scenario_name)).size;
  const modes = new Set(corpus.map((f) => f.transcript.blue_mode ?? "standard"))
    .size;
  const withFix = corpus.filter((f) => f.fix_proposal).length;
  return {
    total,
    red,
    blue,
    draw,
    personas,
    scenarios,
    modes,
    withFix,
    asr: total ? red / total : 0,
    robustness: total ? 1 - red / total : 1,
  };
}

/** Format an ISO date for chart x-axis labels: "May 16". */
export function shortDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export interface HeatmapCell {
  persona: string;
  mode: string;
  n: number;
  red: number;
  blue: number;
  draw: number;
  red_rate: number;
}

export interface PersonaModeHeatmap {
  personas: string[];
  modes: string[];
  cells: HeatmapCell[];
  /** Quick lookup: `${persona}|${mode}` -> cell */
  index: Map<string, HeatmapCell>;
}

export function personaModeHeatmap(): PersonaModeHeatmap {
  const cellsMap = new Map<string, HeatmapCell>();
  for (const f of corpus) {
    const persona = f.transcript.persona_name;
    const mode = f.transcript.blue_mode ?? "standard";
    const key = `${persona}|${mode}`;
    const slot =
      cellsMap.get(key) ??
      {
        persona,
        mode,
        n: 0,
        red: 0,
        blue: 0,
        draw: 0,
        red_rate: 0,
      };
    slot.n++;
    slot[f.verdict.winner]++;
    cellsMap.set(key, slot);
  }
  for (const cell of cellsMap.values()) {
    cell.red_rate = cell.n ? cell.red / cell.n : 0;
  }
  const personas = Array.from(new Set([...cellsMap.values()].map((c) => c.persona))).sort();
  const modeOrder = ["standard", "lenient", "naive", "external"];
  const modes = Array.from(new Set([...cellsMap.values()].map((c) => c.mode))).sort(
    (a, b) => modeOrder.indexOf(a) - modeOrder.indexOf(b)
  );
  return {
    personas,
    modes,
    cells: Array.from(cellsMap.values()),
    index: cellsMap,
  };
}

export function firstFightDate(): string | null {
  const sorted = [...corpus]
    .map((f) => f.transcript.started_at ?? "")
    .filter(Boolean)
    .sort();
  return sorted[0] ?? null;
}

export function latestFightDate(): string | null {
  const sorted = [...corpus]
    .map((f) => f.transcript.started_at ?? "")
    .filter(Boolean)
    .sort();
  return sorted[sorted.length - 1] ?? null;
}
