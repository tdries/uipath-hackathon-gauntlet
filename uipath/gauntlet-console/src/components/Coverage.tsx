import "./Coverage.css";
import { useMemo } from "react";
import { corpus } from "../data/corpus";
import { OWASP, ATLAS, tagsFor } from "../data/taxonomy";

interface CoverageRow {
  id: string;
  name: string;
  url: string;
  attempts: number;
  redWins: number;
}

function buildCoverage(framework: typeof OWASP | typeof ATLAS): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const tag of Object.values(framework)) {
    let attempts = 0;
    let redWins = 0;
    for (const f of corpus) {
      const tags = tagsFor(f.transcript.persona_name);
      if (tags.some((t) => t.id === tag.id)) {
        attempts++;
        if (f.verdict.winner === "red") redWins++;
      }
    }
    rows.push({ id: tag.id, name: tag.name, url: tag.url, attempts, redWins });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function statusFor(row: CoverageRow): { label: string; tone: "ok" | "covered" | "uncovered" | "vuln" } {
  if (row.attempts === 0) return { label: "Not yet tested", tone: "uncovered" };
  if (row.redWins > 0) return { label: `${row.redWins} breach${row.redWins === 1 ? "" : "es"}`, tone: "vuln" };
  return { label: `${row.attempts} call${row.attempts === 1 ? "" : "s"} defended`, tone: "ok" };
}

export function Coverage() {
  const owaspRows = useMemo(() => buildCoverage(OWASP), []);
  const atlasRows = useMemo(() => buildCoverage(ATLAS), []);

  return (
    <section className="coverage-section" id="coverage">
      <div className="wrap">
        <h2>Coverage: OWASP LLM Top 10 &amp; MITRE ATLAS</h2>
        <p className="section-lede">
          Compliance buyers grade adversarial testing by these taxonomies. Each
          persona declares which classes of risk it exercises so we can show
          coverage <em>and</em> gaps. Untested rows are the next priorities for
          Coach to author.
        </p>

        <div className="coverage-grid">
          <CoverageTable
            framework="OWASP LLM Top 10 (2025)"
            rows={owaspRows}
            chip="OWASP"
          />
          <CoverageTable
            framework="MITRE ATLAS"
            rows={atlasRows}
            chip="ATLAS"
          />
        </div>
      </div>
    </section>
  );
}

interface TableProps {
  framework: string;
  rows: CoverageRow[];
  chip: string;
}

function CoverageTable({ framework, rows, chip }: TableProps) {
  const tested = rows.filter((r) => r.attempts > 0).length;
  const broken = rows.filter((r) => r.redWins > 0).length;
  return (
    <div className="coverage-block">
      <div className="coverage-block-head">
        <h3>{framework}</h3>
        <div className="coverage-summary">
          <span className="coverage-stat">
            <strong>{tested}/{rows.length}</strong> tested
          </span>
          <span className="coverage-stat">
            <strong className={broken > 0 ? "vuln-num" : ""}>{broken}</strong> breached
          </span>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Technique</th>
            <th className="right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = statusFor(r);
            return (
              <tr key={r.id}>
                <td>
                  <a href={r.url} target="_blank" rel="noreferrer" className="tax-id">
                    {r.id}
                  </a>{" "}
                  <span className="tax-chip">{chip}</span>
                  <div className="tax-name">{r.name}</div>
                </td>
                <td className="right">
                  <span className={`tag tag-${s.tone === "ok" ? "ok" : s.tone === "vuln" ? "red" : "neutral"}`}>
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
