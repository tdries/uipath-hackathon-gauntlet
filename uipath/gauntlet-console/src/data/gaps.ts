// Coverage-gap analysis - TypeScript port of gauntlet/coach.py's
// analyze_coverage_gaps(). Computed from the static corpus so the
// console can show the same risk-weighted view Coach uses to bias
// new-persona generation.

import { corpus } from "./corpus";

export interface CoverageGap {
  attack_category: string;
  n_runs: number;
  red_wins: number;
  red_win_rate: number;
  avg_red_score: number;
  gap_score: number;
  untested: boolean;
}

// Same weights as gauntlet.coach._GAP_W_RATE / _GAP_W_SCORE - keep in sync.
const W_RATE = 0.6;
const W_SCORE = 0.4;

// Categories we *expect* to test (mirrors EXPECTED_CATEGORIES in
// gauntlet/coach.py). Anything in this list with zero runs is flagged
// as the highest-priority gap.
export const EXPECTED_CATEGORIES = [
  "social_engineering",
  "prompt_injection",
  "doc_forgery",
  "kyc_bypass",
  "multi_turn",
] as const;

export function computeCoverageGaps(): CoverageGap[] {
  const buckets = new Map<
    string,
    { red: number; blue: number; draw: number; redScoreSum: number; n: number }
  >();

  for (const f of corpus) {
    const cat = f.verdict.attack_category || "unknown";
    const slot =
      buckets.get(cat) ?? {
        red: 0,
        blue: 0,
        draw: 0,
        redScoreSum: 0,
        n: 0,
      };
    slot[f.verdict.winner]++;
    slot.redScoreSum += f.verdict.red_score ?? 0;
    slot.n++;
    buckets.set(cat, slot);
  }

  const cats = new Set([...buckets.keys(), ...EXPECTED_CATEGORIES]);
  const gaps: CoverageGap[] = [];
  for (const cat of cats) {
    const s = buckets.get(cat);
    if (!s || s.n === 0) {
      gaps.push({
        attack_category: cat,
        n_runs: 0,
        red_wins: 0,
        red_win_rate: 0,
        avg_red_score: 0,
        gap_score: 1.0,
        untested: true,
      });
      continue;
    }
    const rate = s.red / s.n;
    const avgRed = s.redScoreSum / s.n;
    gaps.push({
      attack_category: cat,
      n_runs: s.n,
      red_wins: s.red,
      red_win_rate: rate,
      avg_red_score: avgRed,
      gap_score: W_RATE * rate + W_SCORE * (avgRed / 100),
      untested: false,
    });
  }

  gaps.sort((a, b) => b.gap_score - a.gap_score);
  return gaps;
}

// Convenience: the weakest category Coach should currently target.
export function weakestCategory(): CoverageGap | null {
  const gaps = computeCoverageGaps();
  return gaps[0] ?? null;
}
