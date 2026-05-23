"""CLI: python -m gauntlet ...  or  gauntlet ..."""

from __future__ import annotations

import json
import os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text

from gauntlet.blue_team import BlueAgent, make_blue
from gauntlet.coach import analyze_coverage_gaps, coach, select_instructive_fights
from gauntlet.dashboard import render as render_dashboard
from gauntlet.fix import (
    fix_path_for,
    propose_fix,
    select_diagnosable_runs,
    write_fix,
)
from gauntlet.personas import (
    CANONICAL_PAIRS,
    list_personas,
    list_scenarios,
    load_persona,
    load_scenario,
)
from gauntlet.runner import RUNS_DIR, aggregate_runs_to_jsonl, run_fight, save_run


def _load_dotenv() -> None:
    """Tiny dotenv: KEY=VALUE per line, # comments, no quoting magic."""
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ and value:
            os.environ[key] = value


_load_dotenv()
console = Console()


@click.group()
def main() -> None:
    """GAUNTLET — adversarial red-team arena for AI customer-service agents."""


@main.command("personas")
def cmd_personas() -> None:
    """List available red-team personas."""
    names = list_personas()
    if not names:
        console.print("[yellow]No personas found. Add YAML files to personas/[/yellow]")
        return
    t = Table(title="Red-team personas")
    t.add_column("name")
    t.add_column("category")
    t.add_column("difficulty")
    t.add_column("display name")
    for n in names:
        p = load_persona(n)
        t.add_row(p.name, p.attack_category.value, str(p.difficulty), p.display_name)
    console.print(t)


@main.command("scenarios")
def cmd_scenarios() -> None:
    """List available scenarios."""
    names = list_scenarios()
    if not names:
        console.print("[yellow]No scenarios found. Add YAML files to scenarios/[/yellow]")
        return
    t = Table(title="Scenarios")
    t.add_column("name")
    t.add_column("description")
    for n in names:
        s = load_scenario(n)
        t.add_row(s.name, s.description[:80])
    console.print(t)


@main.command("fight")
@click.argument("persona_name")
@click.option("--scenario", "scenario_name", required=True, help="Scenario YAML name.")
@click.option("--max-turns", default=14, show_default=True)
@click.option("--save/--no-save", default=True)
@click.option(
    "--blue-mode",
    type=click.Choice(["standard", "lenient", "naive", "external"]),
    default="standard",
    show_default=True,
    help=(
        "Blue CSR configuration: strict / lenient / naive (escalation-averse) "
        "/ external (LangGraph third-party deployment, no tool access)."
    ),
)
def cmd_fight(
    persona_name: str,
    scenario_name: str,
    max_turns: int,
    save: bool,
    blue_mode: str,
) -> None:
    """Run one fight: red persona vs blue (MetroBank CSR)."""
    persona = load_persona(persona_name)
    scenario = load_scenario(scenario_name)
    blue = make_blue(mode=blue_mode)  # type: ignore[arg-type]

    header = Panel.fit(
        Text.assemble(
            ("🩸 RED  ", "bold red"),
            (persona.display_name, "red"),
            ("  vs  ", "dim"),
            ("🛡 BLUE  ", "bold blue"),
            (f"MetroBank CSR ({blue_mode})", "blue"),
            "\n",
            (f"scenario: {scenario.name}    blue_model: {blue.model}", "dim"),
        ),
        title="GAUNTLET",
        border_style="magenta",
    )
    console.print(header)

    def on_utt(u):
        style = "red" if u.speaker == "red" else "blue" if u.speaker == "blue" else "dim"
        label = "RED" if u.speaker == "red" else "BLUE" if u.speaker == "blue" else u.speaker.upper()
        body = u.content
        if u.tool_calls:
            calls = ", ".join(c.name for c in u.tool_calls)
            body = f"{body}\n[dim]↳ tools: {calls}[/dim]"
        console.print(Panel.fit(body, title=label, border_style=style, padding=(0, 1)))

    transcript, verdict = run_fight(
        persona=persona,
        scenario=scenario,
        max_turns=max_turns,
        blue=blue,
        on_utterance=on_utt,
    )

    winner_color = {"red": "red", "blue": "blue", "draw": "yellow"}[verdict.winner]
    summary = Table(title="Verdict", show_header=False, title_style=f"bold {winner_color}")
    summary.add_column("k", style="dim")
    summary.add_column("v")
    summary.add_row("winner", f"[bold {winner_color}]{verdict.winner.upper()}[/bold {winner_color}]")
    summary.add_row("blue_score", str(verdict.blue_score))
    summary.add_row("red_score", str(verdict.red_score))
    summary.add_row("end_reason", str(transcript.end_reason))
    summary.add_row("notes", verdict.notes)
    if verdict.policy_breaches:
        summary.add_row("policy_breaches", "\n".join(f"• {b}" for b in verdict.policy_breaches))
    if verdict.deterministic_findings:
        summary.add_row(
            "deterministic", "\n".join(f"• {f}" for f in verdict.deterministic_findings)
        )
    console.print(summary)

    if save:
        path = save_run(transcript, verdict, label=persona.name)
        console.print(f"[dim]saved → {path}[/dim]")


