// LiveInstances - real tenant data fetched in the browser via the
// UiPath SDK. Two views stacked:
//
//   1. Deployed Maestro flows (`sdk.maestro.processes.getAll()`) - the
//      catalog of flow definitions in the user's tenant, including
//      pending / running / completed / faulted instance counts per
//      flow. This is always populated as long as anything is published.
//
//   2. Recent instances (`sdk.maestro.processes.instances.getAll()`)
//      - only rendered when at least one instance exists. Replaces the
//      static "fight log" snapshot for the live tenant view.
//
// Both calls happen client-side using the user's OAuth token. Empty
// states are explicit and route the user toward Maestro to start
// one of the flows themselves.

import "./LiveInstances.css";
import { useEffect, useState } from "react";
import { tenant } from "../data/tenant";
import { useUiPath } from "../lib/uipath";

interface ProcessRow {
  processKey: string;
  name: string;
  folderName: string;
  packageVersions: string[];
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  cancelledCount: number;
  faultedCount: number;
}

interface InstanceRow {
  instanceId: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  status: string;
  startedTime: string;
  completedTime: string | null;
  startedByUser: string;
}

type State =
  | { kind: "loading" }
  | { kind: "unauthed" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      processes: ProcessRow[];
      instances: InstanceRow[];
      instanceTotal: number;
    };

function fmt(time: string | null | undefined) {
  if (!time) return "-";
  try {
    return new Date(time).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return time;
  }
}

function statusTone(status: string): "ok" | "warn" | "red" | "neutral" {
  const s = status.toLowerCase();
  if (s.includes("complete") || s.includes("succeed")) return "ok";
  if (s.includes("run") || s.includes("pending")) return "warn";
  if (s.includes("fail") || s.includes("fault") || s.includes("cancel")) return "red";
  return "neutral";
}

function maestroProcessUrl(processKey: string): string {
  return `${tenant.maestroRoot}/processes/${encodeURIComponent(processKey)}`;
}
function maestroInstanceUrl(instanceId: string): string {
  return `${tenant.maestroRoot}/processes/instances/${encodeURIComponent(instanceId)}`;
}

