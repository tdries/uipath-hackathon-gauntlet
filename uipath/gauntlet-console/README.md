# gauntletapp (Gauntlet Console)

The operator surface for **Gauntlet**, built as a UiPath **Coded App** (React + TypeScript + Vite + `@uipath/uipath-typescript`).

Six screens: **Threat Dashboard**, **Coach Lab**, **Run Fight**, **Fix Lab**, **Analytics**, **Audit**, plus full **Logs** drill-down. See the [root README](../../README.md) for what Gauntlet is and the full setup flow.

## How data flows

- **Offline corpus.** `scripts/build-corpus.mjs` reads every fight JSON from the repo's [runs/](../../runs/) directory and bundles it into `src/data/corpus.json`. It runs automatically before `dev` and `build`, so the app always ships with the latest corpus snapshot and works fully offline (no tenant or API key needed to browse every screen).
- **Live tenant calls.** When authenticated, the app talks to your UiPath tenant directly from the browser via [src/lib/uipath.ts](src/lib/uipath.ts): Maestro instances, Test Manager, and Action Center task creation.
- **Coach live mode.** Coach Lab accepts an LLM API key pasted into the modal. It stays in `sessionStorage` and is only ever sent to the LLM provider, never to any Gauntlet server.

## Local development

```bash
npm install
npm run dev
# -> http://localhost:5173
```

## Build and deploy to your tenant

```bash
npm run build                                  # produces dist/

uip codedapp pack dist -n gauntletapp -v 1.0.0 # pack dist/ into a .nupkg
uip codedapp publish --name gauntletapp        # register the package in your tenant
uip codedapp deploy --name gauntletapp         # deploy / upgrade the app
```

Open the app from the **Apps** tab in UiPath Automation Cloud.

> **Tenant note:** [uipath.json](uipath.json) is pinned to org `thesingularityisnearer` / tenant `DefaultTenant`. Update `orgName`, `tenantName`, and `clientId` (if you register your own OAuth app) before publishing to your own tenant.
