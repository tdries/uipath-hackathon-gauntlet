"""Push the local fight corpus into UiPath Test Manager (batch).

Each fight in `runs/*.json` becomes a Test Manager regression case in the
GAUNTLET project, grouped into a test set by blue mode. Idempotent on names.

This is the bulk sibling of the live path: it reuses `gauntlet.test_manager`,
the exact module `gauntlet fight --test-manager` calls to file a breach the
moment it lands. One code path, two entry points.

Usage:
    python scripts/import_runs_to_test_manager.py

Prereqs:
    - `uip` CLI logged in (`uip login`)
    - Test Manager enabled on the tenant
    - GAUNTLET project exists (`uip tm project create --project-key GAUNTLET ...`)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Make src/ importable when run as a plain script (no install required; the
# module is stdlib-only, and gauntlet/__init__.py is trivial).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from gauntlet.test_manager import (  # noqa: E402
    TEST_SETS,
    add_to_set,
    create_testcase,
    create_testset,
    fight_to_test_case,
    label_case,
    list_testcases,
    list_testsets,
    record_result,
    run_testset_manual,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = REPO_ROOT / "runs"


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
    sets_existing = list_testsets()
    cases_existing = list_testcases()
    print(f"  existing test sets: {len(sets_existing)}   test cases: {len(cases_existing)}")

    print("\nUpserting test sets (one per blue mode)...")
    set_keys: dict[str, str] = {}
    for mode, (name, desc) in TEST_SETS.items():
        key = sets_existing.get(name)
        if key:
            print(f"  ↳ test set {name!r} exists ({key})")
        else:
            key = create_testset(name, desc)
            print(f"  ↳ test set {name!r} created ({key})")
        set_keys[mode] = key

    print(f"\nUpserting {len(run_files)} test cases...")
    counts = {"created": 0, "existing": 0, "skipped": 0}
    winners: dict[str, str] = {}  # case name -> newest verdict (runs are chronological)
    for i, p in enumerate(run_files, 1):
        try:
            payload = json.loads(p.read_text())
            tc = fight_to_test_case(payload, source=f"runs/{p.name}")
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i}/{len(run_files)}] {p.name}: SKIPPED ({exc})")
            counts["skipped"] += 1
            continue

        info = cases_existing.get(tc["name"])
        if info:
            key, cid = info["key"], info["id"]
            counts["existing"] += 1
            marker = "↻"
        else:
            made = create_testcase(tc["name"], tc["description"])
            key, cid = made["key"], made["id"]
            cases_existing[tc["name"]] = {"key": key, "id": cid}
            counts["created"] += 1
            marker = "+"

        # Newest fight's verdict wins the outcome label (runs are chronological).
        label_case(cid, tc["winner"])
        winners[tc["name"]] = tc["winner"]
        set_key = set_keys.get(tc["blue_mode"])
        if set_key:
            add_to_set(set_key, key)

        print(f"  [{i}/{len(run_files)}] {marker} {tc['winner']:5} {tc['name'][:78]}")

    print(
        f"\nDone.  created: {counts['created']}   "
        f"existing: {counts['existing']}   skipped: {counts['skipped']}"
    )

    # Stamp the referee verdict as each case's "Latest Result": one manual test
    # execution per set, finishing every member case's log. This is what fills
    # the Test Manager "Latest Result" column for real (self-updating on re-run).
    print("\nStamping Latest Result (one manual execution per set)...")
    for mode, (setname, _) in TEST_SETS.items():
        set_key = set_keys.get(mode)
        if not set_key:
            continue
        members = {n: info for n, info in cases_existing.items() if n.startswith(f"[{mode}] ")}
        if not members:
            continue
        exec_id = run_testset_manual(set_key)
        stamped = {"Passed": 0, "Failed": 0, "Restricted": 0}
        for name, info in members.items():
            winner = winners.get(name, "draw")
            record_result(exec_id, info["id"], winner)
            stamped[{"blue": "Passed", "red": "Failed"}.get(winner, "Restricted")] += 1
        print(
            f"  ↳ {setname}: {len(members)} cases  "
            f"(Passed {stamped['Passed']} / Failed {stamped['Failed']} / "
            f"Restricted {stamped['Restricted']})  exec {exec_id}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
