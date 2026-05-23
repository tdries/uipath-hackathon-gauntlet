import "./RunFightModal.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { corpus } from "../data/corpus";
import { tenant } from "../data/tenant";
import type { BlueMode, FightRecord } from "../data/types";
import { FightDetail } from "./FightDetail";
import {
  cancel as cancelVoice,
  profileForSpeaker,
  speakUtterance,
  voiceIsEnabled,
} from "../lib/voice";
import { ShieldIcon, SwordIcon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
}

const BLUE_MODES: Array<{ value: BlueMode; label: string; desc: string; tone: string }> = [
  {
    value: "standard",
    label: "Standard",
    desc: "Sonnet 4.6, strict MetroBank policy. The agent the bank should ship.",
    tone: "ok",
  },
  {
    value: "lenient",
    label: "Lenient",
    desc: "Haiku 4.5, soft 'customer-first' prompt. The agent shipped after the satisfaction survey.",
    tone: "warn",
  },
  {
    value: "naive",
    label: "Naive",
    desc: "Haiku 4.5, 'first-call resolution' pressure. The agent shipped after the call-handle-time KPI.",
    tone: "alert",
  },
  {
    value: "external",
    label: "External (LangGraph)",
    desc: "Third-party deployment on LangGraph + Haiku 4.5, classify→respond graph, no tool access. Proves the test cloud is framework-neutral.",
    tone: "warn",
  },
];

const BATCH_CAP = 10;

interface PersonaOption {
  name: string;
  scenarios: string[];
}

