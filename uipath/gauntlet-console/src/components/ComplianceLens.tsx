// ComplianceLens - ISO 27001 / 42001 / 23894 / 25059 / 27032 + NIST
// AI RMF, each rendered as a card listing the controls/clauses
// GAUNTLET maps to, with computed evidence counts from the live
// corpus.
//
// A tab-style picker switches between frameworks; the active one
// gets a card per mapped control. Status lights match the Spec
// Coverage matrix so judges can read the two views in the same
// language.

import "./ComplianceLens.css";
import { useMemo, useState } from "react";
import { FRAMEWORKS, type Control } from "../data/compliance";
import { corpus } from "../data/corpus";
import { downloadEvidencePack } from "../lib/evidencePack";
import {
  downloadCef,
  downloadStix,
  downloadSbom,
} from "../lib/siemExport";
import { DownloadIcon } from "./Icon";

const STATUS_LABELS: Record<Control["status"], string> = {
  covered: "Covered",
  partial: "Partial",
  roadmap: "Roadmap",
  n_a: "Not applicable",
};

interface SeverityDist {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function severityDistribution(): SeverityDist {
  const out: SeverityDist = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of corpus) {
    const s = f.fix_proposal?.taxonomy?.severity?.toLowerCase();
    if (s === "critical" || s === "high" || s === "medium" || s === "low") {
      out[s] += 1;
    }
  }
  return out;
}

export function ComplianceLens() {
  const [activeId, setActiveId] = useState(FRAMEWORKS[0].id);
  const active = FRAMEWORKS.find((f) => f.id === activeId) ?? FRAMEWORKS[0];
  const distribution = useMemo(severityDistribution, []);

  const visibleControls = useMemo(
    () => active.controls.filter((c) => c.status !== "n_a"),
    [active],
  );

  const counts = useMemo(() => {
    const out: Record<Control["status"], number> = {
      covered: 0,
      partial: 0,
      roadmap: 0,
      n_a: 0,
    };
    for (const c of visibleControls) out[c.status]++;
    return out;
  }, [visibleControls]);

  const scrollTo = (id?: string) => {
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="cl-section" id="compliance-lens">
      <div className="wrap">
        <div className="cl-head">
          <div>
            <span className="cl-eyebrow">Compliance</span>
            <h2>Does this meet your auditors' standards?</h2>
            <p className="section-lede">
              The standards procurement teams actually ask about: ISO 42001,
              NIST AI RMF, and four more. Pick a framework: each card lists
              the controls we touch, the honest status, and a "Show evidence"
              link that scrolls to the exact place in this console where the
              evidence lives.
            </p>
            <div className="cl-exports">
              <span className="cl-exports-label">Auditor downloads:</span>
              <button
                className="btn btn-brand btn-sm cl-download"
                onClick={() => downloadEvidencePack()}
                title="Markdown audit pack: summary, ASR by mode, spec coverage, every fix proposal, full corpus CSV appendix."
              >
                <DownloadIcon size={13} /> Evidence pack (.md)
              </button>
              <button
                className="btn btn-outline btn-sm cl-download"
                onClick={() => downloadCef()}
                title="CEF event stream for SIEM ingestion (Splunk, ArcSight, Sentinel via CEF connector). One line per fight, severity = AVSS."
              >
                <DownloadIcon size={13} /> SIEM stream (CEF)
              </button>
              <button
                className="btn btn-outline btn-sm cl-download"
                onClick={() => downloadStix()}
                title="STIX 2.1 bundle for threat-intel pipelines (MISP, TAXII). One attack-pattern per fight, one vulnerability per fix proposal."
              >
                <DownloadIcon size={13} /> Threat intel (STIX 2.1)
              </button>
              <button
                className="btn btn-outline btn-sm cl-download"
                onClick={() => downloadSbom()}
                title="AI Software Bill of Materials: every model, framework, persona, and scenario version that participated in the corpus."
              >
                <DownloadIcon size={13} /> AI SBOM
              </button>
            </div>
          </div>
          <FindingsDist dist={distribution} />
        </div>

        <div className="cl-tabs" role="tablist">
          {FRAMEWORKS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={f.id === activeId}
              className={`cl-tab ${f.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(f.id)}
            >
              <span className="cl-tab-short">{f.short}</span>
              <span className="cl-tab-long">{f.long}</span>
            </button>
          ))}
        </div>

        <div className="cl-active">
          <div className="cl-active-head">
            <div>
              <h3>{active.short} · <span className="cl-active-long">{active.long}</span></h3>
              <p className="cl-scope">{active.scope}</p>
            </div>
            <div className="cl-active-summary">
              <span className="cl-pill cl-pill-covered">{counts.covered} covered</span>
              <span className="cl-pill cl-pill-partial">{counts.partial} partial</span>
              {counts.roadmap > 0 && (
                <span className="cl-pill cl-pill-roadmap">{counts.roadmap} roadmap</span>
              )}
              {counts.n_a > 0 && (
                <span className="cl-pill cl-pill-na">{counts.n_a} n/a</span>
              )}
            </div>
          </div>

          <div className="cl-control-list">
            {visibleControls.map((c) => (
              <article key={c.ref} className={`cl-control cl-control-${c.status}`}>
                <header className="cl-control-head">
                  <div>
                    <span className="cl-ref">{c.ref}</span>
                    <h4>{c.name}</h4>
                  </div>
                  <span className={`cl-status cl-status-${c.status}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </header>
                <p className="cl-evidence">{c.evidence}</p>
                {c.targetId && (
                  <button className="cl-jump" onClick={() => scrollTo(c.targetId)}>
                    Show evidence →
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FindingsDist({ dist }: { dist: SeverityDist }) {
  const total = dist.critical + dist.high + dist.medium + dist.low;
  if (total === 0) return null;
  return (
    <aside className="cl-dist">
      <div className="cl-dist-label">finding severity distribution</div>
      <div className="cl-dist-bars">
        <DistBar label="Critical" value={dist.critical} total={total} tone="critical" />
        <DistBar label="High" value={dist.high} total={total} tone="high" />
        <DistBar label="Medium" value={dist.medium} total={total} tone="medium" />
        <DistBar label="Low" value={dist.low} total={total} tone="low" />
      </div>
      <div className="cl-dist-total">{total} fix proposals</div>
    </aside>
  );
}

interface BarProps {
  label: string;
  value: number;
  total: number;
  tone: "critical" | "high" | "medium" | "low";
}
function DistBar({ label, value, total, tone }: BarProps) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="cl-bar">
      <span className="cl-bar-label">{label}</span>
      <div className="cl-bar-track">
        <div
          className={`cl-bar-fill cl-bar-${tone}`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="cl-bar-value">{value}</span>
    </div>
  );
}
