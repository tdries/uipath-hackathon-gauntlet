"""Round runner — orchestrates one fight end-to-end.

This is what Maestro Case will replace in Phase 2. For now, plain Python.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from gauntlet.blue_team import BlueAgent
from gauntlet.models import Persona, Scenario, Transcript, Verdict
from gauntlet.red_team import RedAgent
from gauntlet.referee import judge
from gauntlet.tools import ToolLedger

RUNS_DIR = Path(__file__).resolve().parents[2] / "runs"


def run_fight(
    persona: Persona,
    scenario: Scenario,
    *,
    max_turns: int = 14,
    blue: BlueAgent | None = None,
    on_utterance=None,
) -> tuple[Transcript, Verdict]:
    """Run one adversarial round. Returns (transcript, verdict).

    `on_utterance` is an optional callback `(utterance) -> None` for live
    streaming to a UI / terminal.
    """

    blue = blue or BlueAgent()
    red = RedAgent(persona=persona, scenario=scenario)
    planted = (
        [c.model_dump(mode="json") for c in scenario.planted_correspondence]
        if scenario.planted_correspondence
        else None
    )
    ledger = ToolLedger(planted_correspondence=planted)

    transcript = Transcript(
        fight_id=f"fight-{uuid.uuid4().hex[:8]}",
        persona_name=persona.name,
        scenario_name=scenario.name,
        blue_model=blue.model,
        blue_mode=blue.mode,
        red_model=red.model,
    )

    # Two parallel conversation views — each side sees the other as "user".
    blue_view: list[dict[str, Any]] = []
    red_view: list[dict[str, Any]] = []

    def emit(u):
        transcript.utterances.append(u)
        if on_utterance:
            on_utterance(u)

    # Red opens with its scripted opening line.
    opening = red.opening_line()
    emit(opening)
    blue_view.append({"role": "user", "content": opening.content})
    red_view.append({"role": "assistant", "content": opening.content})

    end_token = "<<END_CALL>>"

    for turn in range(max_turns):
        # Blue responds.
        blue_utt = blue.respond(conversation=blue_view, ledger=ledger)
        emit(blue_utt)
        red_view.append({"role": "user", "content": blue_utt.content})

        if ledger.escalations:
            transcript.end_reason = "escalated"
            break

        # Red speaks again (no tools — just text).
        red_utt = red.speak(red_view)

        # Strip the END_CALL token from the visible content but use it as a signal.
        if end_token in red_utt.content:
            red_utt.content = red_utt.content.replace(end_token, "").strip()
            if red_utt.content:
                emit(red_utt)
                blue_view.append({"role": "user", "content": red_utt.content})
            transcript.end_reason = "red_ended_call"
            break

        emit(red_utt)
        blue_view.append({"role": "user", "content": red_utt.content})
        red_view.append({"role": "assistant", "content": red_utt.content})

        # Quick exit if blue clearly broke policy this turn.
        if ledger.transfers_initiated or ledger.balances_disclosed:
            # Don't end immediately — let the conversation continue a turn or two so
            # the judge sees the aftermath. But cap it.
            if turn >= max_turns - 2:
                break

    else:
        transcript.end_reason = "max_turns"

    transcript.ended_at = datetime.utcnow()
    verdict = judge(persona=persona, transcript=transcript, ledger=ledger)
    return transcript, verdict


def save_run(transcript: Transcript, verdict: Verdict, label: str = "") -> Path:
    RUNS_DIR.mkdir(exist_ok=True)
    name = f"{transcript.started_at.strftime('%Y%m%d-%H%M%S')}-{transcript.fight_id}"
    if label:
        name = f"{name}-{label}"
    path = RUNS_DIR / f"{name}.json"
    payload = {
        "transcript": transcript.model_dump(mode="json"),
        "verdict": verdict.model_dump(mode="json"),
    }
    path.write_text(json.dumps(payload, indent=2, default=str))
    return path


def aggregate_runs_to_jsonl(out_path: Path) -> int:
    """Write all runs/*.json as a single JSONL file (one fight per line).

    Returns the number of fights written. This produces the Phase 1
    milestone artifact: one file with all fights and verdicts.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out_path.open("w") as fh:
        for run_file in sorted(RUNS_DIR.glob("*.json")):
            payload = json.loads(run_file.read_text())
            fh.write(json.dumps(payload, default=str) + "\n")
            count += 1
    return count