@main.command("batch")
@click.option(
    "--pairs",
    "pairs_spec",
    default="canonical",
    show_default=True,
    help=(
        "'canonical' (one fight per canonical persona/scenario pair), "
        "'all' (cartesian product of every persona × every scenario), or "
        "a comma-separated list like 'panicked-grandma:grandma-bail-money,fake-ceo:acme-roofing-bec'."
    ),
)
@click.option(
    "--blue-modes",
    default="standard,lenient",
    show_default=True,
    help="Comma-separated blue modes to run each pair against.",
)
@click.option("--repeat", default=1, show_default=True, help="Repeat each combination N times.")
@click.option("--parallel", default=4, show_default=True, help="Concurrent fights.")
@click.option("--max-turns", default=14, show_default=True)
def cmd_batch(
    pairs_spec: str,
    blue_modes: str,
    repeat: int,
    parallel: int,
    max_turns: int,
) -> None:
    """Run a matrix of fights. The fastest way to grow the corpus."""
    pairs = _resolve_pairs(pairs_spec)
    modes = [m.strip() for m in blue_modes.split(",") if m.strip()]
    matrix: list[tuple[str, str, str, int]] = [
        (persona_name, scenario_name, mode, rep)
        for persona_name, scenario_name in pairs
        for mode in modes
        for rep in range(repeat)
    ]
    total = len(matrix)
    console.print(
        f"[bold magenta]GAUNTLET batch[/bold magenta]  "
        f"pairs={len(pairs)} modes={len(modes)} repeat={repeat} → {total} fights, "
        f"parallel={parallel}"
    )

    def _one(item: tuple[str, str, str, int]) -> dict:
        persona_name, scenario_name, mode, rep = item
        persona = load_persona(persona_name)
        scenario = load_scenario(scenario_name)
        blue = make_blue(mode=mode)  # type: ignore[arg-type]
        try:
            transcript, verdict = run_fight(
                persona=persona,
                scenario=scenario,
                max_turns=max_turns,
                blue=blue,
            )
            save_run(transcript, verdict, label=f"{persona.name}-{mode}")
            return {
                "ok": True,
                "persona": persona_name,
                "scenario": scenario_name,
                "mode": mode,
                "rep": rep,
                "winner": verdict.winner,
                "blue_score": verdict.blue_score,
                "red_score": verdict.red_score,
                "fight_id": transcript.fight_id,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "persona": persona_name,
                "scenario": scenario_name,
                "mode": mode,
                "rep": rep,
                "error": f"{type(exc).__name__}: {exc}",
            }

    results: list[dict] = []
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(f"Fighting (0/{total})...", total=total)
        with ThreadPoolExecutor(max_workers=parallel) as pool:
            futures = {pool.submit(_one, m): m for m in matrix}
            done = 0
            for fut in as_completed(futures):
                res = fut.result()
                results.append(res)
                done += 1
                if res["ok"]:
                    tag = {"red": "🩸RED", "blue": "🛡 BLUE", "draw": "—"}[res["winner"]]
                    progress.console.log(
                        f"[{done}/{total}] {res['persona']} vs {res['mode']} → "
                        f"{tag} ({res['blue_score']}/{res['red_score']})"
                    )
                else:
                    progress.console.log(
                        f"[{done}/{total}] {res['persona']} vs {res['mode']} → "
                        f"[red]ERROR[/red] {res['error']}"
                    )
                progress.update(task, advance=1, description=f"Fighting ({done}/{total})...")

    _print_batch_summary(results)


