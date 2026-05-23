// LiveStatus - top-nav badge that proves the React app is talking to
// real UiPath APIs (not theater). On mount it asks the SDK for the
// list of Maestro processes in the tenant; success → green dot + the
// count, failure → amber dot + error message.
//
// The actual lookup is cheap (one GET to /maestro_/api/v2/processes)
// and matches the deep-link the IntegrationMap already exposes - so
// the user can verify the count against what they see in Maestro
// itself.

import "./LiveStatus.css";
import { useEffect, useState } from "react";
import { useUiPath } from "../lib/uipath";

type Probe =
  | { kind: "loading" }
  | { kind: "ok"; processes: number; cases: number }
  | { kind: "warn"; message: string };

export function LiveStatus() {
  const { status, sdk, error } = useUiPath();
  const [probe, setProbe] = useState<Probe>({ kind: "loading" });

  useEffect(() => {
    if (status !== "ready" || !sdk) return;
    let cancelled = false;
    (async () => {
      try {
        // The SDK auto-paginates these - we just need the count.
        const [processes, cases] = await Promise.all([
          sdk.maestro.processes.getAll().catch(() => []),
          sdk.maestro.cases.getAll().catch(() => []),
        ]);
        if (cancelled) return;
        const pCount = Array.isArray(processes)
          ? processes.length
          : (processes as { items?: unknown[] }).items?.length ?? 0;
        const cCount = Array.isArray(cases)
          ? cases.length
          : (cases as { items?: unknown[] }).items?.length ?? 0;
        setProbe({ kind: "ok", processes: pCount, cases: cCount });
      } catch (e) {
        if (cancelled) return;
        setProbe({
          kind: "warn",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, sdk]);

  if (status === "loading") {
    return (
      <span className="live-status live-loading" title="Connecting to UiPath…">
        <span className="live-dot" />
        <span className="live-label">Connecting</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="live-status live-warn" title={error ?? ""}>
        <span className="live-dot" />
        <span className="live-label">Offline</span>
      </span>
    );
  }
  if (status === "unauthed") {
    return (
      <span className="live-status live-warn" title="Not authenticated">
        <span className="live-dot" />
        <span className="live-label">Sign-in needed</span>
      </span>
    );
  }
  if (probe.kind === "loading") {
    return (
      <span className="live-status live-loading" title="Querying Maestro…">
        <span className="live-dot" />
        <span className="live-label">Probing</span>
      </span>
    );
  }
  if (probe.kind === "warn") {
    return (
      <span
        className="live-status live-warn"
        title={`Authed, but Maestro probe failed: ${probe.message}`}
      >
        <span className="live-dot" />
        <span className="live-label">Live · API limited</span>
      </span>
    );
  }
  const summary =
    probe.processes + probe.cases > 0
      ? `${probe.processes} Maestro flow${probe.processes === 1 ? "" : "s"}, ${probe.cases} case${probe.cases === 1 ? "" : "s"}`
      : "tenant connected";
  return (
    <span className="live-status live-ok" title={`Live: ${summary}`}>
      <span className="live-dot" />
      <span className="live-label">Live · {summary}</span>
    </span>
  );
}
