// Local memory of Action Center tasks created from this browser
// (i.e. via Fix Lab → "Create as live Action Center task"). The
// Orchestrator-side getAll endpoint requires Task.View + Task.Edit
// permissions on the folder, which the user's external OAuth app may
// not have; without those, getAll returns 401. Even when those perms
// ARE granted, we want the just-created row to appear immediately
// without waiting for a list refresh.
//
// This local store gives the Triage Queue something to show in both
// cases. When the live API works, it merges by task id (preferring
// the live status / assignee / completed timestamp over the local
// snapshot taken at creation time).

const KEY = "gauntlet.triage.tasks.v1";

export interface TriageStoreEntry {
  id: number;
  title: string;
  fightId: string;
  persona: string;
  blueMode: string;
  severity: string;
  owasp: string[];
  createdAt: string;
  /** Numeric Orchestrator folder id - required for Action Center deep links. */
  folderId?: number;
}

function readAll(): TriageStoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TriageStoreEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: TriageStoreEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // localStorage may be disabled (private mode, etc.) - silently drop.
  }
}

export function rememberCreatedTask(entry: TriageStoreEntry) {
  // Dedupe by fight_id, not by task id. Multiple clicks against the
  // same fight (e.g. first attempt 401s and falls back to local, second
  // attempt succeeds against the live API) shouldn't pile up rows -
  // the newest entry replaces the old. Live ids (positive) win over
  // local ids (negative) when both exist for the same fight.
  const existing = readAll();
  const sameFight = existing.find((e) => e.fightId === entry.fightId);
  const prefer =
    sameFight && sameFight.id > 0 && entry.id < 0 ? sameFight : entry;
  const next = existing.filter((e) => e.fightId !== entry.fightId);
  next.unshift(prefer);
  writeAll(next.slice(0, 50));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("gauntlet:triage:changed"));
  }
}

export function getRememberedTasks(): TriageStoreEntry[] {
  return readAll();
}

/** Drop only the local-fallback entries (negative ids). Used when the
 *  user wants to clean up stragglers from 401-era attempts without
 *  losing the real Orchestrator-issued rows. */
export function purgeLocalOnlyEntries() {
  const remaining = readAll().filter((e) => e.id > 0);
  writeAll(remaining);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("gauntlet:triage:changed"));
  }
}
