<p align="center">
  <img src="gauntlet_logo.png" alt="Gauntlet logo" width="200" />
</p>

<h1 align="center">Gauntlet — Go safe or go home</h1>

<p align="center"><strong>Adversarial red-team arena for UiPath agents.</strong></p>

<p align="center">
  Submission for <a href="https://uipath-agenthack.devpost.com">UiPath AgentHack 2026</a> — <strong>Track 3 (UiPath Test Cloud)</strong>.
</p>

---

## Project description

UiPath Agent Evaluations tell you whether your agent passes the tests **you wrote**. They don't tell you what happens when a real attacker shows up with a prompt you never imagined.

**Gauntlet closes that gap.** A **Red Coach** agent (Claude Opus) plays an adversary against any UiPath Agent, Maestro Flow, or external target. When the existing attack corpus stops scoring hits, the Coach **invents new attack personas mid-fight**. Every winning attack is automatically persisted to **UiPath Test Manager** as a permanent regression test. Every failing fight opens an **Action Center task** with a concrete fix recommendation written by a second Opus agent.

The result is an **agentic test factory** that grows the regression suite by itself, with every fight double-tagged against **OWASP LLM Top-10** and **MITRE ATLAS** so the coverage matrix is something a compliance officer can actually read.

### The problem it solves

Agent safety today is mostly vibes-based. Teams ship an agent, write a few eval rubrics, and hope nothing breaks. Gauntlet replaces "hope" with a continuous adversarial loop:

| Today | With Gauntlet |
|---|---|
| Static eval rubrics that humans wrote | Self-play that invents new evals |
| "Did we test prompt injection?" → maybe? | OWASP / MITRE coverage matrix on every release |
| Bug found in prod → manual repro → manual test case | Auto-populated Test Manager regression entry |
| Failure → developer manually patches prompt | Fix Recommender drafts the patch, opens Action Center task |

## In-app screenshots

### Threat Dashboard

Tenant status at a glance. Robustness score, top critical findings, recent fights, quick-action tiles, mini coverage heatmap.

![Dashboard](docs/screenshots/01-dashboard.png)

### Coach Lab — invent a new attack persona

The Coach picks the persona × posture combination with the highest expected reward (Thompson sampling), or asks Claude Opus to invent a new one. Risk-weighted coverage table shows exactly where Blue is weakest.

![Coach Lab](docs/screenshots/02-coach-lab.png)

### Run a Fight

Single fight or batch of up to 10. Pick the Red persona, the scenario, and the Blue policy posture (Standard / Lenient / Naive / External LangGraph target).

![Run Fight](docs/screenshots/03-run-fight.png)

### Fix Lab

Open any losing fight, read the Fix Recommender's patch proposal (root cause + suggested system-prompt patch + regression test), file it to **UiPath Action Center** for human approval.

![Fix Lab](docs/screenshots/04-fix-lab.png)

### Analytics

Persona × posture heatmap, severity trend, fix-recommender pipeline status, per-day adversarial call volume.

![Analytics](docs/screenshots/05-analytics.png)

### Audit — OWASP LLM Top-10 / MITRE ATLAS coverage

Every fight is double-tagged. The Audit view answers "what kinds of attacks have we tested for, and how did Blue do?" in a form a compliance officer can read.

![Audit](docs/screenshots/06-audit.png)

### Logs — every adversarial call

Full transcripts, referee verdicts, fix-proposal links. Click any row to drill into the full conversation.

![Logs](docs/screenshots/07-logs.png)

## UiPath components used

