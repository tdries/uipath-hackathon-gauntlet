# Gauntlet — Go safe or go home

**Adversarial red-team arena for UiPath agents.**

Submission for [UiPath AgentHack 2026](https://uipath-agenthack.devpost.com) — Track 3 (UiPath Test Cloud).

![Gauntlet logo](gauntlet_logo.png)

> UiPath Agent Evaluations tell you whether your agent passes the tests you wrote. They don't tell you what happens when a real attacker shows up with a prompt you never imagined. Gauntlet does.

A Red Coach agent (Opus-authored) invents new attacks against any UiPath Agent, Maestro Flow, or external LangGraph target. Every winning attack auto-populates UiPath Test Manager as a permanent regression test. Every failure opens an Action Center task with a concrete fix recommendation.

## What it does

| | |
|---|---|
| **Red Coach** | Mutates attack strategies between rounds. When the existing corpus stops scoring hits, Opus invents new attack personas mid-fight. |
| **Blue target** | Any UiPath Agent, Maestro Flow, or external target (a LangGraph reference target is included). |
| **FightArena (Maestro Case)** | Long-running case, one task per round. |
| **RoundOrchestrator (Maestro Flow)** | Single round end-to-end: Red attack, Blue response, judge, score. |
| **Coach** | Auto-populates Test Manager with winning attacks so they become permanent regression tests. |
| **Fix Recommender** | Reads a failed fight, proposes a remediation (system-prompt patch, tool-scope restriction, guardrail), opens an Action Center task. |
| **Coded App (`gauntletapp`)** | Operator surface: Threat Dashboard, CoachLab, Fix Lab, Analytics. Real browser-side UiPath API calls. |

Current corpus: 42 fights against `fake-ceo-naive` (the demo fixture), with several attacks authored by the Coach mid-fight.

## UiPath components used

| Layer | UiPath component |
|---|---|
| Fight orchestration | Maestro Case (`FightArena`) + Maestro Flow (`RoundOrchestrator`) |
| Attack & fix authoring | Python agents (`gauntlet coach`, `gauntlet fix`) on LangGraph + Claude Opus |
| Persistent regression set | Test Manager (auto-populated by Coach) |
| Human-in-the-loop fix review | Action Center tasks |
| Operator surface | UiPath Coded App (`gauntletapp`), React + `@uipath/uipath-typescript` SDK |
| Live data | Browser-side calls to `maestro.processes.instances`, Test Manager, Action Center |

## Built with Claude Code

Gauntlet was built entirely with Claude Code as the coding agent. Thematically right: an agent building a tool to keep agents honest. Counts toward the AgentHack coding-agent bonus.

## Repo layout

```
.
├── src/gauntlet/           Python package — coach, fix, referee, runner, CLI
├── uipath/
│   ├── gauntlet/           UiPath solution
│   │   ├── FightArena/         Maestro Case
│   │   ├── RoundOrchestrator/  Maestro Flow
│   │   ├── MetroBankCSR/       Agent Builder agent (Blue target)
│   │   └── RefereeAgent/       Agent Builder agent (judge)
│   └── gauntlet-console/   React Coded App (`gauntletapp`)
├── personas/               Red attack persona library (YAML)
├── scenarios/              Fight scenarios (YAML)
├── scripts/                Test Manager import helper
└── docs/PERSONAS.md        Red-team persona reference
```

## Getting started

Prerequisites:
- UiPath Automation Cloud tenant
- Python 3.11+
- Node.js 20+
- `uip` CLI (`npm i -g @uipath/cli`) — version 1.0.4+
- Anthropic API key

```bash
# Python side
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env  # fill in ANTHROPIC_API_KEY and UiPath creds

# Log in to UiPath
uip login

# Run one fight via CLI
gauntlet fight fake-ceo-naive

# Let the Coach invent a new attack
gauntlet coach --auto-fight

# Recommend a fix for a losing fight
gauntlet fix runs/<fight-id>.json
```

For the Coded App:

```bash
cd uipath/gauntlet-console
npm install
npm run dev          # local
npm run build && uip codedapp publish    # deploy to your tenant
```

## How it positions

Gauntlet is the adversarial complement to UiPath Agent Evaluations. Where Agent Evaluations score your agent against a static rubric, Gauntlet scores it against an opponent that's actively trying to break it — and turns every successful attack into a permanent test case. Every fight is double-tagged with **OWASP LLM Top-10** and **MITRE ATLAS**, so coverage becomes a matrix a compliance officer can read.

## License

MIT — see [LICENSE](LICENSE).
