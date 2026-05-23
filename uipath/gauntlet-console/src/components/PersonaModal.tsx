// PersonaModal - drill-in view for a single attacker persona.
//
// Clickable from any persona name in the dashboard. Shows:
//   - Header KPIs (fights, red rate, avg AVSS, severity peak)
//   - All fights for this persona, sorted newest first
//   - OWASP / MITRE coverage chips
//   - Most recent fix proposal summary (if any)
//   - Per-mode win/loss breakdown
//
// Read-only; one click on any fight row opens it in the Fight Log
// section via permalink scroll.

import "./PersonaModal.css";
import { useEffect, useMemo } from "react";
import { corpus } from "../data/corpus";
import { computeAvss } from "../data/avss";
import { OWASP, ATLAS, tagsFor } from "../data/taxonomy";
import type { FightRecord } from "../data/types";
import { ShieldIcon, SwordIcon } from "./Icon";

interface Props {
  persona: string | null;
  onClose: () => void;
}

function fmt(t: string | null | undefined): string {
  if (!t) return "-";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return t;
  }
}

export function PersonaModal({ persona, onClose }: Props) {
  // ESC to close
  useEffect(() => {
    if (!persona) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [persona, onClose]);

  const fights = useMemo<FightRecord[]>(() => {
    if (!persona) return [];
    return corpus
      .filter((f) => f.transcript.persona_name === persona)
      .sort((a, b) =>
        (b.transcript.started_at ?? "").localeCompare(
          a.transcript.started_at ?? ""
        )
      );
  }, [persona]);

  const stats = useMemo(() => {
    const total = fights.length;
    const red = fights.filter((f) => f.verdict.winner === "red").length;
    const blue = fights.filter((f) => f.verdict.winner === "blue").length;
    const draw = fights.filter((f) => f.verdict.winner === "draw").length;
    const avssScores = fights
      .filter((f) => f.fix_proposal)
      .map((f) => computeAvss(f.fix_proposal!, f).score);
    const avgAvss =
      avssScores.length > 0
        ? avssScores.reduce((s, v) => s + v, 0) / avssScores.length
        : 0;
    const peakAvss = avssScores.length > 0 ? Math.max(...avssScores) : 0;
    const byMode = new Map<
      string,
      { n: number; red: number; blue: number; draw: number }
    >();
    for (const f of fights) {
      const m = f.transcript.blue_mode ?? "standard";
      const slot =
        byMode.get(m) ?? { n: 0, red: 0, blue: 0, draw: 0 };
      slot.n++;
      slot[f.verdict.winner]++;
      byMode.set(m, slot);
    }
    return {
      total,
      red,
      blue,
      draw,
      red_rate: total ? red / total : 0,
      avgAvss,
      peakAvss,
      byMode,
    };
  }, [fights]);

  if (!persona) return null;

  const personaTags = tagsFor(persona);
  const latestFix = fights.find((f) => f.fix_proposal);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal persona-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head persona-modal-head">
          <div>
            <span className="persona-modal-eyebrow">Attacker profile</span>
            <h2>{persona}</h2>
            <p className="persona-modal-sub">
              {stats.total} fight{stats.total === 1 ? "" : "s"} across{" "}
              {stats.byMode.size} blue posture{stats.byMode.size === 1 ? "" : "s"}
              {stats.red > 0 && (
                <>
                  {" "}·{" "}
                  <span style={{ color: "var(--red)", fontWeight: 700 }}>
                    {stats.red} successful breach
                    {stats.red === 1 ? "" : "es"}
                  </span>
                </>
              )}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body persona-modal-body">
          <div className="persona-kpis">
            <div className="persona-kpi">
              <span>Total fights</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="persona-kpi">
              <span>Red win rate</span>
              <strong style={{ color: stats.red > 0 ? "var(--red)" : "var(--ok)" }}>
                {(stats.red_rate * 100).toFixed(0)}%
              </strong>
            </div>
            <div className="persona-kpi">
              <span>Avg AVSS</span>
              <strong>{stats.avgAvss ? stats.avgAvss.toFixed(1) : "-"}</strong>
            </div>
            <div className="persona-kpi">
              <span>Peak AVSS</span>
              <strong
                style={{
                  color: stats.peakAvss >= 9 ? "#8B0000" : stats.peakAvss >= 7 ? "var(--red)" : "var(--ink)",
                }}
              >
                {stats.peakAvss ? stats.peakAvss.toFixed(1) : "-"}
              </strong>
            </div>
          </div>

          {personaTags.length > 0 && (
            <section className="persona-section">
              <h3>Tagged risk categories</h3>
              <div className="persona-tags">
                {personaTags.map((t) => (
                  <a
                    key={t.id}
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`persona-tag persona-tag-${t.framework.toLowerCase()}`}
                  >
                    {t.id}{" "}
                    <span className="persona-tag-name">{t.name}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="persona-section">
            <h3>Performance by blue posture</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th className="right">N</th>
                  <th className="right" title="Blue defended">Blue</th>
                  <th className="right" title="Red won">Red</th>
                  <th className="right">Red rate</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(stats.byMode.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([mode, s]) => (
                    <tr key={mode}>
                      <td>
                        <span className="tag tag-neutral">{mode}</span>
                      </td>
                      <td className="right">{s.n}</td>
                      <td className="right" style={{ color: "var(--blue)" }}>
                        {s.blue}
                      </td>
                      <td className="right" style={{ color: "var(--red)" }}>
                        {s.red}
                      </td>
                      <td
                        className="right"
                        style={{
                          color: s.red > 0 ? "var(--red)" : "var(--ink-3)",
                        }}
                      >
                        {s.n ? `${((s.red / s.n) * 100).toFixed(0)}%` : "-"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          {latestFix?.fix_proposal && (
            <section className="persona-section persona-section-fix">
              <h3>Latest fix recommendation</h3>
              <p className="persona-fix-summary">
                {latestFix.fix_proposal.summary}
              </p>
              <div className="persona-fix-tactic">
                <strong>Tactic:</strong>{" "}
                {latestFix.fix_proposal.root_cause.tactic}
              </div>
              <a
                className="btn btn-outline btn-sm"
                href={`#fight=${latestFix.transcript.fight_id}`}
                onClick={onClose}
              >
                Open this fight in the log →
              </a>
            </section>
          )}

          <section className="persona-section">
            <h3>All fights ({stats.total})</h3>
            <div className="persona-fight-list">
              {fights.map((f) => {
                const fix = f.fix_proposal;
                const avss = fix ? computeAvss(fix, f).score : null;
                return (
                  <a
                    key={f.transcript.fight_id}
                    href={`#fight=${f.transcript.fight_id}`}
                    onClick={onClose}
                    className="persona-fight-row"
                  >
                    <span className="persona-fight-when">
                      {fmt(f.transcript.started_at)}
                    </span>
                    <span className="persona-fight-mode tag tag-neutral">
                      {f.transcript.blue_mode ?? "standard"}
                    </span>
                    <span className="persona-fight-scenario">
                      {f.transcript.scenario_name}
                    </span>
                    {f.verdict.winner === "red" && (
                      <span className="tag tag-red tag-mini">
                        <SwordIcon size={10} /> RED
                      </span>
                    )}
                    {f.verdict.winner === "blue" && (
                      <span className="tag tag-blue tag-mini">
                        <ShieldIcon size={10} /> BLUE
                      </span>
                    )}
                    {f.verdict.winner === "draw" && (
                      <span className="tag tag-warn tag-mini">draw</span>
                    )}
                    {avss !== null && (
                      <span className="persona-fight-avss">
                        AVSS {avss.toFixed(1)}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Just so the unused import lint doesn't complain.
void OWASP;
void ATLAS;