| Component | Role | Where it lives |
|---|---|---|
| **UiPath Automation Cloud** | Execution and orchestration plane | Tenant: `cloud.uipath.com/thesingularityisnearer/DefaultTenant` |
| **Maestro Case** (`FightArena`) | Long-running fight orchestration; rounds-as-tasks | [uipath/gauntlet/FightArena/](uipath/gauntlet/FightArena/) |
| **Maestro Flow** (`RoundOrchestrator`) | Single round end-to-end: Red attack → Blue response → judge → score | [uipath/gauntlet/RoundOrchestrator/](uipath/gauntlet/RoundOrchestrator/) |
| **Agent Builder** (`MetroBankCSR`) | Blue target — reference customer-service agent (system under test) | [uipath/gauntlet/MetroBankCSR/](uipath/gauntlet/MetroBankCSR/) |
| **Agent Builder** (`RefereeAgent`) | Judge — scores each round against the rubric | [uipath/gauntlet/RefereeAgent/](uipath/gauntlet/RefereeAgent/) |
| **Coded Agents** (Python, LangGraph + Opus) | Red Coach (`gauntlet coach`), Fix Recommender (`gauntlet fix`) | [src/gauntlet/](src/gauntlet/) |
| **Coded App** (`gauntletapp`) | Operator surface: Threat Dashboard, Coach Lab, Fix Lab, Analytics, Audit, Logs | [uipath/gauntlet-console/](uipath/gauntlet-console/) |
| **Test Manager** | Persistent regression set, auto-populated by Coach on winning attacks | Imported via [scripts/import_runs_to_test_manager.py](scripts/import_runs_to_test_manager.py) |
| **Action Center** | Human-in-the-loop fix approval; tasks opened from Fix Lab | Live API call from browser via `@uipath/uipath-typescript` |
| **UiPath TypeScript SDK** (`@uipath/uipath-typescript`) | Browser-side calls from Coded App to Maestro instances, Test Manager, Action Center | [uipath/gauntlet-console/src/lib/uipath.ts](uipath/gauntlet-console/src/lib/uipath.ts) |
| **`uip` CLI 1.0.4+** | Login, package, publish, deploy across all artifacts | Used in setup steps below |

## Agent type

**Both Coded Agents and Low-code Agents.** Gauntlet is deliberately polyglot to prove the arena is framework-neutral.

- **Coded Agents (Python, LangGraph + Claude Opus):**
  - `gauntlet coach` — adversarial Red Coach with risk-weighted persona selection ([src/gauntlet/coach.py](src/gauntlet/coach.py))
  - `gauntlet fix` — Fix Recommender ([src/gauntlet/fix.py](src/gauntlet/fix.py))
  - `gauntlet referee` (local mirror) — judge logic ([src/gauntlet/referee.py](src/gauntlet/referee.py))
  - External Blue target reference implementation in LangGraph ([src/gauntlet/blue_team_external.py](src/gauntlet/blue_team_external.py))

- **Low-code Agents (UiPath Agent Builder):**
  - `MetroBankCSR` — the Blue target (system under test)
  - `RefereeAgent` — the in-tenant judge

- **Low-code Orchestration (UiPath Maestro):**
  - `FightArena` — Maestro **Case** for long-running fight lifecycle
  - `RoundOrchestrator` — Maestro **Flow** for per-round execution

- **Coded App (TypeScript + React):**
  - `gauntletapp` — the operator surface that ties them all together

## Setup instructions (for judging)

### Prerequisites

- UiPath Automation Cloud tenant with **Test Cloud**, **Maestro**, **Agent Builder**, **Action Center**, **Coded Apps**, and **Test Manager** enabled
- **Node.js 20+**
- **Python 3.11+**
- **`uip` CLI 1.0.4+** — `npm i -g @uipath/cli`
- **Anthropic API key** (Claude Opus access)

### 1. Clone and configure

```bash
git clone https://github.com/tdries/uipath-hackathon-gauntlet.git
cd uipath-hackathon-gauntlet
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and UiPath tenant fields
```

### 2. Authenticate to UiPath

```bash
uip login
# Follow the browser flow. The CLI writes credentials to ~/.uipath/credentials.
```

### 3. Install the Python package

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