def _resolve_pairs(spec: str) -> list[tuple[str, str]]:
    spec = spec.strip()
    if spec == "canonical":
        return list(CANONICAL_PAIRS)
    if spec == "all":
        return [(p, s) for p in list_personas() for s in list_scenarios()]
    pairs: list[tuple[str, str]] = []
    for item in spec.split(","):
        item = item.strip()
        if not item:
            continue
        if ":" not in item:
            raise click.BadParameter(
                f"pair '{item}' must be of the form persona:scenario"
            )
        persona_name, scenario_name = item.split(":", 1)
        pairs.append((persona_name.strip(), scenario_name.strip()))
    return pairs


def _print_batch_summary(results: list[dict]) -> None:
    ok = [r for r in results if r["ok"]]
    bad = [r for r in results if not r["ok"]]
    by_mode_winner: dict[tuple[str, str], int] = defaultdict(int)
    for r in ok:
        by_mode_winner[(r["mode"], r["winner"])] += 1

    t = Table(title=f"Batch summary  ({len(ok)} ok, {len(bad)} errors)")
    t.add_column("blue mode", style="bold")
    t.add_column("🩸 red wins", justify="right", style="red")
    t.add_column("🛡 blue wins", justify="right", style="blue")
    t.add_column("draws", justify="right", style="yellow")
    t.add_column("blue win rate", justify="right")
    modes = sorted({r["mode"] for r in ok})
    for mode in modes:
        red_w = by_mode_winner[(mode, "red")]
        blue_w = by_mode_winner[(mode, "blue")]
        draws = by_mode_winner[(mode, "draw")]
        total = red_w + blue_w + draws
        rate = f"{blue_w / total:.0%}" if total else "—"
        t.add_row(mode, str(red_w), str(blue_w), str(draws), rate)
    console.print(t)

    if bad:
        console.print(f"[red]Errors:[/red] {len(bad)}")
        for r in bad[:5]:
            console.print(f"  • {r['persona']} ({r['mode']}): {r['error']}")


