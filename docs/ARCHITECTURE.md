# Gauntlet — Architecture

## Mental model

Gauntlet pits a **Red Coach** agent against a **Blue target** agent in continuous rounds. Each round is one Maestro Flow execution inside a long-running Maestro Case. When Red wins a round, the Coach saves the winning attack into UiPath Test Manager as a permanent regression test. When Red loses, the Coach mutates its strategy and tries again, eventually inventing entirely new attack personas via Claude Opus.

The whole loop is observable and operable through a UiPath Coded App that talks to the user's tenant in real time.

## The agent cast

| Role | UiPath component | Backed by |
|---|---|---|
| **Blue target (SUT)** | Agent Builder agent (`MetroBankCSR`) or any external target | Configurable LLM |
| **Red Coach** | Python coded agent (`src/gauntlet/coach.py`) | Claude Opus + LangGraph |
| **Referee** | Agent Builder agent (`RefereeAgent`) | LLM judge with rubric |
| **Fix Recommender** | Python coded agent (`src/gauntlet/fix.py`) | Claude Opus |
| **FightArena** | Maestro Case | Case orchestration |
| **RoundOrchestrator** | Maestro Flow | Per-round flow |
| **Console** | Coded App (`gauntletapp`) | React + `@uipath/uipath-typescript` |

## Round lifecycle

```
   ┌─────────┐    ┌──────────────┐    ┌─────────┐    ┌──────────┐
   │ Matched │ -> │ Negotiating  │ -> │ Verdict │ -> │ Archived │
   └─────────┘    └──────────────┘    └─────────┘    └──────────┘
                       │  ▲                │
                       │  │ (multi-turn    │
                       │  │  exchanges)    ▼
                       └──┘          (Coach updates
                                      Test Manager;
                                      Fix Recommender
                                      opens Action
                                      Center task on
                                      blue loss)
```

The Maestro Case (`FightArena`) is the round container. Each round is one execution of the Maestro Flow (`RoundOrchestrator`), which:

1. Pulls the next Red persona from the corpus (or asks the Coach to invent one)
2. Runs N exchanges between Red and Blue until Red gives up or Blue capitulates
3. Sends the transcript to the Referee
4. Posts the verdict back to the Case
5. If Blue lost, triggers the Fix Recommender, which opens an Action Center task

## Coach self-play loop

1. Pick the Red persona with the highest expected risk-weighted reward against this Blue target (Thompson sampling over the corpus).
2. If no persona has positive expected reward, ask Opus to author a new one, conditioned on the last K losing transcripts.
3. Run the round.
4. On win: persist the persona + transcript to Test Manager as a regression test.
5. On loss: update reward priors. Loop.

This is what makes the test suite grow without humans — the corpus is the byproduct of the Coach trying to maximize successful attacks.

## Tagging and coverage

Every fight is double-tagged:
- **OWASP LLM Top-10** — LLM01 prompt injection, LLM06 sensitive info disclosure, LLM07 insecure plugin design, etc.
- **MITRE ATLAS** — adversarial ML tactics and techniques

The Threat Dashboard renders these as a coverage heatmap. The audit story is: "here is every category we've attacked, and here is how the Blue target did on each."

## Coded App surfaces

| Tab | Purpose |
|---|---|
| **Dashboard** | Threat KPIs, critical findings, recent fights, mini coverage heatmap, quick actions |
| **CoachLab** | Inspect personas, kick off a fight, "Run Live" calls Anthropic directly from the browser using a user-pasted session key |
| **Fix Lab** | Open a failed fight, read the Fix Recommender's proposal, file an Action Center task |
| **Analytics** | Fight ladder vs. each Blue target, OWASP / MITRE coverage matrix, win-rate trends |

All UiPath surfaces (Maestro instances, Test Manager cases, Action Center tasks) are fetched in real time from the user's tenant via `@uipath/uipath-typescript`.

## What is *not* in the architecture

Earlier planning documents described HeyGen video avatars, a public MCP server, and a separate Next.js dashboard. None of those shipped. The Coded App replaced the dashboard, the CLI replaced the MCP layer for now, and the video embodiment was deferred. The README and this doc describe what is actually in the repo.