export function LiveInstances() {
  const { status, sdk } = useUiPath();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (status === "loading") {
      setState({ kind: "loading" });
      return;
    }
    if (status !== "ready" || !sdk) {
      setState({ kind: "unauthed" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [processesRaw, instancesRaw] = await Promise.all([
          sdk.maestro.processes.getAll(),
          sdk.maestro.processes.instances.getAll(),
        ]);
        if (cancelled) return;

        type RawProcess = {
          processKey: string;
          name: string;
          folderName: string;
          packageVersions?: string[];
          pendingCount?: number;
          runningCount?: number;
          completedCount?: number;
          cancelledCount?: number;
          faultedCount?: number;
        };
        const processes: ProcessRow[] = (
          Array.isArray(processesRaw) ? processesRaw : []
        ).map((raw) => {
          const r = raw as RawProcess;
          return {
            processKey: r.processKey,
            name: r.name ?? r.processKey,
            folderName: r.folderName ?? "-",
            packageVersions: r.packageVersions ?? [],
            pendingCount: r.pendingCount ?? 0,
            runningCount: r.runningCount ?? 0,
            completedCount: r.completedCount ?? 0,
            cancelledCount: r.cancelledCount ?? 0,
            faultedCount: r.faultedCount ?? 0,
          };
        });

        const wrapped = instancesRaw as unknown as
          | { items?: unknown[]; totalCount?: number }
          | unknown[];
        const items = Array.isArray(wrapped)
          ? wrapped
          : wrapped.items ?? [];
        const instanceTotal = Array.isArray(wrapped)
          ? wrapped.length
          : (wrapped.totalCount ?? items.length);

        type RawInstance = {
          instanceId: string;
          instanceDisplayName?: string;
          packageId?: string;
          packageVersion?: string;
          latestRunStatus?: string;
          startedTime?: string;
          completedTime?: string | null;
          startedByUser?: string;
        };
        const instances: InstanceRow[] = (items as unknown[])
          .slice(0, 8)
          .map((raw) => {
            const r = raw as RawInstance;
            return {
              instanceId: r.instanceId,
              displayName: r.instanceDisplayName || r.instanceId,
              packageName: r.packageId ?? "-",
              packageVersion: r.packageVersion ?? "-",
              status: r.latestRunStatus ?? "unknown",
              startedTime: r.startedTime ?? "",
              completedTime: r.completedTime ?? null,
              startedByUser: r.startedByUser ?? "-",
            };
          });

        setState({ kind: "ok", processes, instances, instanceTotal });
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, sdk]);

  return (
    <section className="instances-section" id="live-instances">
      <div className="wrap">
        <div className="instances-head">
          <div>
            <span className="instances-eyebrow">Live · your tenant</span>
            <h2>What's running in your tenant right now</h2>
            <p className="section-lede">
              The Maestro flows you've deployed and how many runs each has
              done. Pulled live from your tenant, no mock data, no static
              snapshot.
            </p>
          </div>
          <a
            className="btn btn-outline btn-sm"
            href={tenant.maestroRoot}
            target="_blank"
            rel="noreferrer"
          >
            Open Maestro ↗
          </a>
        </div>

        {state.kind === "loading" && (
          <div className="instances-state instances-loading">
            Loading live tenant data…
          </div>
        )}
        {state.kind === "unauthed" && (
          <div className="instances-state instances-warn">
            Sign-in needed. The live panel will populate once UiPath OAuth
            completes.
          </div>
        )}
        {state.kind === "error" && (
          <div className="instances-state instances-warn">
            Couldn't load tenant data: {state.message}
          </div>
        )}

        {state.kind === "ok" && (
          <>
            <h3 className="instances-subhead">
              Deployed Maestro flows
              <span className="instances-count">{state.processes.length}</span>
            </h3>
            {state.processes.length === 0 ? (
              <div className="instances-state">
                No Maestro processes deployed in this tenant yet. Publish a flow
                from Studio Web.
              </div>
            ) : (
              <table className="table instances-table">
                <thead>
                  <tr>
                    <th>Flow</th>
                    <th>Folder</th>
                    <th>Latest version</th>
                    <th className="right">Pending</th>
                    <th className="right">Running</th>
                    <th className="right">Completed</th>
                    <th className="right">Faulted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {state.processes.map((p) => (
                    <tr key={p.processKey}>
                      <td className="instances-name">{p.name}</td>
                      <td>{p.folderName}</td>
                      <td>
                        <code>v{p.packageVersions[0] ?? "-"}</code>
                      </td>
                      <td className="right">{p.pendingCount}</td>
                      <td className="right" style={{ color: "var(--warn)" }}>
                        {p.runningCount}
                      </td>
                      <td className="right" style={{ color: "var(--ok)" }}>
                        {p.completedCount}
                      </td>
                      <td
                        className="right"
                        style={{
                          color: p.faultedCount > 0 ? "var(--red)" : "var(--ink-3)",
                        }}
                      >
                        {p.faultedCount}
                      </td>
                      <td>
                        <a
                          className="instances-link"
                          href={maestroProcessUrl(p.processKey)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {state.instances.length > 0 && (
              <>
                <h3 className="instances-subhead" style={{ marginTop: 24 }}>
                  Recent instances
                  <span className="instances-count">{state.instanceTotal}</span>
                </h3>
                <table className="table instances-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Instance</th>
                      <th>Status</th>
                      <th>By</th>
                      <th>Completed</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.instances.map((r) => (
                      <tr key={r.instanceId}>
                        <td><code>{fmt(r.startedTime)}</code></td>
                        <td className="instances-name">{r.displayName}</td>
                        <td>
                          <span className={`tag tag-${statusTone(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="instances-user">{r.startedByUser}</td>
                        <td><code>{fmt(r.completedTime)}</code></td>
                        <td>
                          <a
                            className="instances-link"
                            href={maestroInstanceUrl(r.instanceId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {state.instanceTotal > state.instances.length && (
                  <p className="instances-more">
                    Showing {state.instances.length} of {state.instanceTotal} -{" "}
                    <a href={tenant.maestroRoot} target="_blank" rel="noreferrer">
                      see all in Maestro ↗
                    </a>
                  </p>
                )}
              </>
            )}

            {state.instances.length === 0 && state.processes.length > 0 && (
              <p className="instances-empty-note">
                No instances yet. Start a run from{" "}
                <a href={tenant.maestroRoot} target="_blank" rel="noreferrer">
                  Maestro
                </a>{" "}
                or trigger the flow via the <code>uip</code> CLI and the table
                will populate on refresh.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
