import "./CoachLab.css";
import { useMemo, useState } from "react";
import { corpus } from "../data/corpus";
import { computeCoverageGaps } from "../data/gaps";
import { tagsFor } from "../data/taxonomy";
import { SwordIcon } from "./Icon";
import {
  getStoredKey,
  setStoredKey,
  runCoach,
  type GeneratedPersona,
} from "../lib/coachRun";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Pick the most recently authored Coach persona present in the
// corpus. If you batch-grow the suite this surfaces the freshest one
// so the modal always has something to show.
function findLatestCoachPersona() {
  const candidates = [
    "regulator-compliance-audit",
    "indirect-injector",
  ];
  for (const name of candidates) {
    const hit = corpus.find((f) => f.transcript.persona_name === name);
    if (hit) return hit;
  }
  return null;
}

export function CoachLab({ open, onClose }: Props) {
  const generated = useMemo(findLatestCoachPersona, []);
  const gaps = useMemo(() => computeCoverageGaps(), []);
  const target = gaps[0];
  const recentLosses = corpus.filter((f) => f.verdict.winner === "red").length;
  const closeCalls = corpus
    .filter((f) => f.verdict.winner !== "red")
    .sort((a, b) => b.verdict.red_score - a.verdict.red_score)
    .slice(0, 3).length;
  const personaCount = new Set(corpus.map((f) => f.transcript.persona_name))
    .size;

  const [apiKey, setApiKey] = useState<string>(() => getStoredKey() ?? "");
  const [keyOpen, setKeyOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedPersona | null>(null);

  if (!open) return null;

  const targetFlag = target?.untested
    ? `--attack-category ${target.attack_category}`
    : target
    ? "--target-gap"
    : "";
  const cliCommand = `gauntlet coach ${targetFlag} --auto-fight`.replace(
    /\s+/g,
    " "
  ).trim();

  const hasKey = apiKey.trim().length > 0;

  async function handleRun() {
    if (!target) return;
    if (!hasKey) {
      setKeyOpen(true);
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const prev = Array.from(
        new Set(corpus.map((f) => f.transcript.persona_name))
      );
      const persona = await runCoach({
        targetCategory: target.attack_category,
        targetUntested: !!target.untested,
        prevPersonaNames: prev,
        apiKey: apiKey.trim(),
      });
      setResult(persona);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Coach Lab</h2>
            <p className="modal-sub">
              Author a new attacker against the weakest gap.
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="coach-stats">
            <div className="coach-stat">
              <div className="coach-stat-label">Red wins to learn from</div>
              <div className="coach-stat-value">{recentLosses}</div>
            </div>
            <div className="coach-stat">
              <div className="coach-stat-label">Close calls to study</div>
              <div className="coach-stat-value">{closeCalls}</div>
            </div>
            <div className="coach-stat">
              <div className="coach-stat-label">Existing personas</div>
              <div className="coach-stat-value">{personaCount}</div>
            </div>
          </div>

          <div className="coach-gap-panel">
            <div className="coach-gap-head">
              <span className="coach-gap-eyebrow">Risk-weighted coverage</span>
              <span className="coach-gap-sub">
                where blue is weakest right now
              </span>
            </div>
            <table className="table coach-gap-table">
              <thead>
                <tr>
                  <th>Attack category</th>
                  <th className="right">N</th>
                  <th className="right">Red wins</th>
                  <th className="right">Red rate</th>
                  <th className="right">Avg red</th>
                  <th className="right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {gaps.slice(0, 5).map((g, i) => (
                  <tr
                    key={g.attack_category}
                    className={i === 0 ? "coach-gap-row-top" : ""}
                  >
                    <td>
                      {g.attack_category}
                      {g.untested && (
                        <span
                          className="tag tag-warn tag-mini"
                          style={{ marginLeft: 8 }}
                        >
                          untested
                        </span>
                      )}
                      {i === 0 && !g.untested && (
                        <span
                          className="tag tag-red tag-mini"
                          style={{ marginLeft: 8 }}
                        >
                          weakest
                        </span>
                      )}
                    </td>
                    <td className="right">{g.n_runs}</td>
                    <td className="right" style={{ color: "var(--red)" }}>
                      {g.red_wins}
                    </td>
                    <td className="right">
                      {g.n_runs
                        ? `${(g.red_win_rate * 100).toFixed(0)}%`
                        : "-"}
                    </td>
                    <td className="right">
                      {g.n_runs ? g.avg_red_score.toFixed(1) : "-"}
                    </td>
                    <td className="right">
                      <code>{g.gap_score.toFixed(2)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {target && (
              <div className="coach-gap-target">
                Coach will bias toward <code>{target.attack_category}</code>{" "}
                {target.untested
                  ? "(never tested, highest-priority gap)."
                  : `(${(target.red_win_rate * 100).toFixed(
                      0
                    )}% red win rate, avg red score ${target.avg_red_score.toFixed(
                      0
                    )}).`}
              </div>
            )}
          </div>

          <div className="coach-run-panel">
            <div className="coach-run-head">
              <div>
                <div className="coach-run-eyebrow">Run Coach</div>
                <div className="coach-run-title">
                  {target ? (
                    <>
                      Author a new attacker for{" "}
                      <code>{target.attack_category}</code>
                    </>
                  ) : (
                    "No gap detected"
                  )}
                </div>
              </div>
              <button
                className="btn btn-red"
                disabled={running || !target}
                onClick={handleRun}
              >
                {running
                  ? "Generating..."
                  : hasKey
                  ? "Run live"
                  : "Run live (add key)"}
              </button>
            </div>

            {!hasKey && (
              <div className="coach-key-row">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setKeyOpen((v) => !v)}
                >
                  {keyOpen ? "Cancel" : "Add Anthropic API key"}
                </button>
                <span className="coach-key-hint">
                  key stays in this tab (sessionStorage), never sent to
                  Gauntlet servers
                </span>
              </div>
            )}
            {(keyOpen || hasKey) && (
              <div className="coach-key-input-row">
                <input
                  type="password"
                  className="coach-key-input"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setStoredKey(apiKey.trim() || null);
                    setKeyOpen(false);
                  }}
                >
                  Save
                </button>
                {hasKey && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setApiKey("");
                      setStoredKey(null);
                      setResult(null);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {error && <div className="coach-run-error">{error}</div>}

            {result && (
              <div className="coach-run-result">
                <div className="coach-run-result-head">
                  <span className="tag tag-red">
                    <SwordIcon size={12} /> Just authored
                  </span>
                  <strong>{result.persona_name}</strong>
                </div>
                <dl className="coach-run-dl">
                  <div>
                    <dt>Motive</dt>
                    <dd>{result.motive}</dd>
                  </div>
                  <div>
                    <dt>Tactic</dt>
                    <dd>{result.tactic_summary}</dd>
                  </div>
                  <div>
                    <dt>Opening line</dt>
                    <dd className="coach-quote">"{result.opening_line}"</dd>
                  </div>
                </dl>
                <div className="coach-run-note">
                  Preview only. To ship this persona into the corpus + batch
                  runner, run the CLI below and rebuild.
                </div>
              </div>
            )}

            <details className="coach-cli-details">
              <summary>Or run from your terminal</summary>
              <div className="coach-cli">
                <code>{cliCommand}</code>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard
                        .writeText(cliCommand)
                        .catch(() => {});
                    }
                  }}
                >
                  Copy
                </button>
              </div>
            </details>
          </div>

          {generated && (
            <section className="coach-latest">
              <div className="coach-result-head">
                <span className="tag tag-warn">
                  <SwordIcon size={12} /> Latest Coach-generated persona
                </span>
                <h3>{generated.transcript.persona_name}</h3>
              </div>
              <p className="modal-lede">
                The most recent persona Coach added to your library is
                already in rotation. Its taxonomy tags:
              </p>
              <div className="coach-result-grid">
                <div className="coach-card">
                  <div className="coach-card-label">Persona</div>
                  <div className="coach-card-value">
                    {generated.transcript.persona_name}
                  </div>
                </div>
                <div className="coach-card">
                  <div className="coach-card-label">Scenario</div>
                  <div className="coach-card-value">
                    {generated.transcript.scenario_name}
                  </div>
                </div>
                <div className="coach-card">
                  <div className="coach-card-label">Taxonomy coverage</div>
                  <div className="coach-card-value coach-tags">
                    {tagsFor(generated.transcript.persona_name).map((t) => (
                      <a
                        key={t.id}
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className="coach-tag"
                      >
                        {t.id}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
