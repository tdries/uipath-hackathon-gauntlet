# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gauntlet is an adversarial red-team arena for UiPath agents — submission for UiPath AgentHack 2026, Track 3 (Test Cloud). A Red Coach agent attacks a Blue target agent; winning attacks become permanent Test Manager regression tests, losing fights open Action Center fix tasks.

## Two halves of the repo

1. **Python package (`src/gauntlet/`)** — the engine. A `gauntlet` CLI runs fights locally, persists each as a JSON file in `runs/`, and houses the coded agents (Coach, Fix Recommender, Referee mirror).
2. **UiPath artifacts (`uipath/`)** — what gets deployed to a tenant: the Maestro Case + Flow + two Agent Builder agents (`uipath/gauntlet/`, packed via `gauntlet.uipx`), and the React Coded App console (`uipath/gauntlet-console/`).

The Python engine is the source of truth; `runs/` is the shared artifact both halves read.

## Commands

Python engine (run from repo root, `pip install -e .` first; live `fight`/`coach`/`fix` need `ANTHROPIC_API_KEY` in `.env`):
```bash
gauntlet --help                                          # all commands
gauntlet fight <persona> --scenario <scn> --blue-mode naive   # one live fight
gauntlet batch --pairs canonical --blue-modes standard,lenient  # grow the corpus (matrix, parallel)
gauntlet coach --auto-fight                              # LLM invents a new persona, fights it
gauntlet fix runs/<file>.json                            # draft a fix for a losing fight
gauntlet leaderboard                                     # summarize runs/ offline (no key needed)
ruff check src/                                          # lint (line-length 100, py311)
```
`--blue-mode` / `--blue-modes` is one of `standard | lenient | naive | external`.

React console (`cd uipath/gauntlet-console`):
```bash
npm run dev      # localhost:5173 — runs build-corpus.mjs first, then vite
npm run build    # tsc -b && vite build → dist/
npm run lint     # eslint
```

Deploy commands (uipx solution, codedapp) live in [README.md](README.md) §4–5. There is **no test suite** — the CLI fights and the two linters are the only checks.

## How a fight works (`src/gauntlet/runner.py`)

`run_fight()` drives two **parallel conversation views** — Red and Blue each see the other as the "user". Red opens with a scripted line, then they alternate up to `max_turns`. The loop ends early on `escalated` (Blue called escalation), `red_ended_call` (Red emits `<<END_CALL>>`), or a policy breach. Blue's tool calls (transfers, balance disclosure, fetching planted correspondence) are recorded in a `ToolLedger`; the **Referee** (`referee.py`) judges the transcript + ledger into a `Verdict`. `save_run()` writes `runs/<ts>-<fight_id>-<label>.json`.

**Blue modes** (`blue_team.py` / `blue_team_external.py`): `standard` (strict), `lenient` (weaker model, looser), `naive` (escalation-averse), `external` (LangGraph third-party target, no tool access). They exist to vary the system-under-test's defenses.

**Indirect injection vector**: `Scenario.planted_correspondence` is attacker payload seeded into the CRM; it reaches Blue via a *tool result* (`fetch_customer_correspondence`), not the user channel. See `models.py`.

## The corpus is the product

The Coach maximizes successful attacks, so `runs/` grows itself — that byproduct *is* the regression suite. Two pipelines consume it:

- **Console**: `npm run build` runs `scripts/build-corpus.mjs` (prebuild hook), which folds every `runs/*.json` (attaching any sibling `*.fix.json`) into `src/data/corpus.json`. The app ships this snapshot and falls back to it when not authenticated, so judges browse every screen offline. Live tenant data comes from `src/lib/uipath.ts` via `@uipath/uipath-typescript`.
- **Test Manager**: `scripts/import_runs_to_test_manager.py` turns runs into regression cases.

`gauntlet fix --all-red-wins` writes a `<run>.fix.json` next to each diagnosed run; those are what surface in the console's Fix Lab.

## Conventions

- **Documentation must not reference Claude, Anthropic, Opus, Sonnet, or Haiku by name** — say "frontier LLM" / "a configurable LLM". Model IDs in *code* (`llm.py`) are fine. **No em dashes in prose** anywhere in docs.
- `runs/` JSON fights are git-tracked (the corpus); `runs/_*`, `*.jsonl`, dev debris are gitignored.
- `personas/` (8 YAML) and `scenarios/` (15 YAML) are the attack library; `coach` writes new ones here at runtime.
- `Foody/` is an unrelated, untracked side project — ignore it; it is not part of Gauntlet.
- Tenant: `uipath/gauntlet-console/uipath.json` and `src/data/tenant.ts` point at the UiPath Labs org `hackathon26_038` (staging, base URL `https://staging.api.uipath.com`), where the submission is deployed (Orchestrator folder `Shared/Gauntlet`; app at `hackathon26_038.staging.uipath.host/gauntletapp`). Change both before deploying elsewhere.
