"""Persist fights to UiPath Test Manager as regression cases.

Shared by two callers:
  - the engine: `persist_fight(transcript, verdict)` files a breach the moment
    it lands (`gauntlet fight --test-manager`), so a red win becomes a permanent
    Test Manager regression automatically.
  - the batch importer: `scripts/import_runs_to_test_manager.py` folds the whole
    `runs/` corpus in one pass, reusing the same helpers.

Best-effort against the `uip tm` CLI. Needs `uip login` and a GAUNTLET project
(`uip tm project create --project-key GAUNTLET ...`). Callers that want graceful
degradation catch `TestManagerError`.
"""

from __future__ import annotations

import json
import subprocess
from typing import Any

PROJECT_KEY = "GAUNTLET"

# One test set per blue posture. Matches the postures the runner exercises.
TEST_SETS: dict[str, tuple[str, str]] = {
    "standard": ("Standard Blue", "Sonnet 4.6, strict MetroBank policy prompt"),
    "lenient": ("Lenient Blue", "Haiku 4.5, customer-experience-first soft policy"),
    "naive": ("Naive Blue", "Haiku 4.5, first-call-resolution pressure (escalation-averse)"),
    "external": ("External target", "Third-party LangGraph deployment, no tool access"),
}


class TestManagerError(RuntimeError):
    """A `uip tm` call failed: not logged in, project missing, or API error."""


def uip(*args: str) -> dict[str, Any]:
    """Run a `uip` command, parse its JSON, raise TestManagerError on failure."""
    result = subprocess.run(["uip", *args, "--output", "json"], capture_output=True, text=True)
    brace = result.stdout.find("{")
    if brace == -1:
        raise TestManagerError(
            f"no JSON in `uip {' '.join(args)}` output; stderr={result.stderr.strip()!r}"
        )
    payload = json.loads(result.stdout[brace:])
    if payload.get("Result") != "Success":
        raise TestManagerError(f"`uip {' '.join(args)}` failed: {payload.get('Message', payload)}")
    return payload


def list_testsets() -> dict[str, str]:
    payload = uip("tm", "testsets", "list", "--project-key", PROJECT_KEY)
    return {item["Name"]: item["TestSetKey"] for item in payload.get("Data", [])}


def list_testcases() -> dict[str, dict[str, str]]:
    # PascalCase: Name / TestCaseKey / Id. We keep both the key (for test-set
    # membership) and the UUID Id (which object-label assignment requires).
    payload = uip("tm", "testcases", "list", "--project-key", PROJECT_KEY)
    return {
        item["Name"]: {"key": item["TestCaseKey"], "id": item["Id"]}
        for item in payload.get("Data", [])
    }


def create_testset(name: str, description: str) -> str:
    payload = uip(
        "tm", "testsets", "create", "--project-key", PROJECT_KEY,
        "--name", name, "--description", description,
    )
    return payload["Data"]["TestSetKey"]


def create_testcase(name: str, description: str) -> dict[str, str]:
    payload = uip(
        "tm", "testcases", "create", "--project-key", PROJECT_KEY,
        "--name", name, "--description", description,
    )
    d = payload["Data"]
    return {"key": d["TestCaseKey"], "id": d.get("Id", "")}


def add_to_set(testset_key: str, testcase_key: str) -> None:
    # Returns Failure for already-present membership; swallow it (best-effort).
    subprocess.run(
        ["uip", "tm", "testcases", "add", "--test-set-key", testset_key,
         "--test-case-keys", testcase_key, "--output", "json"],
        capture_output=True, text=True,
    )


# Referee verdict -> a filterable object label on the case. Complements the
# "Latest Result" column (see record_result): the label makes the suite
# filterable by defended/breached even between executions.
VERDICT_LABEL = {"blue": "defended", "red": "breached", "draw": "inconclusive"}


def label_case(object_id: str, winner: str) -> None:
    """Set the outcome label on a test case, authoritatively (replaces any prior
    outcome label, so a re-run that flips the verdict updates it). Best-effort."""
    if not object_id:
        return
    label = VERDICT_LABEL.get(winner, "inconclusive")
    subprocess.run(
        ["uip", "tm", "objectlabel", "add", "--project-key", PROJECT_KEY,
         "--object-type", "TestCase", "--object-ids", object_id,
         "--labels", label, "--remove-other-labels", "--output", "json"],
        capture_output=True, text=True,
    )


# Referee verdict -> Test Manager "Latest Result". The referee IS the oracle,
# so we file a *manual* test execution and finish each case's log with its
# verdict — the same "report results from an external source" path Test Manager
# offers for CI. Test Manager re-runs nothing; a re-fight that flips the verdict
# just stamps a newer execution, so "Latest Result" self-updates.
#   blue holds -> Passed, red breach -> Failed, draw -> Restricted (inconclusive)
VERDICT_RESULT = {"blue": "Passed", "red": "Failed", "draw": "Restricted"}