function listPersonas(records: FightRecord[]): PersonaOption[] {
  const map = new Map<string, Set<string>>();
  for (const r of records) {
    if (!map.has(r.transcript.persona_name)) map.set(r.transcript.persona_name, new Set());
    map.get(r.transcript.persona_name)!.add(r.transcript.scenario_name);
  }
  return Array.from(map.entries())
    .map(([name, s]) => ({ name, scenarios: Array.from(s).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findFight(
  records: FightRecord[],
  persona: string,
  scenario: string,
  mode: BlueMode
): FightRecord | null {
  return (
    records.find(
      (r) =>
        r.transcript.persona_name === persona &&
        r.transcript.scenario_name === scenario &&
        (r.transcript.blue_mode ?? "standard") === mode
    ) ?? null
  );
}

type Tab = "single" | "batch";

export function RunFightModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("single");

  // Reset to single tab whenever the modal closes so the next open
  // doesn't strand the user mid-batch.
  useEffect(() => {
    if (!open) setTab("single");
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="run-tabs">
            <button
              className={`run-tab ${tab === "single" ? "active" : ""}`}
              onClick={() => setTab("single")}
            >
              Single fight
            </button>
            <button
              className={`run-tab ${tab === "batch" ? "active" : ""}`}
              onClick={() => setTab("batch")}
            >
              Batch (up to {BATCH_CAP})
            </button>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {tab === "single" && <SinglePanel onClose={onClose} />}
        {tab === "batch" && <BatchPanel onClose={onClose} />}
      </div>
    </div>
  );
}

// ---------- Single-fight panel ----------

type SinglePhase = "idle" | "launching" | "playing" | "complete";

function SinglePanel({ onClose }: { onClose: () => void }) {
  const personas = useMemo(() => listPersonas(corpus), []);
  const [persona, setPersona] = useState(personas[0]?.name ?? "");
  const [scenario, setScenario] = useState(personas[0]?.scenarios[0] ?? "");
  const [mode, setMode] = useState<BlueMode>("naive");
  const [phase, setPhase] = useState<SinglePhase>("idle");
  const [liveIndex, setLiveIndex] = useState(-1);
  const [playback, setPlayback] = useState<FightRecord | null>(null);
  const playbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const p = personas.find((p) => p.name === persona);
    if (p && !p.scenarios.includes(scenario)) {
      setScenario(p.scenarios[0] ?? "");
    }
  }, [persona, personas, scenario]);

  useEffect(() => {
    return () => {
      if (playbackRef.current) clearTimeout(playbackRef.current);
      cancelVoice();
    };
  }, []);

  const advance = async (fight: FightRecord, i: number) => {
    if (i >= fight.transcript.utterances.length) {
      setPhase("complete");
      return;
    }
    setLiveIndex(i);
    const u = fight.transcript.utterances[i];
    if (voiceIsEnabled()) {
      // Wait for the spoken audio to finish (or no-op if voice off /
      // unsupported), then move to the next utterance.
      const profile = profileForSpeaker(
        u.speaker,
        fight.transcript.persona_name
      );
      await speakUtterance(u.content, profile);
      // Short pause between speakers to feel like a conversation.
      playbackRef.current = setTimeout(() => advance(fight, i + 1), 300);
    } else {
      // Silent playback - simulate reading time so the user can
      // follow the transcript bubbles.
      const delay = Math.max(900, Math.min(3200, u.content.length * 14));
      playbackRef.current = setTimeout(() => advance(fight, i + 1), delay);
    }
  };

  const handleLaunch = () => {
    const fight = findFight(corpus, persona, scenario, mode);
    if (!fight) {
      alert(`No fight in the corpus for ${persona}/${scenario}/${mode}. Try another combo.`);
      return;
    }
    setPlayback(fight);
    setPhase("launching");
    setLiveIndex(-1);
    setTimeout(() => {
      setPhase("playing");
      advance(fight, 0);
    }, 900);
  };

  const handleSkip = () => {
    if (!playback) return;
    if (playbackRef.current) clearTimeout(playbackRef.current);
    cancelVoice();
    setLiveIndex(playback.transcript.utterances.length);
    setPhase("complete");
  };

  if (phase === "idle") {
    return (
      <div className="modal-body">
        <p className="modal-lede">
          Pick a red persona, a scenario, and the bank agent's policy posture.
          The console will replay the saved fight for those parameters from
          the corpus - same conversation, same verdict, same evidence.
        </p>

        <div className="config-grid">
          <div className="config-field">
            <label>Red persona</label>
            <select value={persona} onChange={(e) => setPersona(e.target.value)}>
              {personas.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="config-field">
            <label>Scenario</label>
            <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {(personas.find((p) => p.name === persona)?.scenarios ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mode-picker">
          <span className="config-label">Blue policy posture</span>
          <div className="mode-cards">
            {BLUE_MODES.map((m) => (
              <button
                key={m.value}
                className={`mode-card ${mode === m.value ? "active" : ""} mode-${m.tone}`}
                onClick={() => setMode(m.value)}
              >
                <div className="mode-card-label">{m.label}</div>
                <div className="mode-card-desc">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-brand" onClick={handleLaunch}>
            Replay this fight
          </button>
        </div>
      </div>
    );
  }

  if (phase === "launching") {
    return (
      <div className="modal-body launching">
        <div className="launch-stepper">
          <div className="step done">Resolving persona…</div>
          <div className="step done">Connecting to MetroBank CSR…</div>
          <div className="step current">Starting round…</div>
        </div>
      </div>
    );
  }

  if (playback) {
    return (
      <div className="modal-body playing">
        <div className="play-meta">
          <span className="tag tag-red">
            <SwordIcon size={11} /> {persona}
          </span>
          <span className="play-vs">vs</span>
          <span className="tag tag-blue">
            <ShieldIcon size={11} /> Cara · {mode}
          </span>
          <span className="play-sep">·</span>
          <span className="play-scenario">scenario: {scenario}</span>
          <div className="flex-grow" />
          {phase === "playing" && (
            <button className="btn btn-ghost btn-sm" onClick={handleSkip}>
              Skip to verdict ⤍
            </button>
          )}
        </div>
        <FightDetail fight={playback} liveIndex={liveIndex} />
        {phase === "complete" && (
          <div className="play-cta">
            <a
              className="btn btn-outline btn-sm"
              href={tenant.testManagerProject}
              target="_blank"
              rel="noreferrer"
            >
              Open as test case in Test Manager ↗
            </a>
            <a
              className="btn btn-outline btn-sm"
              href={tenant.studioWebSolution}
              target="_blank"
              rel="noreferrer"
            >
              Open the round in Maestro ↗
            </a>
            <button className="btn btn-brand btn-sm" onClick={() => setPhase("idle")}>
              Run another
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ---------- Batch panel ----------

interface BatchPair {
  persona: string;
  scenario: string;
}

type BatchPhase = "configure" | "running" | "complete";

interface BatchRowState {
  pair: BatchPair;
  fight: FightRecord | null;
  status: "queued" | "running" | "done" | "skipped";
}

function listAllPairs(records: FightRecord[], mode: BlueMode): BatchPair[] {
  const seen = new Set<string>();
  const out: BatchPair[] = [];
  for (const r of records) {
    const m = (r.transcript.blue_mode ?? "standard") as BlueMode;
    if (m !== mode) continue;
    const key = `${r.transcript.persona_name}|${r.transcript.scenario_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ persona: r.transcript.persona_name, scenario: r.transcript.scenario_name });
  }
  out.sort((a, b) =>
    a.persona === b.persona ? a.scenario.localeCompare(b.scenario) : a.persona.localeCompare(b.persona)
  );
  return out;
}

function BatchPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<BlueMode>("standard");
  const available = useMemo(() => listAllPairs(corpus, mode), [mode]);
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(listAllPairs(corpus, "standard").slice(0, 6).map((p) => `${p.persona}|${p.scenario}`))
  );
  const [phase, setPhase] = useState<BatchPhase>("configure");
  const [rows, setRows] = useState<BatchRowState[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the user switches blue modes, drop selections that no longer
  // exist in that mode's corpus.
  useEffect(() => {
    const keys = new Set(available.map((p) => `${p.persona}|${p.scenario}`));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (keys.has(k)) next.add(k);
      return next;
    });
  }, [available]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current);
    };
  }, []);

  const toggle = (pair: BatchPair) => {
    const key = `${pair.persona}|${pair.scenario}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < BATCH_CAP) {
        next.add(key);
      }
      return next;
    });
  };

  const selectPreset = (kind: "first6" | "redwins" | "clear") => {
    if (kind === "clear") {
      setSelected(new Set());
      return;
    }
    if (kind === "first6") {
      setSelected(new Set(available.slice(0, 6).map((p) => `${p.persona}|${p.scenario}`)));
      return;
    }
    if (kind === "redwins") {
      const redKeys = corpus
        .filter(
          (r) =>
            r.verdict.winner === "red" &&
            (r.transcript.blue_mode ?? "standard") === mode
        )
        .map((r) => `${r.transcript.persona_name}|${r.transcript.scenario_name}`)
        .slice(0, BATCH_CAP);
      setSelected(new Set(redKeys));
    }
  };

  const launchBatch = () => {
    const pairs: BatchPair[] = [];
    for (const k of selected) {
      const [persona, scenario] = k.split("|");
      pairs.push({ persona, scenario });
    }
    if (pairs.length === 0) return;
    const initial: BatchRowState[] = pairs.map((pair) => ({
      pair,
      fight: findFight(corpus, pair.persona, pair.scenario, mode),
      status: "queued",
    }));
    setRows(initial);
    setPhase("running");
    setExpandedId(null);
    runNext(initial, 0);
  };

  const runNext = (state: BatchRowState[], idx: number) => {
    if (idx >= state.length) {
      setPhase("complete");
      return;
    }
    const next = state.map((r, i) => ({
      ...r,
      status: i === idx ? "running" : i < idx ? "done" : "queued",
    } as BatchRowState));
    setRows(next);
    // 850ms per fight - fast enough to feel like a batch, slow enough
    // to read the row update.
    tickRef.current = setTimeout(() => {
      const done = next.map((r, i) => ({
        ...r,
        status: i === idx ? "done" : r.status,
      } as BatchRowState));
      setRows(done);
      tickRef.current = setTimeout(() => runNext(done, idx + 1), 200);
    }, 850);
  };

  const reset = () => {
    if (tickRef.current) clearTimeout(tickRef.current);
    setPhase("configure");
    setRows([]);
    setExpandedId(null);
  };

  if (phase === "configure") {
    return (
      <div className="modal-body">
        <p className="modal-lede">
          Run multiple adversarial calls back-to-back against the same blue
          posture - the regression-suite view in miniature. Capped at{" "}
          <strong>{BATCH_CAP}</strong> fights to keep each batch quick.
        </p>

        <div className="mode-picker">
          <span className="config-label">Blue policy posture</span>
          <div className="mode-cards">
            {BLUE_MODES.map((m) => (
              <button
                key={m.value}
                className={`mode-card ${mode === m.value ? "active" : ""} mode-${m.tone}`}
                onClick={() => setMode(m.value)}
              >
                <div className="mode-card-label">{m.label}</div>
                <div className="mode-card-desc">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="batch-pickbar">
          <span className="config-label">
            Fights to run ({selected.size} / {BATCH_CAP})
          </span>
          <div className="batch-presets">
            <button
              className="batch-preset"
              onClick={() => selectPreset("first6")}
            >
              Canonical 6
            </button>
            <button
              className="batch-preset"
              onClick={() => selectPreset("redwins")}
            >
              Red wins only
            </button>
            <button
              className="batch-preset"
              onClick={() => selectPreset("clear")}
            >
              Clear
            </button>
          </div>
        </div>

        {available.length === 0 && (
          <div className="batch-empty">
            No fights in the corpus for blue mode <code>{mode}</code> yet.
          </div>
        )}

        {available.length > 0 && (
          <ul className="batch-pairs">
            {available.map((p) => {
              const key = `${p.persona}|${p.scenario}`;
              const checked = selected.has(key);
              const atCap = !checked && selected.size >= BATCH_CAP;
              return (
                <li key={key} className={atCap ? "batch-pair-disabled" : ""}>
                  <label className="batch-pair">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => toggle(p)}
                    />
                    <span className="batch-pair-persona">{p.persona}</span>
                    <span className="batch-pair-sep">×</span>
                    <span className="batch-pair-scenario">{p.scenario}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-brand"
            onClick={launchBatch}
            disabled={selected.size === 0}
          >
            Run batch ({selected.size} fight{selected.size === 1 ? "" : "s"})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-body">
      <div className="batch-progress">
        <BatchSummary rows={rows} mode={mode} />
        <BatchTable
          rows={rows}
          expandedId={expandedId}
          onExpand={(id) => setExpandedId(id === expandedId ? null : id)}
        />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={reset}>
          Configure another batch
        </button>
        <button className="btn btn-brand" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function BatchSummary({ rows, mode }: { rows: BatchRowState[]; mode: BlueMode }) {
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const blue = rows.filter((r) => r.status === "done" && r.fight?.verdict.winner === "blue").length;
  const red = rows.filter((r) => r.status === "done" && r.fight?.verdict.winner === "red").length;
  const draw = rows.filter((r) => r.status === "done" && r.fight?.verdict.winner === "draw").length;
  return (
    <div className="batch-summary">
      <div>
        <div className="batch-summary-label">Blue posture</div>
        <div className="batch-summary-value">{mode}</div>
      </div>
      <div>
        <div className="batch-summary-label">Progress</div>
        <div className="batch-summary-value">
          {done} / {total}
        </div>
      </div>
      <div>
        <div className="batch-summary-label">Defended</div>
        <div className="batch-summary-value" style={{ color: "var(--ok)" }}>
          {blue}
        </div>
      </div>
      <div>
        <div className="batch-summary-label">Breached</div>
        <div className="batch-summary-value" style={{ color: "var(--red)" }}>
          {red}
        </div>
      </div>
      <div>
        <div className="batch-summary-label">- Draws</div>
        <div className="batch-summary-value">{draw}</div>
      </div>
    </div>
  );
}

function BatchTable({
  rows,
  expandedId,
  onExpand,
}: {
  rows: BatchRowState[];
  expandedId: string | null;
  onExpand: (id: string) => void;
}) {
  return (
    <div className="batch-table-wrap">
      <table className="table batch-table">
        <thead>
          <tr>
            <th></th>
            <th>Red persona × scenario</th>
            <th>Status</th>
            <th className="right">Blue</th>
            <th className="right">Red</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const id = `${r.pair.persona}|${r.pair.scenario}`;
            const open = expandedId === id;
            return (
              <Row
                key={id}
                row={r}
                index={i}
                open={open}
                onToggle={() => onExpand(id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  index,
  open,
  onToggle,
}: {
  row: BatchRowState;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const fight = row.fight;
  const winner = fight?.verdict.winner;
  return (
    <>
      <tr
        className={`batch-row batch-row-${row.status}`}
        onClick={() => row.status === "done" && fight && onToggle()}
      >
        <td className="batch-row-num">{index + 1}</td>
        <td>
          <strong>{row.pair.persona}</strong>{" "}
          <span style={{ color: "var(--ink-3)" }}>×</span> {row.pair.scenario}
        </td>
        <td>
          {row.status === "queued" && <span className="tag tag-neutral">queued</span>}
          {row.status === "running" && <span className="tag tag-warn">running…</span>}
          {row.status === "done" && winner === "blue" && (
            <span className="tag tag-ok">
              <ShieldIcon size={10} /> BLUE held
            </span>
          )}
          {row.status === "done" && winner === "red" && (
            <span className="tag tag-red">
              <SwordIcon size={10} /> RED won
            </span>
          )}
          {row.status === "done" && winner === "draw" && (
            <span className="tag tag-warn">- draw</span>
          )}
          {row.status === "done" && !fight && (
            <span className="tag tag-neutral">no replay data</span>
          )}
        </td>
        <td className="right">{fight?.verdict.blue_score ?? "-"}</td>
        <td className="right">{fight?.verdict.red_score ?? "-"}</td>
      </tr>
      {open && fight && (
        <tr className="batch-detail-row">
          <td colSpan={5}>
            <FightDetail fight={fight} />
          </td>
        </tr>
      )}
    </>
  );
}
