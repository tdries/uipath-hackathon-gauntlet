// Analytics - mature dashboard with temporal series, ranking tables,
// and KPI tiles. All derived from the static corpus; no live API
// calls. Hand-rolled SVG charts (no external deps) so the bundle
// stays small.

import "./Analytics.css";
import { Fragment, useMemo } from "react";
import {
  dailyFightCounts,
  severityOverTime,
  asrByModeOverTime,
  personaRanking,
  modeRanking,
  coverageTrajectory,
  fixLifecycle,
  kpis,
  shortDate,
  firstFightDate,
  latestFightDate,
  personaModeHeatmap,
  type PersonaModeHeatmap,
} from "../data/analytics";
import { SystemUnderTest } from "./SystemUnderTest";

const BLUE_COLOR = "#0079BF";
const RED_COLOR = "#D8252C";
const WARN_COLOR = "#B17A00";
const INK_3 = "#7D9199";

interface AnalyticsProps {
  onOpenPersona?: (persona: string) => void;
}

export function Analytics({ onOpenPersona }: AnalyticsProps = {}) {
  const k = useMemo(kpis, []);
  const daily = useMemo(dailyFightCounts, []);
  const sevSeries = useMemo(severityOverTime, []);
  const asrByMode = useMemo(asrByModeOverTime, []);
  const personas = useMemo(personaRanking, []);
  const modes = useMemo(modeRanking, []);
  const trajectory = useMemo(coverageTrajectory, []);
  const fixCycle = useMemo(fixLifecycle, []);
  const heatmap = useMemo(personaModeHeatmap, []);
  const first = useMemo(firstFightDate, []);
  const last = useMemo(latestFightDate, []);

  return (
    <section className="analytics-section" id="dashboard">
      <div className="wrap">
        <div className="analytics-head">
          <div>
            <SystemUnderTest variant="badge" />
            {first && last && first !== last && (
              <p className="analytics-window">
                {shortDate(first)} - {shortDate(last)}
              </p>
            )}
          </div>
          <KpiBlock k={k} />
        </div>

        <div className="analytics-hero">
          <HeatmapCard data={heatmap} onOpenPersona={onOpenPersona} />
        </div>

        <div className="analytics-grid">
          <Card title="Adversarial calls per day" sub="Stacked by outcome">
            <DailyStackedBars data={daily} />
          </Card>

          <Card title="Fix-recommender pipeline" sub="Red wins -> diagnoses">
            <FixLifecycleTile cycle={fixCycle} k={k} />
          </Card>

          <Card title="Severity discovered per day" sub="Stacked by tier">
            <SeverityBars data={sevSeries} />
          </Card>

          <Card title="Attack success rate by blue posture" sub="ASR per mode over time">
            <AsrLines data={asrByMode} />
          </Card>

          <Card
            title="Coverage trajectory"
            sub="Unique attack categories tested over time"
          >
            <CoverageLine data={trajectory} />
          </Card>

          <Card title="Robustness score" sub="1 - ASR, all modes combined">
            <BigStat
              value={(k.robustness * 100).toFixed(1) + "%"}
              footer={`${k.red} successful / ${k.total} total`}
              tone={k.robustness > 0.95 ? "ok" : k.robustness > 0.85 ? "warn" : "alert"}
            />
          </Card>
        </div>

        <div className="analytics-tables">
          <div>
            <div className="analytics-table-head">
              <h3 className="analytics-h3">Persona danger ladder</h3>
              <span className="analytics-vs">
                vs <strong>MetroBankCSR</strong> on Agent Builder
              </span>
            </div>
            <table className="table analytics-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="right">N</th>
                  <th className="right">Red</th>
                  <th className="right">Red rate</th>
                  <th className="right">Avg red</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => (
                  <tr key={p.persona}>
                    <td>
                      {onOpenPersona ? (
                        <button
                          className="persona-link"
                          onClick={() => onOpenPersona(p.persona)}
                        >
                          {p.persona}
                        </button>
                      ) : (
                        p.persona
                      )}
                    </td>
                    <td className="right">{p.n}</td>
                    <td className="right" style={{ color: RED_COLOR }}>
                      {p.red}
                    </td>
                    <td
                      className="right"
                      style={{
                        color: p.red_rate > 0 ? RED_COLOR : INK_3,
                      }}
                    >
                      {(p.red_rate * 100).toFixed(0)}%
                    </td>
                    <td className="right">{p.avg_red_score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="analytics-table-head">
              <h3 className="analytics-h3">Blue posture comparison</h3>
              <span className="analytics-vs">
                same suite vs <strong>MetroBankCSR</strong>, varying posture
              </span>
            </div>
            <table className="table analytics-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th className="right">N</th>
                  <th className="right">Blue</th>
                  <th className="right">Red</th>
                  <th className="right">Red rate</th>
                  <th className="right">Avg blue</th>
                </tr>
              </thead>
              <tbody>
                {modes.map((m) => (
                  <tr key={m.mode}>
                    <td>
                      <span className="tag tag-neutral">{m.mode}</span>
                    </td>
                    <td className="right">{m.n}</td>
                    <td className="right" style={{ color: BLUE_COLOR }}>
                      {m.blue}
                    </td>
                    <td className="right" style={{ color: RED_COLOR }}>
                      {m.red}
                    </td>
                    <td
                      className="right"
                      style={{ color: m.red_rate > 0 ? RED_COLOR : INK_3 }}
                    >
                      {(m.red_rate * 100).toFixed(0)}%
                    </td>
                    <td className="right">{m.avg_blue.toFixed(1)}</td>
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

// ---------- KPI block ----------

function KpiBlock({ k }: { k: ReturnType<typeof kpis> }) {
  return (
    <div className="kpi-block">
      <div className="kpi">
        <span>Total calls</span>
        <strong>{k.total.toLocaleString()}</strong>
      </div>
      <div className="kpi">
        <span>Red wins</span>
        <strong style={{ color: RED_COLOR }}>{k.red}</strong>
      </div>
      <div className="kpi">
        <span>Defended</span>
        <strong style={{ color: BLUE_COLOR }}>{k.blue}</strong>
      </div>
      <div className="kpi">
        <span>Personas</span>
        <strong>{k.personas}</strong>
      </div>
      <div className="kpi">
        <span>Scenarios</span>
        <strong>{k.scenarios}</strong>
      </div>
      <div className="kpi">
        <span>Modes</span>
        <strong>{k.modes}</strong>
      </div>
    </div>
  );
}

// ---------- Generic card ----------

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="analytics-card">
      <header>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </header>
      <div className="analytics-card-body">{children}</div>
    </article>
  );
}

// ---------- Daily stacked bars ----------

function DailyStackedBars({ data }: { data: ReturnType<typeof dailyFightCounts> }) {
  if (data.length === 0) {
    return <Empty>No fights yet.</Empty>;
  }
  const maxN = Math.max(...data.map((d) => d.total), 1);
  const W = 100; // viewBox width units
  const H = 60;
  const innerH = 50;
  const bw = W / Math.max(data.length, 1);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        {data.map((d, i) => {
          const x = i * bw;
          const totalH = (d.total / maxN) * innerH;
          let y = innerH - totalH;
          const blueH = (d.blue / maxN) * innerH;
          const redH = (d.red / maxN) * innerH;
          const drawH = (d.draw / maxN) * innerH;
          const yBlue = y;
          const yDraw = yBlue + blueH;
          const yRed = yDraw + drawH;
          return (
            <g key={d.date}>
              <title>{`${shortDate(d.date)}: ${d.blue} blue, ${d.red} red, ${d.draw} draw`}</title>
              {blueH > 0 && (
                <rect x={x + 0.2} y={yBlue} width={bw - 0.4} height={blueH} fill={BLUE_COLOR} />
              )}
              {drawH > 0 && (
                <rect x={x + 0.2} y={yDraw} width={bw - 0.4} height={drawH} fill="#D5D5D5" />
              )}
              {redH > 0 && (
                <rect x={x + 0.2} y={yRed} width={bw - 0.4} height={redH} fill={RED_COLOR} />
              )}
            </g>
          );
        })}
      </svg>
      <ChartAxis labels={data.map((d) => shortDate(d.date))} />
      <Legend
        items={[
          { color: BLUE_COLOR, label: "Defended" },
          { color: RED_COLOR, label: "Breached" },
          { color: "#D5D5D5", label: "Draw" },
        ]}
      />
    </div>
  );
}

// ---------- Severity stacked bars ----------

function SeverityBars({ data }: { data: ReturnType<typeof severityOverTime> }) {
  if (data.length === 0) {
    return <Empty>No fix proposals yet.</Empty>;
  }
  const maxN = Math.max(
    ...data.map((d) => d.critical + d.high + d.medium + d.low),
    1
  );
  const W = 100;
  const H = 60;
  const innerH = 50;
  const bw = W / Math.max(data.length, 1);
  const SEV_COLOR = {
    critical: "#8B0000",
    high: RED_COLOR,
    medium: WARN_COLOR,
    low: INK_3,
  };
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        {data.map((d, i) => {
          const x = i * bw;
          let y = innerH;
          const segments: Array<[keyof typeof SEV_COLOR, number]> = [
            ["low", d.low],
            ["medium", d.medium],
            ["high", d.high],
            ["critical", d.critical],
          ];
          return (
            <g key={d.date}>
              <title>{`${shortDate(d.date)}: critical=${d.critical}, high=${d.high}, medium=${d.medium}, low=${d.low}`}</title>
              {segments.map(([sev, n]) => {
                if (!n) return null;
                const h = (n / maxN) * innerH;
                y -= h;
                return (
                  <rect
                    key={sev}
                    x={x + 0.2}
                    y={y}
                    width={bw - 0.4}
                    height={h}
                    fill={SEV_COLOR[sev]}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <ChartAxis labels={data.map((d) => shortDate(d.date))} />
      <Legend
        items={[
          { color: SEV_COLOR.critical, label: "Critical" },
          { color: SEV_COLOR.high, label: "High" },
          { color: SEV_COLOR.medium, label: "Medium" },
          { color: SEV_COLOR.low, label: "Low" },
        ]}
      />
    </div>
  );
}

// ---------- ASR per mode lines ----------

function AsrLines({ data }: { data: ReturnType<typeof asrByModeOverTime> }) {
  if (data.length === 0) {
    return <Empty>No fights yet.</Empty>;
  }
  // Pivot to per-mode time series.
  const modes = Array.from(new Set(data.map((d) => d.mode)));
  const days = Array.from(new Set(data.map((d) => d.date))).sort();
  const seriesByMode = new Map<string, number[]>();
  for (const m of modes) {
    const arr: number[] = days.map((d) => {
      const hit = data.find((x) => x.date === d && x.mode === m);
      return hit ? hit.rate : 0;
    });
    seriesByMode.set(m, arr);
  }
  const W = 100;
  const H = 60;
  const innerH = 50;
  const colorOf: Record<string, string> = {
    standard: BLUE_COLOR,
    lenient: WARN_COLOR,
    naive: RED_COLOR,
    external: "#7B61FF",
  };
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={0}
            x2={W}
            y1={innerH - g * innerH}
            y2={innerH - g * innerH}
            stroke="#E6F1F5"
            strokeWidth={0.3}
          />
        ))}
        {Array.from(seriesByMode.entries()).map(([mode, arr]) => {
          if (arr.every((v) => v === 0)) return null;
          const pts = arr
            .map((v, i) => {
              const x = days.length === 1 ? W / 2 : (i / (days.length - 1)) * W;
              const y = innerH - v * innerH;
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polyline
              key={mode}
              fill="none"
              stroke={colorOf[mode] ?? INK_3}
              strokeWidth={1.2}
              points={pts}
            />
          );
        })}
      </svg>
      <ChartAxis labels={days.map((d) => shortDate(d))} />
      <Legend
        items={Array.from(seriesByMode.keys()).map((m) => ({
          color: colorOf[m] ?? INK_3,
          label: m,
        }))}
      />
    </div>
  );
}

// ---------- Coverage trajectory ----------

function CoverageLine({ data }: { data: ReturnType<typeof coverageTrajectory> }) {
  if (data.length === 0) {
    return <Empty>No fights yet.</Empty>;
  }
  const maxC = Math.max(...data.map((d) => d.categories), 1);
  const W = 100;
  const H = 60;
  const innerH = 50;
  const pts = data
    .map((d, i) => {
      const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
      const y = innerH - (d.categories / maxC) * innerH;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        <polyline fill="none" stroke={BLUE_COLOR} strokeWidth={1.4} points={pts} />
        <polygon
          points={`${pts} ${data.length === 1 ? W / 2 : W},${innerH} 0,${innerH}`}
          fill={BLUE_COLOR}
          fillOpacity={0.12}
        />
      </svg>
      <ChartAxis labels={data.map((d) => shortDate(d.date))} />
      <div className="chart-current">
        {data[data.length - 1].categories} attack categor
        {data[data.length - 1].categories === 1 ? "y" : "ies"} tested to date
      </div>
    </div>
  );
}

// ---------- Fix lifecycle tile ----------

function FixLifecycleTile({
  cycle,
  k,
}: {
  cycle: ReturnType<typeof fixLifecycle>;
  k: ReturnType<typeof kpis>;
}) {
  const pct = cycle.total_red_wins
    ? cycle.diagnosed / cycle.total_red_wins
    : 1;
  return (
    <div className="fix-cycle">
      <div className="fix-cycle-stack">
        <div className="fix-cycle-row">
          <span className="fix-cycle-label">Red wins on file</span>
          <strong style={{ color: RED_COLOR }}>{cycle.total_red_wins}</strong>
        </div>
        <div className="fix-cycle-row">
          <span className="fix-cycle-label">Auto-diagnosed</span>
          <strong style={{ color: BLUE_COLOR }}>{cycle.diagnosed}</strong>
        </div>
        <div className="fix-cycle-row">
          <span className="fix-cycle-label">Pending diagnosis</span>
          <strong>{cycle.remaining}</strong>
        </div>
        <div className="fix-cycle-row">
          <span className="fix-cycle-label">Total fix proposals</span>
          <strong>{k.withFix}</strong>
        </div>
      </div>
      <div className="fix-cycle-bar-wrap">
        <div className="fix-cycle-bar-label">
          {Math.round(pct * 100)}% of red wins have a drafted fix
        </div>
        <div className="fix-cycle-bar">
          <div
            className="fix-cycle-bar-fill"
            style={{ width: `${Math.max(pct * 100, 4)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Generic helpers ----------

function ChartAxis({ labels }: { labels: string[] }) {
  // Only render first, middle, last to avoid clutter
  if (labels.length === 0) return null;
  const first = labels[0];
  const mid = labels[Math.floor(labels.length / 2)];
  const last = labels[labels.length - 1];
  const same = first === last;
  return (
    <div className="chart-axis">
      <span>{first}</span>
      {!same && labels.length > 2 && <span>{mid}</span>}
      {!same && <span>{last}</span>}
    </div>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label} className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function BigStat({
  value,
  footer,
  tone,
}: {
  value: string;
  footer: string;
  tone: "ok" | "warn" | "alert";
}) {
  return (
    <div className={`big-stat big-stat-${tone}`}>
      <div className="big-stat-value">{value}</div>
      <div className="big-stat-footer">{footer}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="chart-empty">{children}</div>;
}

// ---------- Persona x Mode heatmap (hero card) ----------

function HeatmapCard({
  data,
  onOpenPersona,
}: {
  data: PersonaModeHeatmap;
  onOpenPersona?: (persona: string) => void;
}) {
  if (data.cells.length === 0) {
    return (
      <article className="analytics-card analytics-heat-card">
        <header>
          <h3>Where each attacker beats each blue policy</h3>
          <p>Heatmap of red win rate by persona x blue posture.</p>
        </header>
        <div className="analytics-card-body">
          <Empty>No fights yet.</Empty>
        </div>
      </article>
    );
  }
  const personasReverse = [...data.personas].reverse();
  return (
    <article className="analytics-card analytics-heat-card">
      <header>
        <h3>Persona × posture heatmap</h3>
        <p>Cell color = red win rate. Cell number = fights run.</p>
      </header>
      <div className="analytics-card-body">
        <div
          className="heatmap"
          style={{
            gridTemplateColumns: `minmax(160px, 1fr) repeat(${data.modes.length}, 1fr)`,
          }}
        >
          <div className="heatmap-cell heatmap-corner" />
          {data.modes.map((m) => (
            <div key={m} className="heatmap-cell heatmap-mode-header">
              {m}
            </div>
          ))}
          {personasReverse.map((persona) => (
            <Fragment key={persona}>
              <div className="heatmap-cell heatmap-persona-header" title={persona}>
                {onOpenPersona ? (
                  <button
                    className="persona-link persona-link-heatmap"
                    onClick={() => onOpenPersona(persona)}
                  >
                    {persona}
                  </button>
                ) : (
                  persona
                )}
              </div>
              {data.modes.map((mode) => {
                const cell = data.index.get(`${persona}|${mode}`);
                return (
                  <HeatmapCellView
                    key={`${persona}|${mode}`}
                    persona={persona}
                    mode={mode}
                    cell={cell}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="heatmap-legend">
          <span>0% red wins</span>
          <span className="heatmap-legend-bar" />
          <span>100%</span>
        </div>
      </div>
    </article>
  );
}

function HeatmapCellView({
  persona,
  mode,
  cell,
}: {
  persona: string;
  mode: string;
  cell?: { n: number; red: number; blue: number; draw: number; red_rate: number };
}) {
  if (!cell || cell.n === 0) {
    return (
      <div
        className="heatmap-cell heatmap-empty-cell"
        title={`${persona} x ${mode}: not tested yet`}
      >
        <span className="heatmap-num">-</span>
      </div>
    );
  }
  // Interpolate between green (no red wins) and red (all red wins)
  const rate = cell.red_rate;
  // Lighten so text stays readable
  const bg = rate === 0
    ? "rgba(27, 122, 27, 0.10)"
    : rate < 0.34
      ? `rgba(177, 122, 0, ${0.18 + rate * 0.5})`
      : `rgba(216, 37, 44, ${0.18 + rate * 0.7})`;
  const fg = rate >= 0.5 ? "white" : "var(--ink)";
  return (
    <div
      className="heatmap-cell heatmap-data-cell"
      style={{ background: bg, color: fg }}
      title={`${persona} x ${mode}: ${cell.n} fight${cell.n === 1 ? "" : "s"}, ${cell.red} red, ${cell.blue} blue, ${cell.draw} draw (${(rate * 100).toFixed(0)}% red rate)`}
    >
      <span className="heatmap-num">{cell.n}</span>
      <span className="heatmap-rate">{(rate * 100).toFixed(0)}%</span>
    </div>
  );
}
