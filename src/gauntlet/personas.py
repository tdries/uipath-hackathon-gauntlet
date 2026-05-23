"""Persona + scenario YAML loaders."""

from __future__ import annotations

from pathlib import Path

import yaml

from gauntlet.models import Persona, Scenario

REPO_ROOT = Path(__file__).resolve().parents[2]
PERSONA_DIR = REPO_ROOT / "personas"
SCENARIO_DIR = REPO_ROOT / "scenarios"


def load_persona(name: str) -> Persona:
    path = PERSONA_DIR / f"{name}.yaml"
    data = yaml.safe_load(path.read_text())
    return Persona.model_validate(data)


def load_scenario(name: str) -> Scenario:
    path = SCENARIO_DIR / f"{name}.yaml"
    data = yaml.safe_load(path.read_text())
    return Scenario.model_validate(data)


def list_personas() -> list[str]:
    return sorted(p.stem for p in PERSONA_DIR.glob("*.yaml"))


def list_scenarios() -> list[str]:
    return sorted(p.stem for p in SCENARIO_DIR.glob("*.yaml"))


# Canonical (persona, scenario) pairings. Each persona was written with a
# specific scenario in mind; this is the default batch matrix. Cross-pairing
# is possible by passing explicit pairs to the batch command.
CANONICAL_PAIRS: list[tuple[str, str]] = [
    ("panicked-grandma", "grandma-bail-money"),
    ("aggressive-lawyer", "lawyer-trust-transfer"),
    ("executor-of-the-will", "will-executor-claim"),
    ("prompt-injector", "prompt-injection-probe"),
    ("fake-ceo", "acme-roofing-bec"),
    ("multi-turn-erosion", "long-con-erosion"),
]
