import "./ThreatDashboard.css";
import { useMemo } from "react";
import { corpus } from "../data/corpus";
import { tenant } from "../data/tenant";
import type { FightRecord } from "../data/types";

function bucketByMode(records: FightRecord[]) {
  const per: Record<string, { n: number; blue: number; red: number; draw: number; scoreSum: number }> = {};
  for (const r of records) {
    const mode = r.transcript.blue_mode ?? "standard";
    if (!per[mode]) per[mode] = { n: 0, blue: 0, red: 0, draw: 0, scoreSum: 0 };
    per[mode].n++;
    per[mode][r.verdict.winner]++;
    per[mode].scoreSum += r.verdict.blue_score ?? 0;
  }
  return per;
}

function bucketByPersona(records: FightRecord[]) {
  const per: Record<string, { n: number; red: number }> = {};
  for (const r of records) {
    const name = r.transcript.persona_name;
    if (!per[name]) per[name] = { n: 0, red: 0 };
    per[name].n++;
    if (r.verdict.winner === "red") per[name].red++;
  }
  return per;
}

export function ThreatDashboard() {
  const stats = useMemo(() => {
    const total = corpus.length;
    const red = corpus.filter((r) => r.verdict.winner === "red").length;
    const blue = corpus.filter((r) => r.verdict.winner === "blue").length;
    const draw = corpus.filter((r) => r.verdict.winner === "draw").length;
    const personas = new Set(corpus.map((r) => r.transcript.persona_name)).size;
    const modes = bucketByMode(corpus);
    const personasTable = bucketByPersona(corpus);
    return { total, red, blue, draw, personas, modes, personasTable };
  }, []);

  return (
    <section className="threat-section" id="dashboard">
      <div className="wrap">
        <h2>How is the agent holding up?</h2>
        <p className="section-lede">
          The scoreboard for every adversarial call we've ever run against the
          MetroBank CSR. Green = your agent defended. Red = an attacker got
          through. Each row is also a regression test in your{" "}
          <a href={tenant.testManagerProject} target="_blank" rel="noreferrer">
            Test Manager project
          </a>
          .
        </p>

        <div className="score-grid">
          <div className="score-card brand">
            <div className="score-label">Total adversarial calls</div>
            <div className="score-value">{stats.total.toLocaleString()}</div>
            <div className="score-sub">{stats.personas} red personas active</div>
          </div>
          <div className="score-card red">
            <div className="score-label">Successful attacks</div>
            <div className="score-value">{stats.red}</div>
            <div className="score-sub">must-fix regressions</div>
          </div>
          <div className="score-card blue">
            <div className="score-label">Defenses held</div>
            <div className="score-value">{stats.blue}</div>
            <div className="score-sub">regression passes - locked in</div>
          </div>
          <div className="score-card">
            <div className="score-label">- Draws / aborted</div>
            <div className="score-value">{stats.draw}</div>
            <div className="score-sub">inconclusive rounds</div>
          </div>
        </div>

        <div className="mini-tables">
          <div>
            <h3 className="mini-heading">By blue policy posture</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Blue mode</th>
                  <th className="right">N</th>
                  <th className="right"></th>
                  <th className="right"></th>
                  <th className="right">Avg blue score</th>
                </tr>
              </thead>
              <tbody>
                {(["standard", "lenient", "naive", "external"] as const).map((mode) => {
                  const s = stats.modes[mode];
                  if (!s) return null;
                  const avg = s.n ? s.scoreSum / s.n : 0;
                  return (
                    <tr key={mode}>
                      <td>
                        <span className="tag tag-neutral">{mode}</span>
                        {mode === "external" && (
                          <span
                            className="tag tag-mini"
                            style={{ marginLeft: 6, background: "var(--primary)", color: "white" }}
                            title="Third-party framework (LangGraph) - proves the test cloud is framework-neutral"
                          >
                            3rd-party
                          </span>
                        )}
                      </td>
                      <td className="right">{s.n}</td>
                      <td className="right" style={{ color: "var(--blue)" }}>{s.blue}</td>
                      <td className="right" style={{ color: "var(--red)" }}>{s.red}</td>
                      <td className="right">{avg.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mini-heading">By red persona (most dangerous first)</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="right">N</th>
                  <th className="right">wins</th>
                  <th className="right">Red win %</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.personasTable)
                  .map(([name, s]) => ({ name, ...s, rate: s.n ? s.red / s.n : 0 }))
                  .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))
                  .map(({ name, n, red, rate }) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="right">{n}</td>
                      <td className="right" style={{ color: "var(--red)" }}>{red}</td>
                      <td
                        className="right"
                        style={{ color: rate > 0 ? "var(--red)" : "var(--ink-3)" }}
                      >
                        {(rate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