@main.command("leaderboard")
@click.option("--mode", default=None, help="Filter to a specific blue mode.")
def cmd_leaderboard(mode: str | None) -> None:
    """Aggregate runs/*.json into a per-persona and per-blue-mode leaderboard."""
    runs = sorted(RUNS_DIR.glob("*.json"))
    if not runs:
        console.print("[yellow]No runs in runs/. Run `gauntlet batch` first.[/yellow]")
        return

    per_persona: dict[str, dict[str, int]] = defaultdict(
        lambda: {"red": 0, "blue": 0, "draw": 0, "blue_score_sum": 0, "n": 0}
    )
    per_mode: dict[str, dict[str, int]] = defaultdict(
        lambda: {"red": 0, "blue": 0, "draw": 0, "blue_score_sum": 0, "n": 0}
    )
    skipped = 0
    for r in runs:
        try:
            payload = json.loads(r.read_text())
            transcript = payload["transcript"]
            verdict = payload["verdict"]
        except (KeyError, json.JSONDecodeError):
            skipped += 1
            continue
        run_mode = transcript.get("blue_mode", "standard")
        if mode and run_mode != mode:
            continue
        winner = verdict["winner"]
        bs = verdict.get("blue_score", 0)
        per_persona[transcript["persona_name"]][winner] += 1
        per_persona[transcript["persona_name"]]["blue_score_sum"] += bs
        per_persona[transcript["persona_name"]]["n"] += 1
        per_mode[run_mode][winner] += 1
        per_mode[run_mode]["blue_score_sum"] += bs
        per_mode[run_mode]["n"] += 1

    t_mode = Table(title="By blue mode")
    t_mode.add_column("mode", style="bold")
    t_mode.add_column("n", justify="right")
    t_mode.add_column("🛡 blue wins", justify="right", style="blue")
    t_mode.add_column("🩸 red wins", justify="right", style="red")
    t_mode.add_column("draws", justify="right", style="yellow")
    t_mode.add_column("avg blue score", justify="right")
    for mode_name, stats in sorted(per_mode.items()):
        n = stats["n"]
        avg = f"{stats['blue_score_sum'] / n:.1f}" if n else "—"
        t_mode.add_row(
            mode_name, str(n), str(stats["blue"]), str(stats["red"]), str(stats["draw"]), avg
        )
    console.print(t_mode)

    t_p = Table(title="By red persona (most dangerous first)")
    t_p.add_column("persona", style="bold")
    t_p.add_column("n", justify="right")
    t_p.add_column("🩸 red wins", justify="right", style="red")
    t_p.add_column("🛡 blue wins", justify="right", style="blue")
    t_p.add_column("draws", justify="right", style="yellow")
    t_p.add_column("red win rate", justify="right")
    rows = []
    for name, stats in per_persona.items():
        n = stats["n"]
        rate = stats["red"] / n if n else 0.0
        rows.append((rate, name, stats))
    for rate, name, stats in sorted(rows, key=lambda x: -x[0]):
        t_p.add_row(
            name,
            str(stats["n"]),
            str(stats["red"]),
            str(stats["blue"]),
            str(stats["draw"]),
            f"{rate:.0%}",
        )
    console.print(t_p)

    if skipped:
        console.print(f"[dim]skipped {skipped} unreadable run files[/dim]")


