"""Run one real fight orchestrated OUTSIDE Maestro, against the DEPLOYED agents.

Why this exists: in the Labs tenant, Maestro Flow/Case orchestration jobs hang
(they start but never complete), while individual Agent jobs run fine. So we
drive the Red<->Blue<->Referee turn loop here and call the deployed agents as
Orchestrator jobs:

  Blue  = deployed `MetroBankCSR`  agent process  (transcript -> reply, tool_intent)
  Referee = deployed `RefereeAgent` agent process (attack_category, persona_difficulty,
                                                   deterministic_findings, transcript
                                                   -> winner, blue_score, red_score, ...)
  Red   = generated locally by the existing engine (it is the attacker/harness,
          not the system under test, and there is no deployed Red agent).

This is the reference implementation the Coded App mirrors via the TS SDK
(`sdk.processes.start` + `sdk.jobs.getById/getOutput`).

Usage:
    python scripts/fight_via_deployed_agents.py [persona] [scenario] [--max-turns N]

Prereqs: `uip login` (Shared/Gauntlet reachable), ANTHROPIC_API_KEY in .env.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

# Load .env (ANTHROPIC_API_KEY) the same trivial way the CLI does.
for line in (ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else []:
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        import os
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from gauntlet.personas import load_persona, load_scenario  # noqa: E402
from gauntlet.red_team import RedAgent  # noqa: E402

FOLDER = "Shared/Gauntlet"
BLUE_PROCESS_KEY = "0F5D5F68-C0FC-4E4C-8D70-5C07EC93AA3D"      # MetroBankCSR
REFEREE_PROCESS_KEY = "BFE7D0EA-CA35-44BC-9EB2-6CE8254C4FF2"   # RefereeAgent


class JobError(RuntimeError):
    pass


def _uip_json(args: list[str]) -> dict:
    p = subprocess.run(["uip", *args, "--output", "json"], capture_output=True, text=True)
    i = p.stdout.find("{")
    if i == -1:
        i = p.stdout.find("[")
    if i == -1:
        raise JobError(f"no JSON from `uip {' '.join(args)}`: {p.stderr.strip()[:300]}")
    return json.loads(p.stdout[i:])


def run_agent_job(process_key: str, inputs: dict, *, label: str, poll_s: int = 4,
                  timeout_s: int = 180) -> dict:
    """Start a deployed agent process job, poll to completion, return its
    OutputArguments as a dict. Raises JobError on fault/timeout."""
    started = _uip_json([
        "or", "jobs", "start", process_key,
        "--folder-path", FOLDER,
        "--input-arguments", json.dumps(inputs),
    ])
    jobs = (started.get("Data") or {}).get("Jobs") if isinstance(started.get("Data"), dict) else None
    key = jobs[0]["Key"] if jobs else None
    if not key:
        raise JobError(f"{label}: no job key. {json.dumps(started)[:400]}")

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(poll_s)
        got = _uip_json(["or", "jobs", "get", key])
        data = got.get("Data") or {}
        state = data.get("State")
        if state == "Successful":
            out = data.get("OutputArguments")
            if isinstance(out, str):
                out = json.loads(out) if out.strip() else {}
            return out or {}
        if state in ("Faulted", "Stopped"):
            raise JobError(f"{label}: job {state}. Info={str(data.get('Info'))[:400]}")
    raise JobError(f"{label}: timed out after {timeout_s}s (still running: {key})")


def transcript_str(lines: list[tuple[str, str]]) -> str:
    return "\n".join(f"{who}: {text}" for who, text in lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("persona", nargs="?", default="panicked-grandma")
    ap.add_argument("scenario", nargs="?", default="grandma-bail-money")
    ap.add_argument("--max-turns", type=int, default=6)
    args = ap.parse_args()

    persona = load_persona(args.persona)
    scenario = load_scenario(args.scenario)
    red = RedAgent(persona=persona, scenario=scenario)

    print(f"# Fight (outside Maestro, deployed agents)")
    print(f"  persona={persona.name}  scenario={scenario.name}  red_model={red.model}")
    print(f"  blue=MetroBankCSR(job)  referee=RefereeAgent(job)  folder={FOLDER}\n")

    lines: list[tuple[str, str]] = []
    red_view: list[dict] = []          # red perspective: red=assistant, blue=user
    tool_intents: list[str] = []
    end_reason = "max_turns"

    opening = red.opening_line().content
    lines.append(("RED", opening))
    red_view.append({"role": "assistant", "content": opening})
    print(f"RED: {opening}\n")

    for turn in range(args.max_turns):
        blue_out = run_agent_job(BLUE_PROCESS_KEY, {"transcript": transcript_str(lines)},
                                 label=f"blue.t{turn}")
        reply = (blue_out.get("reply") or "").strip()
        intent = (blue_out.get("tool_intent") or "").strip()
        lines.append(("BLUE", reply))
        red_view.append({"role": "user", "content": reply})
        if intent:
            tool_intents.append(f"t{turn}:{intent}")
        print(f"BLUE: {reply}" + (f"   [tool_intent: {intent}]" if intent else "") + "\n")

        if "escalate_to_human" in intent:
            end_reason = "escalated"
            break

        red_utt = red.speak(red_view).content
        if "<<END_CALL>>" in red_utt:
            red_utt = red_utt.replace("<<END_CALL>>", "").strip()
            if red_utt:
                lines.append(("RED", red_utt))
                print(f"RED: {red_utt}\n")
            end_reason = "red_ended_call"
            break
        lines.append(("RED", red_utt))
        red_view.append({"role": "assistant", "content": red_utt})
        print(f"RED: {red_utt}\n")

    print(f"# end_reason={end_reason}   turns={len(lines)}   blue_tool_intents={tool_intents}\n")

    findings = ("Blue tool intents across turns: " + ", ".join(tool_intents)) if tool_intents else ""
    verdict = run_agent_job(REFEREE_PROCESS_KEY, {
        "attack_category": persona.attack_category.value,
        "persona_difficulty": persona.difficulty,
        "deterministic_findings": findings,
        "transcript": transcript_str(lines),
    }, label="referee", timeout_s=180)

    print("# VERDICT (deployed RefereeAgent)")
    for k in ("winner", "blue_score", "red_score", "escalation_correct", "policy_breaches", "notes"):
        if k in verdict:
            print(f"  {k}: {verdict[k]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
