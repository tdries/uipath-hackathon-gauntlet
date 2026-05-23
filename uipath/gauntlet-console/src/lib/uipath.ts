// UiPath SDK singleton + React hook.
//
// The SDK reads its config from <meta name="uipath:*"> tags that the
// UiPath host injects at runtime - clientId, scope, org-id, tenant-id,
// base-url, redirect-uri, folder-key. See public/index.html or the
// hosted gauntletapp page source.
//
// initialize() handles the OAuth Authorization-Code-with-PKCE flow:
//   - first load → SDK redirects to UiPath identity → user signs in
//   - identity redirects back with ?code=... → SDK detects the
//     callback in this same initialize() call, exchanges code for a
//     token, scrubs the URL, and resolves authenticated
//   - subsequent loads → SDK rehydrates the token from sessionStorage
//
// All of that is hidden behind a single async getter so the React tree
// can render an unauthenticated stub immediately and swap in live data
// when the SDK resolves.

import { UiPath } from "@uipath/uipath-typescript";
import { useEffect, useState } from "react";
import { tenant } from "../data/tenant";

// The SDK exports the concrete UiPath class but not the IUiPath
// interface. The auth-related methods (getToken/isAuthenticated) live
// on the parent UiPath$1 class which is also internal. Use a minimal
// shape so callsites don't depend on private types.
type AuthShape = {
  getToken(): string | undefined;
  isAuthenticated(): boolean;
};
const asAuth = (sdk: UiPath): AuthShape => sdk as unknown as AuthShape;

export type UiPathStatus =
  | "loading"     // SDK booting / OAuth handshake in progress
  | "ready"      // authenticated, SDK callable
  | "unauthed"   // SDK initialized but no valid token (rare - usually means user denied login)
  | "error";     // initialize() threw - meta tags wrong, network down, etc.

export interface UiPathFolderConfig {
  /** UUID folder key from <meta name="uipath:folder-key"> */
  folderKey: string;
}

let _sdkPromise: Promise<UiPath> | null = null;
let _folderId: number | null = null;
let _folderKey: string | null = null;
let _orgId: string | null = null;
let _tenantId: string | null = null;
let _baseUrl: string | null = null;

function readMeta(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector(`meta[name="${name}"]`);
  return (el?.getAttribute("content") ?? undefined) || undefined;
}

/** Singleton SDK. Lazily initialized on first call. */
export function getUiPath(): Promise<UiPath> {
  if (!_sdkPromise) {
    _sdkPromise = (async () => {
      _orgId = readMeta("uipath:org-name") ?? null;
      _tenantId = readMeta("uipath:tenant-name") ?? null;
      _baseUrl = readMeta("uipath:base-url") ?? null;
      _folderKey = readMeta("uipath:folder-key") ?? null;
      const sdk = new UiPath();
      await sdk.initialize();
      return sdk;
    })();
  }
  return _sdkPromise;
}

/** UUID folder key from meta tag - used when an SDK method takes one. */
export function getFolderKey(): string | null {
  return _folderKey;
}

/** Numeric folder ID - resolved lazily via Orchestrator REST. The TS
 *  SDK's TaskService.create() takes a numeric folderId, but coded apps
 *  only get the UUID via meta tags. We look it up once and cache.
 */
export async function getFolderId(sdk: UiPath): Promise<number | null> {
  if (_folderId !== null) return _folderId;
  if (!_folderKey || !_orgId || !_tenantId || !_baseUrl) return null;
  const token = asAuth(sdk).getToken();
  if (!token) return null;
  const url =
    `${_baseUrl.replace(/\/$/, "")}/${_orgId}/${_tenantId}` +
    `/orchestrator_/odata/Folders?$filter=${encodeURIComponent(
      `Key eq ${_folderKey}`
    )}&$select=Id,Key`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { value?: Array<{ Id: number; Key: string }> };
  const match = data.value?.find((f) => f.Key === _folderKey);
  if (match) _folderId = match.Id;
  return _folderId;
}

/** Deep-link to a task in the Action Center UI.
 *
 *  Action Center is a separate service at `/actions_/` in this tenant
 *  (confirmed). Per-task URL pattern is `/actions_/tasks/<id>` with an
 *  optional folder filter; if a different keyword turns out to be
 *  canonical we update here.
 */
export function actionCenterTaskUrl(taskId: number, folderId?: number | null): string {
  const base = `${tenant.baseTenant}/actions_/tasks/${taskId}`;
  if (folderId && folderId > 0) return `${base}?fid=${folderId}`;
  return base;
}

/** Action Center root, optionally scoped to a folder. */
export function actionCenterFolderUrl(folderId?: number | null): string {
  const base = `${tenant.baseTenant}/actions_`;
  if (folderId && folderId > 0) return `${base}/?fid=${folderId}`;
  return base;
}

/** React hook: returns the SDK plus a status flag.
 *
 *  Components that only need to gate UI on auth state should read
 *  `status`. Components calling API methods should additionally check
 *  `sdk !== null`. The hook never throws - errors land in `error` and
 *  the caller decides whether to show them.
 */
export function useUiPath(): {
  status: UiPathStatus;
  sdk: UiPath | null;
  error: string | null;
} {
  const [state, setState] = useState<{
    status: UiPathStatus;
    sdk: UiPath | null;
    error: string | null;
  }>({ status: "loading", sdk: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sdk = await getUiPath();
        if (cancelled) return;
        const authed = asAuth(sdk).isAuthenticated();
        setState({
          status: authed ? "ready" : "unauthed",
          sdk: authed ? sdk : null,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          sdk: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
