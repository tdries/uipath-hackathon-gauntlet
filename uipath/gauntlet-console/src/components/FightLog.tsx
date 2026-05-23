import "./FightLog.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { corpus } from "../data/corpus";
import type { FightRecord, Winner } from "../data/types";
import { FightDetail } from "./FightDetail";
import { ShieldIcon, SwordIcon } from "./Icon";

function fightSearchHaystack(f: FightRecord): string {
  // One-time concat so the hot filter loop doesn't repeatedly walk
  // the transcript. Cached by useMemo in the consumer.
  const parts = [
    f.transcript.fight_id,
    f.transcript.persona_name,
    f.transcript.scenario_name,
    f.transcript.blue_mode ?? "standard",
    f.transcript.end_reason ?? "",
    f.verdict.notes ?? "",
    f.verdict.attack_category,
    ...(f.verdict.policy_breaches ?? []),
    ...(f.verdict.deterministic_findings ?? []),
    ...f.transcript.utterances.map((u) => u.content),
    f.fix_proposal?.summary ?? "",
    f.fix_proposal?.root_cause?.tactic ?? "",
  ];
  return parts.join("\n").toLowerCase();
}

const MODES = ["all", "standard", "lenient", "naive", "external"] as const;
const WINNERS: Array<{ value: "all" | Winner; label: string; tone: string }> = [
  { value: "all", label: "All", tone: "neutral" },
  { value: "red", label: "Red wins", tone: "red" },
  { value: "blue", label: "Blue holds", tone: "blue" },
  { value: "draw", label: "Draws", tone: "neutral" },
];

interface Props {
  initialFilter?: { winner?: "all" | Winner; mode?: (typeof MODES)[number] };
  onOpenFix?: (fightId: string) => void;
  onOpenPersona?: (persona: string) => void;
}

export function FightLog({ initialFilter, onOpenFix, onOpenPersona }: Props = {}) {
  const [winner, setWinner] = useState<"all" | Winner>(
    initialFilter?.winner ?? "all"
  );
  const [mode, setMode] = useState<(typeof MODES)[number]>(
    initialFilter?.mode ?? "all"
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const rowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());

  // Precompute haystacks once per fight so search filtering is fast.
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of corpus) {
      const id = f.transcript.fight_id || "";
      map.set(id, fightSearchHaystack(f));
    }
    return map;
  }, []);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return corpus.filter((f) => {
      if (winner !== "all" && f.verdict.winner !== winner) return false;
      if (mode !== "all" && (f.transcript.blue_mode ?? "standard") !== mode)
        return false;
      if (needle) {
        const hay = haystacks.get(f.transcript.fight_id) ?? "";
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [winner, mode, search, haystacks]);

  // Permalink support: on mount, read window.location.hash and open
  // the matching fight if any. Also update the hash when the user
  // expands a row so the URL is shareable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = /#fight=([\w-]+)/.exec(window.location.hash);
    if (!match) return;
    const id = match[1];
    const exists = corpus.some((f) => f.transcript.fight_id === id);
    if (!exists) return;
    setOpenId(id);
    // Defer scroll until after expand renders the detail row.
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!openId) return;
    const newHash = `#fight=${openId}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
  }, [openId]);

  const copyPermalink = (id: string) => {
    const url = new URL(window.location.href);
    url.hash = `fight=${id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url.toString()).catch(() => {});
    }
  };

  return (
    <section className="fightlog-section" id="log">
      <div className="wrap">
        <h2>Every adversarial call we've ever run</h2>
        <p className="section-lede">
          Click any row to expand the full transcript, the referee's verdict,
          and the policy breaches we detected. Rows tagged with a severity pill
          have a Fix Recommender proposal attached. Click "View fix" to
          jump straight to the patch.
        </p>

        <div className="filter-bar">
          <div className="filter-group filter-search">
            <input
              type="search"
              className="fightlog-search"
              placeholder="Search transcripts, personas, policy breaches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <span className="filter-label">Winner</span>
            {WINNERS.map((w) => (
              <button
                key={w.value}
                className={`filter-chip ${winner === w.value ? "active" : ""}`}
                onClick={() => setWinner(w.value)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="filter-group">
            <span className="filter-label">Blue mode</span>
            {MODES.map((m) => (
              <button
                key={m}
                className={`filter-chip ${mode === m ? "active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex-grow" />
          <span className="result-count">
            {rows.length} of {corpus.length} fights
          </span>
        </div>

        <table className="table fightlog">
          <thead>
            <tr>
              <th>Started (UTC)</th>
              <th>Persona</th>
              <th>Blue mode</th>
              <th>Outcome</th>
              <th className="right">Blue</th>
              <th className="right">Red</th>
              <th className="right">Turns</th>
              <th>Fix proposal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f: FightRecord, i) => {
              const id = f.transcript.fight_id || String(i);
              const isOpen = openId === id;
              const started = f.transcript.started_at?.slice(0, 16).replace("T", " ");
              const fix = f.fix_proposal;
              return (
                <Fragment key={id}>
                  <tr
                    ref={(el) => { rowRefs.current.set(id, el); }}
                    className={`fight-row ${isOpen ? "open" : ""}`}
                    onClick={() => setOpenId(isOpen ? null : id)}
                  >
                    <td><code>{started}</code></td>
                    <td>
                      {onOpenPersona ? (
                        <button
                          className="persona-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPersona(f.transcript.persona_name);
                          }}
                        >
                          {f.transcript.persona_name}
                        </button>
                      ) : (
                        f.transcript.persona_name
                      )}
                    </td>
                    <td><span className="tag tag-neutral">{f.transcript.blue_mode ?? "standard"}</span></td>
                    <td>
                      {f.verdict.winner === "red" && (
                        <span className="tag tag-red">
                          <SwordIcon size={11} /> RED won
                        </span>
                      )}
                      {f.verdict.winner === "blue" && (
                        <span className="tag tag-blue">
                          <ShieldIcon size={11} /> BLUE held
                        </span>
                      )}
                      {f.verdict.winner === "draw" && <span className="tag tag-warn">- draw</span>}
                    </td>
                    <td className="right">{f.verdict.blue_score}</td>
                    <td className="right">{f.verdict.red_score}</td>
                    <td className="right">{f.transcript.utterances.length}</td>
                    <td>
                      {fix ? (
                        <button
                          className="fix-pill-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFix?.(fix.fight_id);
                          }}
                          title={fix.summary}
                        >
                          <span className={`sev-pill sev-${fix.taxonomy.severity}`}>
                            {fix.taxonomy.severity}
                          </span>
                          <span>View fix</span>
                        </button>
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>-</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row">
                      <td colSpan={8}>
                        <div className="fightlog-detail-actions">
                          <code className="fightlog-detail-id">
                            fight_id: {f.transcript.fight_id}
                          </code>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => copyPermalink(id)}
                            title="Copy a permalink to this fight to clipboard"
                          >
                            Copy permalink
                          </button>
                        </div>
                        <FightDetail fight={f} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--ink-3)", padding: "32px" }}>
                  No fights match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
