// CoverageMatrix - what we cover vs honestly don't, against the 8
// modules of the AAA (Adversarial Attack Analyzer) reference spec
// the user is benchmarking GAUNTLET against.
//
// This is the audit-ready answer to "is this just a hackathon demo or
// a real product?" The matrix names every module by spec number,
// shows current evidence from the live corpus, and explicitly flags
// roadmap / not-applicable items. No vapourware.

import "./CoverageMatrix.css";
import { useMemo } from "react";
import { specCoverage, statusSummary, type SpecModule } from "../data/specCoverage";

const STATUS_LABELS: Record<SpecModule["status"], string> = {
  covered: "Covered",
  partial: "Partial",
  roadmap: "Roadmap",
  n_a: "Not applicable",
};

export function CoverageMatrix() {
  const modules = useMemo(
    () => specCoverage().filter((m) => m.status !== "n_a"),
    [],
  );
  const summary = useMemo(() => statusSummary(modules), [modules]);

  return (
    <section className="cm-section" id="spec-coverage">
      <div className="wrap">
        <div className="cm-head">
          <div>
            <span className="cm-eyebrow">Audit posture</span>
            <h2>What kinds of attacks we test for</h2>
            <p className="section-lede">
              Categories of adversarial testing applicable to this agent, for
              each one, you'll see whether we cover it today (green), partially
              cover it (amber), or have it on the roadmap (blue). Numbers come
              from the live corpus.
            </p>
          </div>
          <div className="cm-summary">
            <div className="cm-summary-pill cm-summary-covered">
              <strong>{summary.covered}</strong>
              <span>covered</span>
            </div>
            <div className="cm-summary-pill cm-summary-partial">
              <strong>{summary.partial}</strong>
              <span>partial</span>
            </div>
            <div className="cm-summary-pill cm-summary-roadmap">
              <strong>{summary.roadmap}</strong>
              <span>roadmap</span>
            </div>
          </div>
        </div>

        <div className="cm-grid">
          {modules.map((m) => (
            <article key={m.id} className={`cm-card cm-card-${m.status}`}>
              <header className="cm-card-head">
                <div className="cm-card-id">
                  <span className="cm-card-number">{m.number}</span>
                  <span className={`cm-card-status cm-card-status-${m.status}`}>
                    {STATUS_LABELS[m.status]}
                  </span>
                </div>
                <h3>{m.name}</h3>
              </header>
              <p className="cm-card-desc">{m.description}</p>
              <p className="cm-card-caveat">{m.why_or_caveat}</p>
              <dl className="cm-card-metrics">
                {m.metrics.map((metric) => (
                  <div key={metric.label} className="cm-metric">
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                    {metric.sub && <small>{metric.sub}</small>}
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
