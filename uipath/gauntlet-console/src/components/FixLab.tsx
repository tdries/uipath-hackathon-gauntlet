import "./FixLab.css";
import { useEffect, useMemo, useState } from "react";
import { corpus } from "../data/corpus";
import { tenant } from "../data/tenant";
import { OWASP, ATLAS } from "../data/taxonomy";
import type { FightRecord, FixProposal } from "../data/types";
import {
  actionCenterFolderUrl,
  actionCenterTaskUrl,
  getFolderId,
  useUiPath,
} from "../lib/uipath";
import { rememberCreatedTask } from "../lib/triageStore";
import { computeAvss } from "../data/avss";
import { SwordIcon } from "./Icon";

interface Props {
  /** When set, the matching proposal becomes the active selection.
   *  The section is always mounted - this just shifts focus. */
  focusFightId?: string | null;
  /** Click the persona name in the detail header to open the
   *  persona modal. */
  onOpenPersona?: (persona: string) => void;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

interface DiagnosedFight {
  fight: FightRecord;
  fix: FixProposal;
}

function listDiagnosed(records: FightRecord[]): DiagnosedFight[] {
  const out: DiagnosedFight[] = [];
  for (const f of records) {
    if (f.fix_proposal) out.push({ fight: f, fix: f.fix_proposal });
  }
  out.sort((a, b) => {
    const sa = SEVERITY_ORDER.indexOf(a.fix.taxonomy.severity);
    const sb = SEVERITY_ORDER.indexOf(b.fix.taxonomy.severity);
    if (sa !== sb) return sa - sb;
    const wa = a.fight.verdict.winner === "red" ? 0 : 1;
    const wb = b.fight.verdict.winner === "red" ? 0 : 1;
    if (wa !== wb) return wa - wb;
    return (b.fight.transcript.started_at ?? "").localeCompare(
      a.fight.transcript.started_at ?? ""
    );
  });
  return out;
}

function lookupTaxonomy(id: string) {
  // Accept "LLM06", "LLM06:2025", "AML.T0051" etc.
  const compact = id.replace(/:.*/, "").replace("AML.", "");
  const owasp = OWASP[compact as keyof typeof OWASP];
  if (owasp) return owasp;
  // ATLAS keys in the taxonomy module are "T0051" (no AML. prefix)
  const atlasKey = compact.startsWith("T") ? compact : compact;
  const atlas = ATLAS[atlasKey as keyof typeof ATLAS];
  return atlas;
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

export function FixLab({ focusFightId, onOpenPersona }: Props) {
  const diagnosed = useMemo(() => listDiagnosed(corpus), []);
  const [selectedId, setSelectedId] = useState<string | null>(
    focusFightId ?? diagnosed[0]?.fix.fight_id ?? null
  );

  // When a parent passes a new focus id (e.g. Fight Log "View fix"
  // click) update the selection.
  useEffect(() => {
    if (focusFightId) setSelectedId(focusFightId);
  }, [focusFightId]);

  const selected =
    diagnosed.find((d) => d.fix.fight_id === selectedId) ?? diagnosed[0] ?? null;

  return (
    <section className="fixlab-section" id="fix-lab">
      <div className="wrap">
        <header className="fixlab-section-head">
          <div>
            <span className="fixlab-eyebrow">When blue loses</span>
            <h2>Fix Recommender</h2>
            <p className="section-lede">
              An Opus 4.7 agent reads the failed fight plus the blue system
              prompt, diagnoses the seam that cracked, and drafts a concrete
              prompt patch with regression tests that prove the patch doesn't
              break legitimate flows.
            </p>
          </div>
        </header>

        {diagnosed.length === 0 && (
          <p className="empty">
            No fix proposals in the corpus yet. Run{" "}
            <code>gauntlet fix --all-red-wins</code> to generate them, then
            rebuild the console.
          </p>
        )}

        {diagnosed.length > 0 && selected && (
          <div className="fixlab-section-body">
            <aside className="fixlab-list">
              <div className="fixlab-list-head">
                {diagnosed.length} diagnosed fight{diagnosed.length === 1 ? "" : "s"}
              </div>
              {diagnosed.map(({ fight, fix }) => {
                const active = fix.fight_id === selected.fix.fight_id;
                return (
                  <button
                    key={fix.fight_id}
                    className={`fixlab-list-row ${active ? "active" : ""}`}
                    onClick={() => setSelectedId(fix.fight_id)}
                  >
                    <span className={`sev-pill sev-${fix.taxonomy.severity}`}>
                      {fix.taxonomy.severity}
                    </span>
                    <span className="fixlab-list-persona">
                      {fight.transcript.persona_name}
                    </span>
                    <span className="fixlab-list-mode">
                      {fight.transcript.blue_mode ?? "standard"}
                    </span>
                    {fight.verdict.winner === "red" && (
                      <span className="tag tag-red tag-mini">
                        <SwordIcon size={10} /> RED won
                      </span>
                    )}
                    {fight.verdict.winner === "blue" && (
                      <span className="tag tag-warn tag-mini">close call</span>
                    )}
                  </button>
                );
              })}
            </aside>

            <article className="fixlab-detail">
              <FixProposalView
                fix={selected.fix}
                fight={selected.fight}
                onOpenPersona={onOpenPersona}
              />
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

interface ViewProps {
  fix: FixProposal;
  fight: FightRecord;
  onOpenPersona?: (persona: string) => void;
}

type CreateState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "created"; taskId: number; url: string; folderUrl: string }
  | { kind: "saved_local"; reason: string }
  | { kind: "error"; message: string };

function isUnauthorized(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /not authorized|unauthor[iz]ed|401|403|forbidden/i.test(msg);
}

function localTaskId(): number {
  // Negative IDs so they never collide with real Orchestrator ids.
  return -Math.floor(Date.now() % 1_000_000);
}

function FixProposalView({ fix, fight, onOpenPersona }: ViewProps) {
  const breakTurnUtterance =
    fight.transcript.utterances[fix.root_cause.break_turn];
  const { sdk } = useUiPath();
  const [create, setCreate] = useState<CreateState>({ kind: "idle" });

  const taskUrl = `${tenant.testManagerProject}?gauntlet=create&fightId=${encodeURIComponent(
    fix.fight_id
  )}`;

  const rememberLocally = (taskId: number, folderId?: number | null) => {
    rememberCreatedTask({
      id: taskId,
      title: fix.test_manager.task_title.slice(0, 90),
      fightId: fix.fight_id,
      persona: fix.persona_name,
      blueMode: fix.blue_mode,
      severity: fix.taxonomy.severity,
      owasp: fix.taxonomy.owasp_llm_top_10,
      createdAt: new Date().toISOString(),
      folderId: folderId ?? undefined,
    });
  };

  const handleCreateTask = async () => {
    if (!sdk) {
      // No SDK at all - store locally so the proposal isn't lost.
      const tid = localTaskId();
      rememberLocally(tid);
      setCreate({
        kind: "saved_local",
        reason:
          "Not authenticated to UiPath yet. Saved to the local triage queue so it isn't lost - refresh after sign-in to push it live.",
      });
      return;
    }
    setCreate({ kind: "creating" });
    try {
      const folderId = await getFolderId(sdk);
      if (folderId === null) {
        throw new Error(
          "Could not resolve numeric folder ID - check the meta tag and OR.Folders.Read scope."
        );
      }
      const created = await sdk.tasks.create(
        {
          title: fix.test_manager.task_title.slice(0, 90),
          data: {
            fight_id: fix.fight_id,
            persona: fix.persona_name,
            blue_mode: fix.blue_mode,
            severity: fix.taxonomy.severity,
            owasp_llm_top_10: fix.taxonomy.owasp_llm_top_10,
            mitre_atlas: fix.taxonomy.mitre_atlas,
            summary: fix.summary,
            root_cause_tactic: fix.root_cause.tactic,
            break_quote: fix.root_cause.break_quote,
            rule_violated: fix.root_cause.rule_violated,
            prompt_patch_section: fix.prompt_patch.section,
            prompt_patch_lines: fix.prompt_patch.patch_lines.join("\n"),
            regression_tests: fix.regression_tests.map((t) => t.gauntlet_command).join("\n"),
            task_body: fix.test_manager.task_body_markdown,
          },
        },
        folderId
      );
      const taskId = (created as { id?: number }).id ?? 0;
      if (taskId) {
        rememberLocally(taskId, folderId);
      }
      setCreate({
        kind: "created",
        taskId,
        url: taskId ? actionCenterTaskUrl(taskId, folderId) : taskUrl,
        folderUrl: actionCenterFolderUrl(folderId),
      });
    } catch (e) {
      // The external OAuth app may not have Tasks.Create on this
      // folder. Don't fail loud - save locally so the proposal isn't
      // lost, surface a calm hint, and the Triage Queue picks it up.
      if (isUnauthorized(e)) {
        const tid = localTaskId();
        rememberLocally(tid);
        setCreate({
          kind: "saved_local",
          reason:
            "Live API blocked: the external OAuth app doesn't have Tasks.Create on this folder. Saved to the local triage queue below - grant the scope to push live.",
        });
        return;
      }
      setCreate({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const avss = computeAvss(fix, fight);
  const avssTone =
    avss.score >= 9 ? "critical" : avss.score >= 7 ? "high" : avss.score >= 4 ? "medium" : "low";

  return (
    <>
      <header className="fix-head">
        <div className="fix-head-row">
          <span
            className={`avss-pill avss-${avssTone}`}
            title={`AVSS vector: ${avss.vector}`}
          >
            <span className="avss-label">AVSS</span>
            <span className="avss-score">{avss.score.toFixed(1)}</span>
          </span>
          <span className={`sev-pill sev-${fix.taxonomy.severity}`}>
            {fix.taxonomy.severity}
          </span>
          {onOpenPersona ? (
            <button
              className="fix-persona persona-link"
              onClick={() => onOpenPersona(fix.persona_name)}
            >
              {fix.persona_name}
            </button>
          ) : (
            <span className="fix-persona">{fix.persona_name}</span>
          )}
          <span className="fix-mode">·</span>
          <span className="fix-mode">blue mode = {fix.blue_mode}</span>
          <div className="flex-grow" />
          <div className="fix-tax">
            {fix.taxonomy.owasp_llm_top_10.map((id) => {
              const tag = lookupTaxonomy(id);
              return tag ? (
                <a
                  key={id}
                  className="fix-tag"
                  href={tag.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {id}
                </a>
              ) : (
                <span key={id} className="fix-tag fix-tag-muted">
                  {id}
                </span>
              );
            })}
            {fix.taxonomy.mitre_atlas.map((id) => {
              const tag = lookupTaxonomy(id);
              return tag ? (
                <a
                  key={id}
                  className="fix-tag fix-tag-atlas"
                  href={tag.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {id}
                </a>
              ) : (
                <span key={id} className="fix-tag fix-tag-muted">
                  {id}
                </span>
              );
            })}
          </div>
        </div>
        <p className="fix-summary">{fix.summary}</p>
      </header>

      <section className="fix-block">
        <h3>Root cause</h3>
        <div className="fix-kv">
          <span>Tactic</span>
          <code>{fix.root_cause.tactic}</code>
        </div>
        <div className="fix-kv">
          <span>Rule violated</span>
          <div>{fix.root_cause.rule_violated}</div>
        </div>
        <div className="fix-kv">
          <span>Why it worked</span>
          <div>{fix.root_cause.why_it_worked}</div>
        </div>
        {breakTurnUtterance && (
          <div className="fix-break">
            <div className="fix-break-label">
              ↳ Where blue cracked (turn {fix.root_cause.break_turn},{" "}
              {breakTurnUtterance.speaker})
            </div>
            <blockquote>{fix.root_cause.break_quote}</blockquote>
          </div>
        )}
      </section>

      <section className="fix-block fix-block-patch">
        <h3>
          Proposed prompt patch <span className="fix-block-hint">(copy-pasteable)</span>
        </h3>
        <div className="fix-kv">
          <span>Section</span>
          <code>{fix.prompt_patch.section}</code>
        </div>
        <div className="fix-kv">
          <span>Intent</span>
          <div>{fix.prompt_patch.intent}</div>
        </div>
        <div className="fix-patch-box">
          <button
            className="btn btn-ghost btn-sm fix-patch-copy"
            onClick={() => copyToClipboard(fix.prompt_patch.patch_lines.join("\n"))}
          >
            Copy patch
          </button>
          <pre>
            <code>{fix.prompt_patch.patch_lines.join("\n")}</code>
          </pre>
        </div>
        <div className="fix-kv">
          <span>Rationale</span>
          <div>{fix.prompt_patch.rationale}</div>
        </div>
      </section>

      <section className="fix-block">
        <h3>Regression tests to add</h3>
        <ul className="fix-tests">
          {fix.regression_tests.map((t, i) => (
            <li key={i}>
              <div className="fix-test-head">
                <strong>{t.persona_pattern}</strong>
                <span className="fix-test-sep">×</span>
                <span>{t.scenario_pattern}</span>
              </div>
              <div className="fix-test-why">{t.why}</div>
              <div className="fix-test-cmd">
                <code>{t.gauntlet_command}</code>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyToClipboard(t.gauntlet_command)}
                >
                  Copy
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="fix-block fix-block-handoff">
        <h3>Hand off to Action Center</h3>
        <div className="fix-tm-card">
          <div className="fix-tm-title">{fix.test_manager.task_title}</div>
          <div className="fix-tm-body">
            <Markdown source={fix.test_manager.task_body_markdown} />
          </div>
          {create.kind === "created" && (
            <div className="fix-tm-created">
              <span className="tag tag-ok">✓ Created</span>
              <span>
                Task #{create.taskId} is live in your Orchestrator tenant.
              </span>
              <a href={create.url} target="_blank" rel="noreferrer">
                Open in Action Center ↗
              </a>
              <button
                className="fix-tm-jump"
                onClick={() =>
                  document.getElementById("triage")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                View in Triage Queue ↓
              </button>
            </div>
          )}
          {create.kind === "saved_local" && (
            <div className="fix-tm-saved-local">
              <span className="tag tag-warn">Saved locally</span>{" "}
              {create.reason}
            </div>
          )}
          {create.kind === "error" && (
            <div className="fix-tm-error">
              <span className="tag tag-red">Failed</span> {create.message}
            </div>
          )}
          <div className="fix-tm-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                copyToClipboard(
                  `${fix.test_manager.task_title}\n\n${fix.test_manager.task_body_markdown}`
                )
              }
            >
              Copy task body
            </button>
            {create.kind !== "created" && create.kind !== "saved_local" && (
              <button
                className="btn btn-brand btn-sm"
                onClick={handleCreateTask}
                disabled={create.kind === "creating"}
                title="Tries the live Orchestrator tasks API; falls back to local triage queue on permission failure."
              >
                {create.kind === "creating"
                  ? "Creating…"
                  : "Send to triage queue"}
              </button>
            )}
            <a
              className="btn btn-outline btn-sm"
              href={tenant.testManagerProject}
              target="_blank"
              rel="noreferrer"
            >
              Open Test Manager ↗
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

// Tiny markdown renderer - bold (**text**) + paragraphs only. The
// Test Manager task body uses just those two affordances, so a full
// markdown library would be overkill.
function Markdown({ source }: { source: string }) {
  const paragraphs = source.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(p) }} />
      ))}
    </>
  );
}

function inlineFormat(s: string): string {
  // Order matters: escape < and >, then bold, then inline code, then line breaks
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
}