def run_testset_manual(testset_key: str) -> str:
    """Open a manual execution for a test set; return its execution id. The
    execution auto-creates one (unset) result slot per member case."""
    payload = uip("tm", "testsets", "run", "--test-set-key", testset_key,
                  "--execution-type", "manual")
    return payload["Data"]["ExecutionId"]


def record_result(execution_id: str, case_id: str, winner: str) -> None:
    """Stamp one case's referee verdict as its manual result (start + finish)."""
    if not case_id:
        return
    result = VERDICT_RESULT.get(winner, "Restricted")
    uip("tm", "testcaselog", "start", "--project-key", PROJECT_KEY,
        "--execution-id", execution_id, "--test-case-id", case_id)
    uip("tm", "testcaselog", "finish", "--project-key", PROJECT_KEY,
        "--execution-id", execution_id, "--test-case-id", case_id,
        "--result", result, "--has-error", "false",
        "--executed-by", "Gauntlet Referee", "--run-id", "1")


def fight_to_test_case(payload: dict[str, Any], source: str = "") -> dict[str, str]:
    """Build the {name, description, blue_mode, winner} for one fight payload
    (`{"transcript": ..., "verdict": ...}`, the shape `save_run` writes).

    The NAME is the idempotency key, so it never includes the source path.
    """
    transcript = payload["transcript"]
    verdict = payload["verdict"]

    blue_mode = transcript.get("blue_mode", "standard")
    persona = transcript["persona_name"]
    winner = verdict["winner"]

    # Attack-keyed name (posture x persona x scenario): one case tracks one
    # attack over time. The outcome lives in the description + an object label
    # (see label_case), so a fix that flips red->blue updates THIS case rather
    # than spawning a new one.
    name = f"[{blue_mode}] {persona} · {transcript['scenario_name']}"

    lines = [
        f"**Fight ID:** {transcript['fight_id']}",
        f"**Persona:** {persona}",
        f"**Scenario:** {transcript['scenario_name']}",
        f"**Blue mode:** {blue_mode}",
        f"**Blue model:** {transcript.get('blue_model', '?')}",
        f"**Red model:** {transcript.get('red_model', '?')}",
        f"**End reason:** {transcript.get('end_reason')}",
        f"**Turns:** {len(transcript['utterances'])}",
        "",
        f"## Verdict — {winner.upper()}",
        f"Blue {verdict['blue_score']} / Red {verdict['red_score']}",
        "",
        verdict.get("notes", ""),
        "",
    ]
    if verdict.get("policy_breaches"):
        lines.append("## Policy breaches")
        lines += [f"- {b}" for b in verdict["policy_breaches"]]
        lines.append("")
    if verdict.get("deterministic_findings"):
        lines.append("## Deterministic findings")
        lines += [f"- {f}" for f in verdict["deterministic_findings"]]
        lines.append("")
    if source:
        lines.append(f"_Source: `{source}`_")

    description = "\n".join(lines)
    if len(description) > 6000:  # Test Manager caps description length; trim hard.
        description = description[:5990] + "\n...[truncated]"

    return {"name": name, "description": description, "blue_mode": blue_mode, "winner": winner}


# Per-process cache so batch / coach runs don't re-resolve the set every fight.
_SET_CACHE: dict[str, str] = {}


def ensure_testset(mode: str) -> str:
    mode = mode if mode in TEST_SETS else "standard"
    if mode in _SET_CACHE:
        return _SET_CACHE[mode]
    name, desc = TEST_SETS[mode]
    key = list_testsets().get(name) or create_testset(name, desc)
    _SET_CACHE[mode] = key
    return key


def persist_fight(transcript: Any, verdict: Any) -> str:
    """File one fight as a Test Manager regression case and add it to the
    blue-mode test set. Returns the test case key. Idempotent on the case name.

    Raises TestManagerError on any `uip` failure; the caller decides whether to
    warn (best-effort) or stop. Intended for a red win (a breach), but works for
    any verdict.
    """
    payload = {
        "transcript": transcript.model_dump(mode="json"),
        "verdict": verdict.model_dump(mode="json"),
    }
    tc = fight_to_test_case(payload, source=f"gauntlet fight · {transcript.fight_id}")
    set_key = ensure_testset(tc["blue_mode"])
    existing = list_testcases().get(tc["name"])
    if existing:
        case_key, case_id = existing["key"], existing["id"]
    else:
        made = create_testcase(tc["name"], tc["description"])
        case_key, case_id = made["key"], made["id"]
    label_case(case_id, tc["winner"])  # newest verdict wins the outcome label
    add_to_set(set_key, case_key)
    return case_key
