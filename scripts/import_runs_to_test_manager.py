"""Push the local fight corpus into UiPath Test Manager.

Each fight in `runs/*.json` becomes a test case in the GAUNTLET project,
grouped into one of three test sets by blue mode. Existing test cases /
sets are left alone — the script is idempotent on names.

Usage:
    python scripts/import_runs_to_test_manager.py

Prereqs:
    - `uip` CLI logged in (`uip login`)
    - Test Manager enabled on the tenant
    - GAUNTLET project exists (`uip tm project create --project-key GAUNTLET ...`)
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = REPO_ROOT / "runs"
PROJECT_KEY = "GAUNTLET"

TEST_SETS = {
    "standard": ("Standard Blue", "Sonnet 4.6, strict MetroBank policy prompt"),
    "lenient": ("Lenient Blue", "Haiku 4.5, customer-experience-first soft policy"),
    "naive": ("Naive Blue", "Haiku 4.5, first-call-resolution pressure (escalation-averse)"),
}


def uip(*args: str) -> dict:
    """Run a uip command and parse its JSON output. Raises on non-Success."""
    result = subprocess.run(
        ["uip", *args, "--output", "json"],
        capture_output=True,
        text=True,
    )
    # Strip CLI banner noise that comes on stderr / before the JSON.
    stdout = result.stdout
    brace = stdout.find("{")
    if brace == -1:
        raise RuntimeError(f"no JSON in uip output:\nstdout={stdout!r}\nstderr={result.stderr!r}")
    payload = json.loads(stdout[brace:])
    if payload.get("Result") != "Success":
        raise RuntimeError(f"uip failed: {payload}")
    return payload


def existing_testsets() -> dict[str, str]:
    """Return {name: key} for existing test sets in the project."""
    payload = uip("tm", "testsets", "list", "--project-key", PROJECT_KEY)
    return {item["Name"]: item["TestSetKey"] for item in payload.get("Data", [])}


def existing_testcases() -> dict[str, str]:
    """Return {name: key} for existing test cases in the project."""
    payload = uip("tm", "testcases", "list", "--project-key", PROJECT_KEY)
    # list payload uses lowercase 'name'/'objKey' (different from create).
    return {item["name"]: item["objKey"] for item in payload.get("Data", [])}


def upsert_testset(name: str, description: str, existing: dict[str, str]) -> str:
    if name in existing:
        print(f"  ↳ test set {name!r} exists ({existing[name]})")
        return existing[name]
    payload = uip(
        "tm",
        "testsets",
        "create",
        "--project-key",
        PROJECT_KEY,
        "--name",
        name,
        "--description",
        description,
    )
    key = payload["Data"]["TestSetKey"]
    print(f"  ↳ test set {name!r} created ({key})")
    return key


def upsert_testcase(name: str, description: str, existing: dict[str, str]) -> tuple[str, bool]:
    """Returns (test_case_key, was_existing)."""
    if name in existing:
        return existing[name], True
    payload = uip(
        "tm",
        "testcases",
        "create",
        "--project-key",
        PROJECT_KEY,
        "--name",
        name,
        "--description",
        description,
    )
    return payload["Data"]["TestCaseKey"], False


def add_to_set(testset_key: str, testcase_key: str) -> None:
    # Returns Failure for already-present membership; that's fine, swallow.
    result = subprocess.run(
        [
            "uip",
            "tm",
            "testcases",
            "add",
            "--test-set-key",
            testset_key,
            "--test-case-keys",
            testcase_key,
            "--output",
            "json",
        ],
        capture_output=True,
        text=True,
    )
    # Best-effort — log but don't raise.
    if '"Success"' not in result.stdout:
        msg = result.stdout.strip().splitlines()
        snippet = msg[-1] if msg else "(no stdout)"
        print(f"    ⚠ add {testcase_key} → {testset_key}: {snippet[:100]}")


def fight_to_test_case(run_path: Path) -> dict:
    payload = json.loads(run_path.read_text())
    transcript = payload["transcript"]
    verdict = payload["verdict"]

    blue_mode = transcript.get("blue_mode", "standard")
    persona = transcript["persona_name"]
    scenario = transcript["scenario_name"]
    winner = verdict["winner"]
    blue_score = verdict["blue_score"]
    red_score = verdict["red_score"]

    winner_tag = {"red": "🩸 RED wins", "blue": "🛡 BLUE holds", "draw": "— draw"}[winner]
    name = f"[{blue_mode}] {persona} vs MetroBank CSR — {winner_tag}"

    lines = [
        f"**Fight ID:** {transcript['fight_id']}",
        f"**Persona:** {persona}",
        f"**Scenario:** {scenario}",
        f"**Blue mode:** {blue_mode}",
        f"**Blue model:** {transcript['blue_model']}",
        f"**Red model:** {transcript['red_model']}",
        f"**End reason:** {transcript['end_reason']}",
        f"**Turns:** {len(transcript['utterances'])}",
        "",
        f"## Verdict — {winner.upper()}",
        f"Blue {blue_score} / Red {red_score}",
        "",
        f"{verdict['notes']}",
        "",
    ]
    if verdict.get("policy_breaches"):
        lines.append("## Policy breaches")
        for b in verdict["policy_breaches"]:
            lines.append(f"- {b}")
        lines.append("")
    if verdict.get("deterministic_findings"):
        lines.append("## Deterministic findings")
        for f in verdict["deterministic_findings"]:
            lines.append(f"- {f}")
        lines.append("")

    lines.append(f"_Source: `runs/{run_path.name}`_")
    description = "\n".join(lines)

    # Test Manager has practical limits on description length; trim hard.
    if len(description) > 6000:
        description = description[:5990] + "\n...[truncated]"

    return {
        "name": name,
        "description": description,
        "blue_mode": blue_mode,
        "winner": winner,
    }


def main() -> int:
    if not RUNS_DIR.exists():
        print(f"runs/ not found at {RUNS_DIR}", file=sys.stderr)
        return 1

    run_files = sorted(p for p in RUNS_DIR.glob("*.json") if not p.name.startswith("_"))
    if not run_files:
        print("no run files found", file=sys.stderr)
        return 1

    print(f"Found {len(run_files)} fight files.")
    print("Loading existing test sets + cases...")
    sets_existing = existing_testsets()
    cases_existing = existing_testcases()
    print(f"  existing test sets: {len(sets_existing)}")
    print(f"  existing test cases: {len(cases_existing)}")

    print("\nUpserting test sets (one per blue mode)...")
    set_keys = {
        mode: upsert_testset(name, desc, sets_existing)
        for mode, (name, desc) in TEST_SETS.items()
    }

    print(f"\nUpserting {len(run_files)} test cases...")
    counts = {"red": 0, "blue": 0, "draw": 0, "skipped": 0, "created": 0}
    for i, p in enumerate(run_files, 1):
        try:
            tc = fight_to_test_case(p)
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i}/{len(run_files)}] {p.name}: SKIPPED ({exc})")
            counts["skipped"] += 1
            continue

        key, was_existing = upsert_testcase(tc["name"], tc["description"], cases_existing)
        set_key = set_keys.get(tc["blue_mode"])
        if set_key:
            add_to_set(set_key, key)

        counts[tc["winner"]] += 1
        if not was_existing:
            counts["created"] += 1

        marker = "↻" if was_existing else "+"
        print(
            f"  [{i}/{len(run_files)}] {marker} {tc['winner']:5} {tc['name'][:80]}"
        )

    print("\nDone.")
    print(
        f"  created: {counts['created']}   "
        f"red wins: {counts['red']}   blue wins: {counts['blue']}   "
        f"draws: {counts['draw']}   skipped: {counts['skipped']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
