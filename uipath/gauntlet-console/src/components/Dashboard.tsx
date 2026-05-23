// Dashboard - the compact landing view for the Overview tab. No
// marketing copy, no scroll-tour. Real metrics + jump-off actions.

import "./Dashboard.css";
import { Fragment, useMemo } from "react";
import { corpus } from "../data/corpus";
import { kpis, personaRanking, personaModeHeatmap } from "../data/analytics";
import { computeAvss } from "../data/avss";
import { SystemUnderTest } from "./SystemUnderTest";
import { ShieldIcon, SwordIcon } from "./Icon";

interface Props {
  onRun: () => void;
  onCoach: () => void;
  onFix: () => void;
  onOpenAnalytics: () => void;
  onOpenLogs: () => void;
  onOpenPersona: (persona: string) => void;
}

export function Dashboard({
  onRun,
  onCoach,
  onFix,
  onOpenAnalytics,
  onOpenLogs,
  onOpenPersona,
}: Props) {
  const k = useMemo(kpis, []);
  const personas = useMemo(personaRanking, []);
  const heatmap = useMemo(personaModeHeatmap, []);
  const recent = useMemo(() => {
    return [...corpus]
      .sort((a, b) =>
        (b.transcript.started_at ?? "").localeCompare(
          a.transcript.started_at ?? ""
        )
      )
      .slice(0, 6);
  }, []);
  const recentCritical = useMemo(() => {
    return corpus
      .filter((f) => f.fix_proposal)
      .map((f) => ({ fight: f, avss: computeAvss(f.fix_proposal!, f).score }))
      .filter((x) => x.avss >= 7)
      .sort((a, b) => b.avss - a.avss)
      .slice(0, 4);
  }, []);

  const robustness = k.robustness;
  const robustnessTone =
    robustness >= 0.95 ? "ok" : robustness >= 0.85 ? "warn" : "alert";

  return (
    <main className="dash">
      <header className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>Tenant status at a glance.</p>
        </div>
        <SystemUnderTest variant="badge" />
      </header>

      <section className="dash-kpis">
        <div className={`dash-kpi dash-kpi-${robustnessTone}`}>
          <span className="dash-kpi-label">Robustness</span>
          <strong className="dash-kpi-big">
            {(robustness * 100).toFixed(1)}%
          </strong>
          <span className="dash-kpi-sub">
            {k.blue} defended / {k.total} total
          </span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Successful attacks</span>
          <strong className="dash-kpi-big" style={{ color: "var(--red)" }}>
            {k.red}
          </strong>
          <span className="dash-kpi-sub">{k.withFix} diagnosed by Fix</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Personas</span>
          <strong className="dash-kpi-big">{k.personas}</strong>
          <span className="dash-kpi-sub">
            {k.scenarios} scenarios · {k.modes} blue postures
          </span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Worst persona</span>
          <strong className="dash-kpi-big dash-kpi-clickable" onClick={() => onOpenPersona(personas[0]?.persona ?? "")}>
            {personas[0]?.persona ?? "-"}
          </strong>
          <span className="dash-kpi-sub">
            {personas[0]
              ? `${(personas[0].red_rate * 100).toFixed(0)}% red rate`
              : "no data"}
          </span>
        </div>
      </section>

      <section className="dash-row">
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h2>Top critical findings</h2>
            <button className="dash-link" onClick={onFix}>
              Open Fix Recommender →
            </button>
          </header>
          {recentCritical.length === 0 ? (
            <p className="dash-empty">No critical findings yet.</p>
          ) : (
            <ul className="dash-findings">
              {recentCritical.map(({ fight, avss }) => {
                const fp = fight.fix_proposal!;
                return (
                  <li key={fight.transcript.fight_id}>
                    <span
                      className={`avss-pill avss-${avss >= 9 ? "critical" : "high"}`}
                    >
                      <span className="avss-score">{avss.toFixed(1)}</span>
                    </span>
                    <button
                      className="dash-finding-title"
                      onClick={onFix}
                      title="Open in Fix Recommender"
                    >
                      {fp.test_manager.task_title}
                    </button>
                    <button
                      className="persona-link dash-finding-persona"
                      onClick={() => onOpenPersona(fp.persona_name)}
                    >
                      {fp.persona_name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h2>Recent fights</h2>
            <button className="dash-link" onClick={onOpenLogs}>
              Open Logs →
            </button>
          </header>
          <ul className="dash-recent">
            {recent.map((f) => (
              <li key={f.transcript.fight_id}>
                <span className="dash-recent-when">
                  {(f.transcript.started_at ?? "").slice(5, 10)}
                </span>
                <span
                  className={`dash-recent-result dash-recent-${f.verdict.winner}`}
                >
                  {f.verdict.winner === "red" && (
                    <>
                      <SwordIcon size={11} /> RED
                    </>
                  )}
                  {f.verdict.winner === "blue" && (
                    <>
                      <ShieldIcon size={11} /> BLUE
                    </>
                  )}
                  {f.verdict.winner === "draw" && "Draw"}
                </span>
                <button
                  className="persona-link dash-recent-persona"
                  onClick={() => onOpenPersona(f.transcript.persona_name)}
                >
                  {f.transcript.persona_name}
                </button>
                <span className="dash-recent-mode">
                  {f.transcript.blue_mode ?? "standard"}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="dash-row">
        <article className="dash-panel dash-panel-quick">
          <header className="dash-panel-head">
            <h2>Quick actions</h2>
          </header>
          <div className="dash-quick">
            <button className="dash-action dash-action-red" onClick={onRun}>
              <span className="dash-action-icon">
                <SwordIcon size={16} />
              </span>
              <span>
                <strong>Run a fight</strong>
                <span>Single or batch</span>
              </span>
            </button>
            <button className="dash-action dash-action-red" onClick={onCoach}>
              <span className="dash-action-icon">
                <SwordIcon size={16} />
              </span>
              <span>
                <strong>Coach Lab</strong>
                <span>Invent a new attacker</span>
              </span>
            </button>
            <button className="dash-action dash-action-blue" onClick={onFix}>
              <span className="dash-action-icon">
                <ShieldIcon size={16} />
              </span>
              <span>
                <strong>Fix Recommender</strong>
                <span>Diagnose + patch</span>
              </span>
            </button>
            <button className="dash-action" onClick={onOpenAnalytics}>
              <span className="dash-action-icon dash-action-icon-neutral" />
              <span>
                <strong>Analytics</strong>
                <span>Trends, leaderboards</span>
              </span>
            </button>
          </div>
        </article>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h2>Coverage heatmap</h2>
            <button className="dash-link" onClick={onOpenAnalytics}>
              Full view →
            </button>
          </header>
          <p className="dash-heat-hint">
            Red cells = your agent loses against that combination.
          </p>
          <MiniHeatmap data={heatmap} onOpenPersona={onOpenPersona} />
        </article>
      </section>
    </main>
  );
}

function MiniHeatmap({
  data,
  onOpenPersona,
}: {
  data: ReturnType<typeof personaModeHeatmap>;
  onOpenPersona: (persona: string) => void;
}) {
  if (data.cells.length === 0) {
    return <p className="dash-empty">No fights yet.</p>;
  }
  const modes = data.modes;
  const personas = [...data.personas].reverse();
  return (
    <div
      className="dash-heat"
      style={{
        gridTemplateColumns: `minmax(120px, 1fr) repeat(${modes.length}, 1fr)`,
      }}
    >
      <div className="dash-heat-cell dash-heat-corner" />
      {modes.map((m) => (
        <div key={m} className="dash-heat-cell dash-heat-mode">
          {m}
        </div>
      ))}
      {personas.map((p) => (
        <Fragment key={p}>
          <button
            className="dash-heat-cell dash-heat-persona persona-link"
            onClick={() => onOpenPersona(p)}
          >
            {p}
          </button>
          {modes.map((m) => {
            const cell = data.index.get(`${p}|${m}`);
            const rate = cell?.red_rate ?? 0;
            const empty = !cell || cell.n === 0;
            const bg = empty
              ? "rgba(125, 145, 153, 0.08)"
              : rate === 0
                ? "rgba(27, 122, 27, 0.12)"
                : rate < 0.34
                  ? `rgba(177, 122, 0, ${0.2 + rate * 0.4})`
                  : `rgba(216, 37, 44, ${0.2 + rate * 0.65})`;
            const fg = rate >= 0.5 ? "white" : "var(--ink)";
            return (
              <div
                key={`cell-${p}-${m}`}
                className="dash-heat-cell dash-heat-data"
                style={{ background: bg, color: fg }}
                title={
                  empty
                    ? `${p} × ${m}: not tested`
                    : `${p} × ${m}: ${cell.n} fights, ${cell.red} red, ${(rate * 100).toFixed(0)}% red rate`
                }
              >
                {empty ? "-" : cell.n}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