@main.command("coach")
@click.option(
    "--max-fights",
    default=4,
    show_default=True,
    help="How many recent / instructive fights Coach reads as inspiration.",
)
@click.option(
    "--auto-fight",
    is_flag=True,
    help="After authoring the new persona, immediately run it against all blue modes.",
)
@click.option(
    "--blue-modes",
    default="standard,lenient,naive",
    show_default=True,
    help="Blue modes to exercise the new persona against (only with --auto-fight).",
)
@click.option(
    "--target-gap",
    is_flag=True,
    help="Run risk-weighted: detect the attack category blue is weakest at and bias Coach toward it.",
)
def cmd_coach(max_fights: int, auto_fight: bool, blue_modes: str, target_gap: bool) -> None:
    """Coach reads the fight corpus and authors a NEW red persona + scenario.

    This is what makes the test suite grow itself — Coach uses Claude to
    invent attacks the bank's blue agent hasn't seen before. The new
    persona is written to personas/ and the scenario to scenarios/,
    immediately available to `gauntlet fight` and `gauntlet batch`.
    """
    gaps = analyze_coverage_gaps(RUNS_DIR) if target_gap else None
    fights = select_instructive_fights(
        RUNS_DIR, max_fights=max_fights, target_gap=target_gap, gaps=gaps
    )
    if not fights:
        console.print(
            "[red]No fights to learn from.[/red] Run `gauntlet batch` first."
        )
        return

    if gaps:
        gap_table = Table(title="Coverage gaps (risk-weighted, worst first)")
        gap_table.add_column("attack category", style="bold")
        gap_table.add_column("n runs", justify="right")
        gap_table.add_column("red wins", justify="right", style="red")
        gap_table.add_column("red rate", justify="right")
        gap_table.add_column("avg red score", justify="right")
        gap_table.add_column("gap score", justify="right", style="magenta")
        for g in gaps[:5]:
            tag = "[red]UNTESTED[/red]" if g.n_runs == 0 else ""
            gap_table.add_row(
                f"{g.attack_category} {tag}",
                str(g.n_runs),
                str(g.red_wins),
                f"{g.red_win_rate:.0%}" if g.n_runs else "—",
                f"{g.avg_red_score:.1f}" if g.n_runs else "—",
                f"{g.gap_score:.2f}",
            )
        console.print(gap_table)
        console.print(
            f"[dim]Coach will bias toward [magenta]{gaps[0].attack_category}[/magenta] "
            "as the weakest category.[/dim]\n"
        )

    by_winner = {"red": 0, "blue": 0, "draw": 0}
    for f in fights:
        by_winner[f["verdict"]["winner"]] += 1
    console.print(
        f"[magenta]Coach is reviewing {len(fights)} fights[/magenta] — "
        f"red wins: {by_winner['red']}, "
        f"close blue wins: {by_winner['blue']}, "
        f"draws: {by_winner['draw']}"
    )

    out = coach(fights, gaps=gaps)

    summary = Table(title="Coach generated a new attack", title_style="bold magenta")
    summary.add_column("field", style="dim")
    summary.add_column("value")
    summary.add_row("persona", out.persona_name)
    summary.add_row("scenario", out.scenario_name)
    p = out.raw_json["persona"]
    summary.add_row("display_name", p.get("display_name", ""))
    summary.add_row("attack_category", p.get("attack_category", ""))
    summary.add_row("difficulty", str(p.get("difficulty", "?")))
    summary.add_row("rationale", out.rationale)
    summary.add_row("persona_file", str(out.persona_path))
    summary.add_row("scenario_file", str(out.scenario_path))
    console.print(summary)

    if not auto_fight:
        console.print(
            "\n[dim]Run `gauntlet fight "
            f"{out.persona_name} --scenario {out.scenario_name}` "
            "to try it.[/dim]"
        )
        return

    modes = [m.strip() for m in blue_modes.split(",") if m.strip()]
    console.print(
        f"\n[magenta]Auto-fighting new persona against {len(modes)} blue modes...[/magenta]"
    )
    persona = load_persona(out.persona_name)
    scenario = load_scenario(out.scenario_name)
    fight_results = []
    for mode in modes:
        blue = make_blue(mode=mode)  # type: ignore[arg-type]
        try:
            transcript, verdict = run_fight(
                persona=persona,
                scenario=scenario,
                max_turns=14,
                blue=blue,
            )
            save_run(transcript, verdict, label=f"{persona.name}-{mode}")
            fight_results.append((mode, verdict.winner, verdict.blue_score, verdict.red_score))
            tag = {"red": "🩸RED", "blue": "🛡 BLUE", "draw": "—"}[verdict.winner]
            console.print(
                f"  {mode:<10} {tag} (blue {verdict.blue_score} / red {verdict.red_score})"
            )
        except Exception as exc:  # noqa: BLE001
            console.print(f"  {mode:<10} [red]ERROR[/red] {exc}")

    red_wins = sum(1 for _, w, _, _ in fight_results if w == "red")
    if red_wins:
        console.print(
            f"\n[bold red]Coach's new persona beat blue {red_wins}× — "
            "those fights are now in runs/ and will become regression test cases "
            "next time you run scripts/import_runs_to_test_manager.py.[/bold red]"
        )
    else:
        console.print(
            "\n[dim]Coach's new persona didn't beat blue this round — the suite still "
            "gained coverage of an untested attack surface.[/dim]"
        )


