import "./RegressionRunner.css";
import { useEffect, useRef, useState } from "react";
import type { BlueMode, FightRecord, FixProposal, RegressionTest } from "../data/types";
import {
  runRegression,
  runFightViaDeployedAgents,
  fileToTestManager,
  getStoredKey,
  type FightTurn,
  type FightVerdict,
} from "../lib/fightRun";
import { setStoredKey } from "../lib/coachRun";
import { useUiPath, getFolderId, actionCenterTaskUrl } from "../lib/uipath";
import { tenant } from "../data/tenant";
import { ShieldIcon, SwordIcon } from "./Icon";

interface Props {
  test: RegressionTest;
  fix: FixProposal;
  fight: FightRecord;
  onClose: () => void;
}

type Status = "idle" | "running" | "done" | "error";

type FileState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "created"; taskId: number; url: string }
  | { kind: "error"; message: string };

const MODES: BlueMode[] = ["standard", "lenient", "naive"];

export function RegressionRunner({ test, fix, fight, onClose }: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [patched, setPatched] = useState(true);
  const [blueMode, setBlueMode] = useState<BlueMode>(
    (fight.transcript.blue_mode as BlueMode) ?? fix.blue_mode ?? "standard"
  );
  // "browser" = Blue+Referee simulated by browser LLM calls; "deployed" = the
  // REAL deployed MetroBankCSR + RefereeAgent invoked as Orchestrator jobs.
  const [engine, setEngine] = useState<"browser" | "deployed">("browser");
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<FightTurn[]>([]);
  const [verdict, setVerdict] = useState<FightVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileState, setFileState] = useState<FileState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { sdk } = useUiPath();

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
        persona: test.persona_pattern,
        scenario: test.scenario_pattern,
        blueMode,
        verdict,
        turns,
      });
      setTmState({ kind: "created", key: c.key });
    } catch (e) {
      setTmState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, verdict]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    const apiKey = keyInput.trim() || getStoredKey() || "";
    if (!apiKey) {
      setError("Add your Anthropic API key to run a live fight (stays in this browser).");
      setStatus("error");
      return;
    }
    if (keyInput.trim()) setStoredKey(keyInput.trim());
    setStatus("running");
    setTurns([]);
    setVerdict(null);
    setError(null);
    setFileState({ kind: "idle" });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let outcome;
      if (engine === "deployed") {
        if (!sdk) throw new Error("Sign in to UiPath to run against the deployed agents.");
        const folderId = await getFolderId(sdk);
        if (folderId === null) {
          throw new Error("Could not resolve folder ID (needs the OR.Folders.Read scope).");
        }
        outcome = await runFightViaDeployedAgents(
          {
            apiKey,
            personaName: test.persona_pattern,
            scenarioPattern: test.scenario_pattern,
            why: test.why,
            blueMode,
            onTurn: (t) => setTurns((prev) => [...prev, t]),
            signal: ac.signal,
          },
          sdk,
          folderId
        );
      } else {
        outcome = await runRegression({
          apiKey,
          personaName: test.persona_pattern,
          scenarioPattern: test.scenario_pattern,
          why: test.why,
          blueMode,
          patchLines: patched ? fix.prompt_patch.patch_lines : null,
          onTurn: (t) => setTurns((prev) => [...prev, t]),
          signal: ac.signal,
        });
      }
      setVerdict(outcome.verdict);
      setStatus("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const stop = () => abortRef.current?.abort();

  // Persist the executed regression to UiPath. The browser SDK can create
  // Action Center tasks (not Test Manager cases), so this files a real task
  // carrying the attack, the live PASS/FAIL, and the transcript.
  const fileToActionCenter = async () => {
    if (!verdict) return;
    if (!sdk) {
      setFileState({
        kind: "error",
        message: "Not signed in to UiPath. Sign in to file this to Action Center.",
      });
      return;
    }
    setFileState({ kind: "creating" });
    try {
      const folderId = await getFolderId(sdk);
      if (folderId === null) {
        throw new Error("Could not resolve folder ID (needs the OR.Folders.Read scope).");
      }
      const outcome =
        verdict.winner === "blue" ? "PASS" : verdict.winner === "red" ? "FAIL" : "DRAW";
      const title = `[regression ${outcome}] ${test.persona_pattern}`.slice(0, 90);
      const created = await sdk.tasks.create(
        {
          title,
          data: {
            kind: "gauntlet_regression_run",
            fight_id: fix.fight_id,
            persona: test.persona_pattern,
            scenario: test.scenario_pattern,
            blue_mode: blueMode,
            patched,
            gauntlet_command: test.gauntlet_command,
            outcome,
            winner: verdict.winner,
            blue_score: verdict.blue_score,
            red_score: verdict.red_score,
            policy_breaches: verdict.policy_breaches.join("\n"),
            notes: verdict.notes,
            owasp_llm_top_10: fix.taxonomy.owasp_llm_top_10,
            mitre_atlas: fix.taxonomy.mitre_atlas,
            transcript: turns
              .map((t) => `[${t.speaker.toUpperCase()}] ${t.content}`)
              .join("\n\n")
              .slice(0, 6000),
            ran_at: new Date().toISOString(),
          },
        },
        folderId
      );
      const taskId = (created as { id?: number }).id ?? 0;
      setFileState({
        kind: "created",
        taskId,
        url: taskId ? actionCenterTaskUrl(taskId, folderId) : "",
      });
    } catch (e) {
      setFileState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const pass = verdict?.winner === "blue";
  const fail = verdict?.winner === "red";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reg-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head reg-head">
          <div>
            <div className="reg-title">Run regression</div>
            <div className="reg-sub">
              <span className="tag tag-red">
                <SwordIcon size={11} /> {test.persona_pattern}
              </span>
              <span className="reg-x">×</span>
              <span className="reg-scn">{test.scenario_pattern}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body reg-body">
          <p className="reg-why">{test.why}</p>

          <div className="reg-controls">
            <label className="reg-toggle">
              <input
                type="checkbox"
                checked={patched}
                disabled={status === "running"}
                onChange={(e) => setPatched(e.target.checked)}
              />
              <span>
                Against <strong>patched</strong> agent
                <span className="reg-hint"> (uses the proposed prompt patch)</span>
              </span>
            </label>

            <div className="reg-mode">
              <span className="reg-mode-label">Blue posture</span>
              {MODES.map((m) => (
                <button
                  key={m}
                  className={`reg-mode-btn ${blueMode === m ? "active" : ""}`}
                  disabled={status === "running" || engine === "deployed"}
                  onClick={() => setBlueMode(m)}
                  title={engine === "deployed" ? "The deployed agent has its own (standard) policy — posture applies to the browser engine only" : undefined}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="reg-mode">
              <span className="reg-mode-label">Engine</span>
              <button
                className={`reg-mode-btn ${engine === "browser" ? "active" : ""}`}
                disabled={status === "running"}
                onClick={() => setEngine("browser")}
                title="Blue + Referee simulated by browser LLM calls"
              >
                browser LLM
              </button>
              <button
                className={`reg-mode-btn ${engine === "deployed" ? "active" : ""}`}
                disabled={status === "running"}
                onClick={() => setEngine("deployed")}
                title="Blue + Referee = the real deployed UiPath agents, run as Orchestrator jobs"
              >
                deployed agents
              </button>
            </div>
          </div>

          {engine === "deployed" && (
            <p className="reg-hint">
              Blue and Referee are the <strong>real deployed UiPath agents</strong>{" "}
              (MetroBankCSR + RefereeAgent, run as Orchestrator jobs in Shared/Gauntlet).
              Red runs from your browser. Posture and patch apply to the browser engine
              only. Each turn is a real job, so this is slower than the browser engine.
            </p>
          )}

          {!hasStoredKey && (
            <input
              className="reg-key"
              type="password"
              placeholder="Anthropic API key (sk-ant-…, stays in this browser)"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              disabled={status === "running"}
            />
          )}

          {(turns.length > 0 || status === "running") && (
            <div className="reg-transcript" ref={scrollRef}>
              {turns.map((t, i) => (
                <div key={i} className={`reg-bubble reg-${t.speaker}`}>
                  <span className="reg-who">
                    {t.speaker === "red" ? (
                      <>
                        <SwordIcon size={10} /> {test.persona_pattern.split(" ")[0]}
                      </>
                    ) : (
                      <>
                        <ShieldIcon size={10} /> Cara · {engine === "deployed" ? "deployed" : blueMode}
                        {engine !== "deployed" && patched && (
                          <span className="reg-patch-tag">patched</span>
                        )}
                        {engine === "deployed" && <span className="reg-patch-tag">live agent</span>}
                      </>
                    )}
                  </span>
                  <div className="reg-text">{t.content}</div>
                </div>
              ))}
              {status === "running" && (
                <div className="reg-thinking">
                  <span className="reg-dot" />
                  <span className="reg-dot" />
                  <span className="reg-dot" />
                </div>
              )}
            </div>
          )}

          {verdict && (
            <div
              className={`reg-verdict ${pass ? "reg-pass" : fail ? "reg-fail" : "reg-draw"}`}
            >
              <div className="reg-verdict-head">
                {pass && (
                  <>
                    <ShieldIcon size={16} /> PASS — {patched ? "patch holds" : "blue held"}
                  </>
                )}
                {fail && (
                  <>
                    <SwordIcon size={16} /> FAIL — {patched ? "patch insufficient, still leaks" : "blue breached"}
                  </>
                )}
                {!pass && !fail && <>Inconclusive</>}
                <span className="reg-scores">
                  Blue {verdict.blue_score} · Red {verdict.red_score}
                </span>
              </div>
              {verdict.policy_breaches.length > 0 && (
                <ul className="reg-breaches">
                  {verdict.policy_breaches.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              <div className="reg-notes">{verdict.notes}</div>
              <div className="reg-file">
                {fileState.kind === "created" ? (
                  <>
                    <span className="tag tag-ok">
                      ✓ Filed to Action Center{fileState.taskId ? ` #${fileState.taskId}` : ""}
                    </span>
                    {fileState.url && (
                      <a href={fileState.url} target="_blank" rel="noreferrer">
                        Open in Action Center ↗
                      </a>
                    )}
                  </>
                ) : (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={fileToActionCenter}
                    disabled={fileState.kind === "creating"}
                    title="Creates a real Action Center task carrying this attack + its live PASS/FAIL result"
                  >
                    {fileState.kind === "creating"
                      ? "Filing…"
                      : "File regression → Action Center"}
                  </button>
                )}
                {fileState.kind === "error" && (
                  <span className="reg-file-err">{fileState.message}</span>
                )}
              </div>
              <div className="reg-file" style={{ marginTop: 6 }}>
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

          {error && (
            <div className="reg-error">
              <span className="tag tag-red">Error</span> {error}
            </div>
          )}
        </div>

        <div className="modal-actions reg-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {status === "running" ? (
            <button className="btn btn-outline" onClick={stop}>
              Stop
            </button>
          ) : (
            <button className="btn btn-brand" onClick={run}>
              {status === "done" ? "Run again" : "▶ Run live"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
