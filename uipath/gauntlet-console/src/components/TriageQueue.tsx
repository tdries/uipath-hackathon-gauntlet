// TriageQueue - Action Center tasks created from this console.
//
// Data sources, in priority order:
//   1. Local store (lib/triageStore) - every time Fix Lab successfully
//      calls sdk.tasks.create(...) we cache the new task locally.
//      That's our floor - the panel always has at least these rows.
//   2. Live `sdk.tasks.getAll()` - the source of truth when the user
//      has Task.View permission on the folder. When it works we merge
//      by task id, preferring the live status / assignee / timestamps.
//
// Live readback may 401 ("You are not authorized!") if the external
// OAuth app's role doesn't grant task-list. We don't surface that as
// a hard error any more - we just show the local rows with a soft
// hint that bulk listing isn't available.

import "./TriageQueue.css";
import { useEffect, useState } from "react";
import { actionCenterTaskUrl, getFolderId, useUiPath } from "../lib/uipath";
import { corpus } from "../data/corpus";
import { computeAvss } from "../data/avss";
import {
  getRememberedTasks,
  purgeLocalOnlyEntries,
  type TriageStoreEntry,
} from "../lib/triageStore";

interface TriageRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  createdTime: string;
  assignee: string | null;
  fightId: string;
  persona: string;
  blueMode: string;
  severity: string;
  owasp: string[];
  source: "live" | "local";
  folderId?: number;
}

interface PanelState {
  rows: TriageRow[];
  liveStatus: "loading" | "ok" | "denied" | "error";
  errorMessage: string | null;
}

function fmt(t: string | null | undefined) {
  if (!t) return "-";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return t;
  }
}

function statusTone(status: string): "ok" | "warn" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("complete")) return "ok";
  if (s.includes("pending") || s.includes("unassigned") || s.includes("assigned")) return "warn";
  return "neutral";
}

function fromStore(e: TriageStoreEntry): TriageRow {
  return {
    id: e.id,
    title: e.title,
    status: "Pending",
    priority: "Medium",
    createdTime: e.createdAt,
    assignee: null,
    fightId: e.fightId,
    persona: e.persona,
    blueMode: e.blueMode,
    severity: e.severity,
    owasp: e.owasp,
    source: "local",
    folderId: e.folderId,
  };
}

function isUnauthorized(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /not authorized|unauthor[iz]ed|401|403|forbidden/i.test(msg);
}