This exposes the `gauntlet` CLI:
```bash
gauntlet --help
gauntlet fight fake-ceo-naive         # replay one fight from the corpus
gauntlet coach --auto-fight           # let the Coach invent a new attack
gauntlet fix runs/<fight-id>.json     # generate a fix proposal for a losing fight
```

### 4. Deploy the UiPath solution

The full UiPath solution (Maestro Case + Flow + both Agent Builder agents) lives in [uipath/gauntlet/](uipath/gauntlet/) as a `.uipx` solution package.

```bash
cd uipath/gauntlet
uip solution publish gauntlet.uipx
uip solution deploy --name gauntlet
```

This deploys:
- `FightArena` (Maestro Case)
- `RoundOrchestrator` (Maestro Flow)
- `MetroBankCSR` (Agent Builder agent — the Blue target)
- `RefereeAgent` (Agent Builder agent — the judge)

### 5. Deploy the Coded App (`gauntletapp`)

```bash
cd uipath/gauntlet-console
npm install
npm run build
uip codedapp publish
```

This publishes `gauntletapp` to your tenant. Open it from the **Apps** tab in UiPath Automation Cloud.

> **Tenant note:** the app's `uipath.json` is currently pinned to org `thesingularityisnearer` / tenant `DefaultTenant`. Update [uipath/gauntlet-console/uipath.json](uipath/gauntlet-console/uipath.json) (`orgName`, `tenantName`, and `clientId` if you register your own OAuth app) before publishing to your own tenant.

### 6. Run the demo workflow

Once everything is deployed:

1. **Open `gauntletapp`** in your UiPath tenant.
2. On the **Dashboard**, click *Run a fight*. Pick a Red persona (e.g. `aggressive-lawyer`), a scenario, and the Blue posture. Click **Replay this fight**.
3. Open **Coach Lab** from the sidebar. Paste your Anthropic API key into the modal (stays in `sessionStorage`, never sent to Gauntlet servers). Click **Run live (add key)**. The Coach invents a new attack persona in front of you.
4. On the **Defend** tab, open any losing fight. The **Fix Recommender** has already drafted a patch. Click **File to Action Center** to create a real Action Center task in your tenant.
5. Browse the **Audit** tab for OWASP LLM Top-10 / MITRE ATLAS coverage, and **Logs** for the full corpus of 75+ fights.

### Local development

To run the Coded App locally against your tenant (without redeploying):

```bash
cd uipath/gauntlet-console
npm run dev
# → http://localhost:5173
```

The app falls back to the bundled offline corpus when not authenticated, so judges can also inspect every screen without needing a tenant.

## How it positions

Gauntlet is the **adversarial complement to UiPath Agent Evaluations**. Where Agent Evaluations score your agent against a static rubric, Gauntlet scores it against an opponent that's actively trying to break it — and turns every successful attack into a permanent test case.

Built end-to-end with **Claude Code** as the coding agent — thematically right: an agent building a tool to keep agents honest.

## Repo layout

```
.
├── src/gauntlet/           Python package — Coach, Fix, Referee, Runner, CLI
├── uipath/
│   ├── gauntlet/           UiPath solution
│   │   ├── FightArena/         Maestro Case
│   │   ├── RoundOrchestrator/  Maestro Flow
│   │   ├── MetroBankCSR/       Agent Builder agent (Blue target)
│   │   └── RefereeAgent/       Agent Builder agent (judge)
│   └── gauntlet-console/   React Coded App (`gauntletapp`)
├── personas/               Red attack persona library (8 YAML personas)
├── scenarios/              Fight scenarios (15 YAML scenarios)
├── scripts/                Test Manager import helper
└── docs/
    ├── ARCHITECTURE.md     Detailed system architecture
    ├── PERSONAS.md         Red-team persona reference
    └── screenshots/        In-app screenshots referenced above
```

## License

MIT — see [LICENSE](LICENSE).
