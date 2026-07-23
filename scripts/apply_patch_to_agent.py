"""Apply a Fix Recommender prompt patch to the deployed MetroBankCSR agent.

Closes the last arc of the self-hardening loop. The app's "Apply patch to
agent" button files an Action Center approval task carrying the patch; after a
human approves, run this to actually harden the agent: it appends the patch to
MetroBankCSR's system prompt and republishes the agent to Orchestrator.

Usage:
    python scripts/apply_patch_to_agent.py --fight <fight_id>            # dry run (default)
    python scripts/apply_patch_to_agent.py --fight <fight_id> --confirm  # patch + republish

Dry run prints the patch and the commands, changing nothing. --confirm writes
the two agent.json files, drops the stale contentTokens (so they re-tokenize),
then runs `uip agent publish` + `uip agent deploy`. Idempotent: a patch already
present is skipped.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOLUTION_DIR = ROOT / "uipath" / "gauntlet"
AGENT_DIR = SOLUTION_DIR / "MetroBankCSR"
AGENT_JSONS = [AGENT_DIR / "agent.json", AGENT_DIR / ".agent-builder" / "agent.json"]
RUNS = ROOT / "runs"
MARKER = "# HARDENING PATCH (applied by Gauntlet Fix Recommender)"


def find_fix(fight_id: str) -> dict:
    for p in sorted(RUNS.glob("*.fix.json")):
        try:
            d = json.loads(p.read_text())
        except Exception:  # noqa: BLE001
            continue
        if d.get("fight_id") == fight_id or fight_id in p.name:
            return d
    raise SystemExit(f"No .fix.json found for fight {fight_id!r} in {RUNS}/")


def patch_block(fix: dict) -> str:
    pp = fix.get("prompt_patch", {})
    lines = pp.get("patch_lines", [])
    body = "\n".join(lines) if isinstance(lines, list) else str(lines)
    return f"\n\n{MARKER}\n# Section: {pp.get('section', '')}\n{body}\n"


def apply_to_files(block: str) -> None:
    for f in AGENT_JSONS:
        if not f.exists():
            continue
        d = json.loads(f.read_text())
        sys_msg = next((m for m in d.get("messages", []) if m.get("role") == "system"), None)
        if not sys_msg:
            print(f"  ! no system message in {f}")
            continue
        if MARKER in str(sys_msg.get("content", "")):
            print(f"  = {f.name}: patch already present, skipping")
            continue
        sys_msg["content"] = str(sys_msg.get("content", "")) + block
        sys_msg.pop("contentTokens", None)  # force re-tokenization on publish
        f.write_text(json.dumps(d, indent=2))
        print(f"  ✓ patched {f.relative_to(ROOT)}")


def run(cmd: list[str]) -> int:
    print("  $", " ".join(cmd))
    return subprocess.run(cmd, cwd=AGENT_DIR).returncode


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fight", required=True)
    ap.add_argument("--confirm", action="store_true", help="write files + push to Studio Web (else dry run)")
    ap.add_argument("--deploy", action="store_true", help="also publish + deploy (go live in Orchestrator)")
    a = ap.parse_args()

    fix = find_fix(a.fight)
    block = patch_block(fix)
    print(f"# Apply hardening patch to MetroBankCSR  (fight {a.fight})")
    print(f"# persona={fix.get('persona_name')}  section={fix.get('prompt_patch', {}).get('section')}")
    print("# Appending to the system prompt:")
    print(block)

    if not a.confirm:
        print("DRY RUN. Re-run with --confirm to patch agent.json + push to Studio Web.")
        return 0

    apply_to_files(block)
    if a.deploy:
        print("# Publishing + deploying (goes LIVE in Orchestrator):")
        run(["uip", "agent", "publish"])
        rc = run(["uip", "agent", "deploy"])
    else:
        print("# Uploading the solution to Studio Web (edit lands in Agent Studio; NOT deployed):")
        run(["uip", "solution", "resources", "refresh", "--solution-folder", str(SOLUTION_DIR)])
        rc = run(["uip", "solution", "upload", str(SOLUTION_DIR), "--force"])
    print("done." if rc == 0 else f"returned {rc}; check the uip agent output above.")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
