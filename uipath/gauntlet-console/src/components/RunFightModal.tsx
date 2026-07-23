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
import {
  runFightViaDeployedAgents,
  fileBreachToActionCenter,
  fileToTestManager,
  getStoredKey,
  type FightTurn,
  type FightVerdict,
} from "../lib/fightRun";
import { setStoredKey } from "../lib/coachRun";
import { useUiPath, getFolderId, actionCenterTaskUrl } from "../lib/uipath";

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

type Tab = "single" | "batch" | "live";

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
            <button
              className={`run-tab ${tab === "live" ? "active" : ""}`}
              onClick={() => setTab("live")}
              title="Run a real fight against the deployed UiPath agents (Orchestrator jobs)"
            >
              ⚡ Live (UiPath)
            </button>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {tab === "single" && <SinglePanel onClose={onClose} />}
        {tab === "batch" && <BatchPanel onClose={onClose} />}
        {tab === "live" && <LiveFightPanel onClose={onClose} />}
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
          the corpus. Same conversation, same verdict, same evidence.
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
  status: "queued" | "running" | "done" | "skipped" | "error";
  liveVerdict?: FightVerdict | null; // set when run live against the deployed agents
  errorMsg?: string;
  filedTaskId?: number; // Action Center task id, when a Red win was auto-filed
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
  // Live-batch (deployed agents) state.
  const [engine, setEngine] = useState<"replay" | "live">("replay");
  const [keyInput, setKeyInput] = useState("");
  const { sdk, status: authStatus } = useUiPath();
  const abortRef = useRef<AbortController | null>(null);
  const hasStoredKey = !!getStoredKey();

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
      abortRef.current?.abort();
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
    if (engine === "live") runLiveBatch(initial);
    else runNext(initial, 0);
  };

  // Live batch: run each selected pair against the DEPLOYED agents in
  // sequence (each fight is several Orchestrator jobs), filling the table
  // with real verdicts as they complete.
  const runLiveBatch = async (initial: BatchRowState[]) => {
    const apiKey = keyInput.trim() || getStoredKey() || "";
    const fail = (msg: string) => {
      setRows(initial.map((r) => ({ ...r, status: "error", errorMsg: msg })));
      setPhase("complete");
    };
    if (!apiKey) return fail("Add your Anthropic API key (it powers Red).");
    if (!sdk) return fail("Sign in to UiPath to run live against the deployed agents.");
    if (keyInput.trim()) setStoredKey(keyInput.trim());
    const ac = new AbortController();
    abortRef.current = ac;
    let folderId: number | null = null;
    try {
      folderId = await getFolderId(sdk);
    } catch {
      folderId = null;
    }
    if (folderId === null) return fail("Could not resolve folder ID (needs the OR.Folders.Read scope).");

    let state = initial;
    for (let i = 0; i < state.length; i++) {
      if (ac.signal.aborted) break;
      state = state.map((r, idx) => (idx === i ? { ...r, status: "running" } : r));
      setRows(state);
      try {
        const outcome = await runFightViaDeployedAgents(
          {
            apiKey,
            personaName: state[i].pair.persona,
            scenarioPattern: state[i].pair.scenario,
            why: `${state[i].pair.persona} attacks MetroBank CSR`,
            blueMode: "standard",
            signal: ac.signal,
          },
          sdk,
          folderId
        );
        let filedTaskId: number | undefined;
        if (outcome.verdict.winner === "red") {
          try {
            filedTaskId = await fileBreachToActionCenter(sdk, folderId, {
              persona: state[i].pair.persona,
              scenario: state[i].pair.scenario,
              verdict: outcome.verdict,
              turns: outcome.turns,
              ranAtIso: new Date().toISOString(),
            });
          } catch {
            /* filing is best-effort; keep the verdict even if it fails */
          }
        }
        state = state.map((r, idx) =>
          idx === i ? { ...r, status: "done", liveVerdict: outcome.verdict, filedTaskId } : r
        );
      } catch (e) {
        if ((e as Error).name === "AbortError" || ac.signal.aborted) break;
        state = state.map((r, idx) =>
          idx === i
            ? { ...r, status: "error", errorMsg: e instanceof Error ? e.message : String(e) }
            : r
        );
      }
      setRows(state);
    }
    setPhase("complete");
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
    abortRef.current?.abort();
    setPhase("configure");
    setRows([]);
    setExpandedId(null);
  };

  if (phase === "configure") {
    return (
      <div className="modal-body">
        <p className="modal-lede">
          Run multiple adversarial calls back-to-back against the same blue
          posture. The regression-suite view in miniature. Capped at{" "}
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

        <div className="mode-picker" style={{ marginTop: 4 }}>
          <span className="config-label">Engine</span>
          <div className="mode-cards">
            <button
              className={`mode-card ${engine === "replay" ? "active" : ""} mode-ok`}
              onClick={() => setEngine("replay")}
            >
              <div className="mode-card-label">Replay (corpus)</div>
              <div className="mode-card-desc">Fast playback of the saved fights. No tenant calls.</div>
            </button>
            <button
              className={`mode-card ${engine === "live" ? "active" : ""} mode-warn`}
              onClick={() => setEngine("live")}
            >
              <div className="mode-card-label">⚡ Live (deployed agents)</div>
              <div className="mode-card-desc">
                Runs each fight for real against MetroBankCSR + RefereeAgent as
                Orchestrator jobs. About 1 to 2 minutes per fight.
              </div>
            </button>
          </div>
        </div>

        {engine === "live" && authStatus !== "ready" && (
          <div className="batch-empty">
            Not signed in to UiPath. Open this app from the portal (Apps -&gt; gauntletapp) to run live.
          </div>
        )}

        {engine === "live" && !hasStoredKey && (
          <input
            className="reg-key"
            type="password"
            placeholder="Anthropic API key (sk-ant-…, stays in this browser — powers Red)"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            style={{ margin: "4px 0" }}
          />
        )}

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
            disabled={selected.size === 0 || (engine === "live" && authStatus !== "ready")}
          >
            {engine === "live" ? "⚡ Run live batch" : "Run batch"} ({selected.size} fight
            {selected.size === 1 ? "" : "s"})
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
  const vof = (r: BatchRowState) => r.liveVerdict ?? r.fight?.verdict;
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const blue = rows.filter((r) => r.status === "done" && vof(r)?.winner === "blue").length;
  const red = rows.filter((r) => r.status === "done" && vof(r)?.winner === "red").length;
  const draw = rows.filter((r) => r.status === "done" && vof(r)?.winner === "draw").length;
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
        <div className="batch-summary-label">Draws</div>
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
  const v = row.liveVerdict ?? row.fight?.verdict;
  const winner = v?.winner;
  const canExpand = row.status === "done" && !!row.fight && !row.liveVerdict; // replay rows only
  return (
    <>
      <tr
        className={`batch-row batch-row-${row.status}`}
        onClick={() => canExpand && onToggle()}
        title={row.liveVerdict?.notes || row.errorMsg || undefined}
      >
        <td className="batch-row-num">{index + 1}</td>
        <td>
          <strong>{row.pair.persona}</strong>{" "}
          <span style={{ color: "var(--ink-3)" }}>×</span> {row.pair.scenario}
        </td>
        <td>
          {row.status === "queued" && <span className="tag tag-neutral">queued</span>}
          {row.status === "running" && <span className="tag tag-warn">running…</span>}
          {row.status === "error" && <span className="tag tag-red">error</span>}
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
            <span className="tag tag-warn">draw</span>
          )}
          {row.status === "done" && !v && (
            <span className="tag tag-neutral">no data</span>
          )}
          {row.filedTaskId ? (
            <a
              href={actionCenterTaskUrl(row.filedTaskId)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ marginLeft: 6, fontSize: 11, whiteSpace: "nowrap" }}
              title="Filed to Action Center"
            >
              → AC #{row.filedTaskId} ↗
            </a>
          ) : null}
        </td>
        <td className="right">{v?.blue_score ?? "-"}</td>
        <td className="right">{v?.red_score ?? "-"}</td>
      </tr>
      {open && canExpand && row.fight && (
        <tr className="batch-detail-row">
          <td colSpan={5}>
            <FightDetail fight={row.fight} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- Live fight vs the deployed UiPath agents ----------

type LivePhase = "idle" | "running" | "done" | "error";

type FileState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "created"; taskId: number; url: string }
  | { kind: "error"; message: string };

function LiveFightPanel({ onClose }: { onClose: () => void }) {
  const personas = useMemo(() => listPersonas(corpus), []);
  const [persona, setPersona] = useState(personas[0]?.name ?? "");
  const [scenario, setScenario] = useState(personas[0]?.scenarios[0] ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [phase, setPhase] = useState<LivePhase>("idle");
  const [turns, setTurns] = useState<FightTurn[]>([]);
  const [verdict, setVerdict] = useState<FightVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileState, setFileState] = useState<FileState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { sdk, status: authStatus } = useUiPath();
  const hasStoredKey = !!getStoredKey();
  const [tmState, setTmState] = useState<{
    kind: "idle" | "creating" | "created" | "error";
    key?: string;
    message?: string;
  }>({ kind: "idle" });

  const addToTestManager = async () => {
    if (!verdict || !sdk) {
      setTmState({ kind: "error", message: "Sign in to UiPath first." });
      return;
    }
    setTmState({ kind: "creating" });
    try {
      const c = await fileToTestManager(sdk, {
        persona,
        scenario,
        blueMode: "standard",
        verdict,
        turns,
      });
      setTmState({ kind: "created", key: c.key });
    } catch (e) {
      setTmState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    const p = personas.find((p) => p.name === persona);
    if (p && !p.scenarios.includes(scenario)) setScenario(p.scenarios[0] ?? "");
  }, [persona, personas, scenario]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, verdict]);

  const run = async () => {
    const apiKey = keyInput.trim() || getStoredKey() || "";
    if (!apiKey) {
      setError("Add your Anthropic API key (runs the Red attacker; stays in this browser).");
      setPhase("error");
      return;
    }
    if (!sdk) {
      setError("Sign in to UiPath to run against the deployed agents.");
      setPhase("error");
      return;
    }
    if (keyInput.trim()) setStoredKey(keyInput.trim());
    setPhase("running");
    setTurns([]);
    setVerdict(null);
    setError(null);
    setFileState({ kind: "idle" });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const folderId = await getFolderId(sdk);
      if (folderId === null) {
        throw new Error("Could not resolve folder ID (needs the OR.Folders.Read scope).");
      }
      const outcome = await runFightViaDeployedAgents(
        {
          apiKey,
          personaName: persona,
          scenarioPattern: scenario,
          why: `${persona} attacks MetroBank CSR`,
          blueMode: "standard",
          onTurn: (t) => setTurns((prev) => [...prev, t]),
          signal: ac.signal,
        },
        sdk,
        folderId
      );
      setVerdict(outcome.verdict);
      setPhase("done");
      // A landed attack (Red win) becomes an Action Center fix task — the
      // browser-native half of the flywheel (Test Manager stays CLI-driven).
      if (outcome.verdict.winner === "red") {
        setFileState({ kind: "creating" });
        try {
          const id = await fileBreachToActionCenter(sdk, folderId, {
            persona,
            scenario,
            verdict: outcome.verdict,
            turns: outcome.turns,
            ranAtIso: new Date().toISOString(),
          });
          setFileState({ kind: "created", taskId: id, url: id ? actionCenterTaskUrl(id, folderId) : "" });
        } catch (e) {
          setFileState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const stop = () => abortRef.current?.abort();

  const running = phase === "running";
  const pass = verdict?.winner === "blue";
  const fail = verdict?.winner === "red";

  return (
    <div className="modal-body">
      <p className="modal-lede">
        Run a <strong>real</strong> fight against the deployed UiPath agents: Red
        runs from your browser, while <strong>MetroBank CSR (Blue)</strong> and the{" "}
        <strong>Referee</strong> are the live Agent Builder agents in{" "}
        <code>Shared/Gauntlet</code>, invoked as Orchestrator jobs. Each turn is a
        real job, so a round takes a minute or two.
      </p>

      {authStatus !== "ready" && (
        <div className="reg-error" style={{ marginBottom: 12 }}>
          <span className="tag tag-warn">UiPath</span> Not signed in — open this app
          from the UiPath portal (Apps → gauntletapp) so it can start jobs as you.
        </div>
      )}

      <div className="config-grid">
        <div className="config-field">
          <label>Red persona</label>
          <select value={persona} disabled={running} onChange={(e) => setPersona(e.target.value)}>
            {personas.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="config-field">
          <label>Scenario</label>
          <select value={scenario} disabled={running} onChange={(e) => setScenario(e.target.value)}>
            {(personas.find((p) => p.name === persona)?.scenarios ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {!hasStoredKey && (
        <input
          className="reg-key"
          type="password"
          placeholder="Anthropic API key (sk-ant-…, stays in this browser — powers Red)"
          value={keyInput}
          disabled={running}
          onChange={(e) => setKeyInput(e.target.value)}
          style={{ marginTop: 10 }}
        />
      )}

      {(turns.length > 0 || running) && (
        <div
          ref={scrollRef}
          style={{
            marginTop: 14,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {turns.map((t, i) => (
            <div
              key={i}
              style={{
                alignSelf: t.speaker === "red" ? "flex-start" : "flex-end",
                maxWidth: "85%",
                background: t.speaker === "red"
                  ? "var(--red-soft, rgba(220,60,60,.08))"
                  : "var(--blue-soft, rgba(60,120,220,.08))",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "6px 10px",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
                {t.speaker === "red" ? persona : "Cara · deployed agent"}
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{t.content}</div>
            </div>
          ))}
          {running && (
            <div style={{ opacity: 0.6, fontSize: 12 }}>
              running… (each turn is a real Orchestrator job)
            </div>
          )}
        </div>
      )}

      {verdict && (
        <div
          className={`reg-verdict ${pass ? "reg-pass" : fail ? "reg-fail" : "reg-draw"}`}
          style={{ marginTop: 12 }}
        >
          <div className="reg-verdict-head">
            {pass ? (
              <><ShieldIcon size={16} /> BLUE held</>
            ) : fail ? (
              <><SwordIcon size={16} /> RED won</>
            ) : (
              <>Inconclusive</>
            )}
            <span className="reg-scores">
              Blue {verdict.blue_score} · Red {verdict.red_score}
            </span>
          </div>
          {verdict.policy_breaches.length > 0 && (
            <ul className="reg-breaches">
              {verdict.policy_breaches.map((b, i) => (<li key={i}>{b}</li>))}
            </ul>
          )}
          <div className="reg-notes">{verdict.notes}</div>
          <div className="reg-file" style={{ marginTop: 8 }}>
            {tmState.kind === "created" ? (
              <>
                <span className="tag tag-ok">
                  ✓ Test Manager case created{tmState.key ? ` (${tmState.key})` : ""}
                </span>
                <a href={tenant.testManagerProject} target="_blank" rel="noreferrer">
                  Open in Test Manager ↗
                </a>
              </>
            ) : (
              <button
                className="btn btn-outline btn-sm"
                onClick={addToTestManager}
                disabled={tmState.kind === "creating"}
                title="Create a Test Manager regression case from this fight"
              >
                {tmState.kind === "creating" ? "Adding…" : "Add to Test Manager"}
              </button>
            )}
            {tmState.kind === "error" && (
              <span className="reg-file-err">{tmState.message}</span>
            )}
          </div>
        </div>
      )}

      {verdict?.winner === "red" && fileState.kind !== "idle" && (
        <div className="reg-file" style={{ marginTop: 10 }}>
          {fileState.kind === "created" ? (
            <>
              <span className="tag tag-ok">
                ✓ Breach filed to Action Center
                {fileState.taskId ? ` #${fileState.taskId}` : ""}
              </span>
              {fileState.url && (
                <a href={fileState.url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                  Open in Action Center ↗
                </a>
              )}
            </>
          ) : fileState.kind === "creating" ? (
            <span className="tag tag-warn">Filing breach to Action Center…</span>
          ) : fileState.kind === "error" ? (
            <span className="reg-file-err">
              Could not file to Action Center: {fileState.message}
            </span>
          ) : null}
        </div>
      )}

      {error && (
        <div className="reg-error" style={{ marginTop: 12 }}>
          <span className="tag tag-red">Error</span> {error}
        </div>
      )}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        {running ? (
          <button className="btn btn-outline" onClick={stop}>Stop</button>
        ) : (
          <button className="btn btn-brand" onClick={run} disabled={authStatus !== "ready"}>
            {phase === "done" ? "Run another live fight" : "⚡ Run live fight"}
          </button>
        )}
      </div>
    </div>
  );
}