@main.command("fix")
@click.argument("target", required=False)
@click.option(
    "--all-red-wins",
    is_flag=True,
    help="Diagnose every red-win run + the closest blue wins; skip runs that already have a .fix.json.",
)
@click.option(
    "--include-close",
    default=4,
    show_default=True,
    help="How many close blue wins to also diagnose when using --all-red-wins.",
)
@click.option(
    "--force",
    is_flag=True,
    help="Re-diagnose even if a .fix.json already exists.",
)
def cmd_fix(target: str | None, all_red_wins: bool, include_close: int, force: bool) -> None:
    """Recommend a fix for a fight where blue lost (or nearly lost).

    Pass a fight ID, a run filename, or use --all-red-wins to diagnose
    every red-win and the closest blue wins in runs/. Each proposal is
    written next to the run as <basename>.fix.json — these get baked
    into the React console at build time so the Fix Recommender lab
    surfaces them in the UI.
    """
    if all_red_wins:
        candidates = select_diagnosable_runs(RUNS_DIR, include_close=include_close)
    elif target:
        candidates = _resolve_fix_targets(target)
    else:
        raise click.UsageError("Pass a fight ID, run filename, or --all-red-wins.")

    if not candidates:
        console.print("[yellow]No runs to diagnose.[/yellow]")
        return

    pending: list[Path] = []
    skipped: list[Path] = []
    for run in candidates:
        if not force and fix_path_for(run).exists():
            skipped.append(run)
        else:
            pending.append(run)

    console.print(
        f"[bold magenta]Fix[/bold magenta] — diagnosing {len(pending)} run(s)"
        + (f", skipping {len(skipped)} already-diagnosed (use --force to redo)" if skipped else "")
    )

    for run in pending:
        payload = json.loads(run.read_text())
        persona = payload["transcript"]["persona_name"]
        mode = payload["transcript"].get("blue_mode", "standard")
        winner = payload["verdict"]["winner"]
        with console.status(f"diagnosing {persona} / {mode} ({winner})..."):
            proposal = propose_fix(payload)
        out = write_fix(proposal, run)
        tag = "🩸RED" if winner == "red" else "🛡 close"
        sev = proposal.taxonomy.get("severity", "?")
        owasp = ",".join(proposal.taxonomy.get("owasp_llm_top_10", []))
        console.print(
            f"  {tag}  {persona:<28} mode={mode:<8} sev={sev:<8} "
            f"owasp={owasp:<12} → {out.name}"
        )

    if pending:
        console.print(
            "\n[dim]Fix proposals will appear in the React console next time "
            "the corpus is rebuilt (npm run build inside uipath/gauntlet-console).[/dim]"
        )


def _resolve_fix_targets(target: str) -> list[Path]:
    """Map a user-supplied identifier to one or more run files.

    Accepts: a full path, a fight_id (8-char hex prefix), a basename, or
    a glob like 'fake-ceo*'.
    """
    candidate = Path(target)
    if candidate.exists():
        return [candidate]
    direct = RUNS_DIR / target
    if direct.exists():
        return [direct]
    matches = [
        p
        for p in RUNS_DIR.glob("*.json")
        if not p.name.startswith("_")
        and not p.name.endswith(".fix.json")
        and target in p.name
    ]
    if not matches:
        for p in RUNS_DIR.glob("*.json"):
            if p.name.startswith("_") or p.name.endswith(".fix.json"):
                continue
            try:
                payload = json.loads(p.read_text())
            except json.JSONDecodeError:
                continue
            if target in payload["transcript"].get("fight_id", ""):
                matches.append(p)
    return matches


@main.command("render")
@click.option("--out", "out_path", default=None, help="Output HTML path. Defaults to dashboard/index.html.")
@click.option("--open", "open_in_browser", is_flag=True, help="Open in default browser after writing.")
def cmd_render(out_path: str | None, open_in_browser: bool) -> None:
    """Render the fight corpus to a self-contained HTML dashboard."""
    target = Path(out_path) if out_path else None
    path = render_dashboard(target)
    console.print(f"[green]Dashboard rendered → {path}[/green]")
    if open_in_browser:
        import webbrowser

        webbrowser.open(path.resolve().as_uri())


@main.command("export-jsonl")
@click.option(
    "--out",
    "out_path",
    default=None,
    help="Output path. Defaults to runs/_all-{timestamp}.jsonl",
)
def cmd_export_jsonl(out_path: str | None) -> None:
    """Concatenate all runs/*.json into a single JSONL file (one fight per line)."""
    if out_path is None:
        ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        out_path = str(RUNS_DIR / f"_all-{ts}.jsonl")
    target = Path(out_path)
    n = aggregate_runs_to_jsonl(target)
    console.print(f"[green]Wrote {n} fights → {target}[/green]")