export function TriageQueue() {
  const { status, sdk } = useUiPath();
  const [panel, setPanel] = useState<PanelState>(() => ({
    rows: getRememberedTasks().map(fromStore),
    liveStatus: "loading",
    errorMessage: null,
  }));

  // Re-read the local store whenever Fix Lab fires its synthetic event.
  useEffect(() => {
    const handler = () => {
      setPanel((prev) => ({
        ...prev,
        rows: mergeLocalAndLive(getRememberedTasks().map(fromStore), prev.rows),
      }));
    };
    window.addEventListener("gauntlet:triage:changed", handler);
    return () => window.removeEventListener("gauntlet:triage:changed", handler);
  }, []);

  // Try the live API once auth is ready.
  useEffect(() => {
    if (status !== "ready" || !sdk) return;
    let cancelled = false;
    (async () => {
      try {
        const folderId = await getFolderId(sdk);
        if (folderId === null) {
          throw new Error("Could not resolve folder ID.");
        }
        const resp = await sdk.tasks.getAll({ folderId });
        if (cancelled) return;
        const raw = resp as unknown as
          | { items?: unknown[]; totalCount?: number }
          | unknown[];
        const items = Array.isArray(raw) ? raw : raw.items ?? [];
        const liveRows: TriageRow[] = [];
        for (const r of items as unknown[]) {
          const row = liveTaskToRow(r);
          if (row) {
            row.folderId = folderId;
            liveRows.push(row);
          }
        }
        setPanel((prev) => ({
          rows: mergeLocalAndLive(prev.rows, liveRows),
          liveStatus: "ok",
          errorMessage: null,
        }));
      } catch (e) {
        if (cancelled) return;
        setPanel((prev) => ({
          ...prev,
          liveStatus: isUnauthorized(e) ? "denied" : "error",
          errorMessage: e instanceof Error ? e.message : String(e),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, sdk]);

  // Hide the section entirely until auth resolves AND we have no local
  // memory either - there's nothing to look at.
  if (status !== "ready" && panel.rows.length === 0) return null;

  const localCount = panel.rows.filter((r) => r.source === "local").length;

  return (
    <section className="triage-section" id="triage">
      <div className="wrap">
        <div className="triage-head">
          <div>
            <span className="triage-eyebrow">Review queue · Action Center</span>
            <h2>What your team should look at next</h2>
            <p className="section-lede">
              Every Fix Recommender proposal you've sent to triage lands here.
              Each row mirrors a real task in your Orchestrator Action Center -
              click the task id to open it in UiPath, or "fight" to jump to
              the underlying adversarial call in this app.
            </p>
            {panel.liveStatus === "denied" && (
              <p className="triage-hint">
                ⓘ The external OAuth app doesn't have <code>Tasks.View</code>{" "}
                permission on this folder, so bulk listing is blocked. Tasks
                you create from this browser still show below using a local
                store.
              </p>
            )}
            {panel.liveStatus === "error" && (
              <p className="triage-hint triage-hint-warn">
                Couldn't reach the tasks API: {panel.errorMessage}
              </p>
            )}
          </div>
          {localCount > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                purgeLocalOnlyEntries();
                setPanel((prev) => ({
                  ...prev,
                  rows: prev.rows.filter((r) => r.source !== "local"),
                }));
              }}
              title="Remove local-fallback rows; keeps real Orchestrator tasks."
            >
              Clear {localCount} local row{localCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {panel.rows.length === 0 && (
          <div className="triage-state">
            No triage tasks yet. Open <strong>Fix Recommender</strong>, pick a
            red-win proposal, hit{" "}
            <strong>Create as live Action Center task</strong> - the row will
            appear here.
          </div>
        )}

        {panel.rows.length > 0 && (
          <table className="table triage-table">
            <thead>
              <tr>
                <th>AVSS</th>
                <th>Severity</th>
                <th>Title</th>
                <th>Persona</th>
                <th>Blue mode</th>
                <th>OWASP</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {panel.rows.map((r) => {
                // Recompute AVSS from the matching corpus fix proposal
                // so the score stays consistent with FixLab.
                const fight = corpus.find(
                  (c) => c.fix_proposal?.fight_id === r.fightId
                );
                const fix = fight?.fix_proposal;
                const avss = fix ? computeAvss(fix, fight).score : null;
                const avssTone =
                  avss === null
                    ? "low"
                    : avss >= 9
                      ? "critical"
                      : avss >= 7
                        ? "high"
                        : avss >= 4
                          ? "medium"
                          : "low";
                return (
                <tr key={r.id} className={r.source === "local" ? "triage-row-local" : ""}>
                  <td>
                    {avss !== null ? (
                      <span className={`avss-pill avss-${avssTone}`}>
                        <span className="avss-score">{avss.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={`sev-pill sev-${r.severity.toLowerCase()}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="triage-title">{r.title}</td>
                  <td>{r.persona}</td>
                  <td>
                    <span className="tag tag-neutral">{r.blueMode}</span>
                  </td>
                  <td className="triage-owasp">
                    {r.owasp.map((id) => (
                      <span key={id} className="triage-owasp-tag">
                        {id}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className={`tag tag-${statusTone(r.status)}`}>
                      {r.status}
                    </span>
                    {r.source === "local" && (
                      <span className="triage-local-flag" title="Stored locally - live list not available">
                        local
                      </span>
                    )}
                  </td>
                  <td><code>{fmt(r.createdTime)}</code></td>
                  <td className="triage-row-links">
                    <a
                      className="instances-link"
                      href={actionCenterTaskUrl(r.id, r.folderId)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in UiPath Action Center"
                    >
                      #{r.id} ↗
                    </a>
                    <a
                      className="instances-link triage-row-fight-link"
                      href={`#fight=${r.fightId}`}
                      title="Jump to the underlying fight in this app"
                    >
                      fight ↓
                    </a>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function liveTaskToRow(raw: unknown): TriageRow | null {
  type RawTask = {
    id?: number;
    title?: string;
    status?: string;
    priority?: string;
    creationTime?: string;
    createdTime?: string;
    data?: Record<string, unknown> | null;
    assignedToUser?: { name?: string; userName?: string } | null;
  };
  const r = raw as RawTask;
  const data = r.data ?? null;
  if (!data || typeof data !== "object") return null;
  const fightId = (data as Record<string, unknown>).fight_id;
  if (typeof fightId !== "string") return null;
  return {
    id: r.id ?? 0,
    title: r.title ?? "(untitled)",
    status: r.status ?? "Unknown",
    priority: r.priority ?? "Medium",
    createdTime: r.creationTime ?? r.createdTime ?? "",
    assignee: r.assignedToUser?.name ?? r.assignedToUser?.userName ?? null,
    fightId,
    persona: String((data as Record<string, unknown>).persona ?? "-"),
    blueMode: String((data as Record<string, unknown>).blue_mode ?? "-"),
    severity: String((data as Record<string, unknown>).severity ?? "-"),
    owasp: Array.isArray((data as Record<string, unknown>).owasp_llm_top_10)
      ? ((data as Record<string, unknown>).owasp_llm_top_10 as string[])
      : [],
    source: "live",
  };
}

function mergeLocalAndLive(local: TriageRow[], live: TriageRow[]): TriageRow[] {
  const byId = new Map<number, TriageRow>();
  for (const r of local) byId.set(r.id, r);
  for (const r of live) byId.set(r.id, r); // live wins
  return [...byId.values()].sort((a, b) =>
    (b.createdTime ?? "").localeCompare(a.createdTime ?? "")
  );
}
