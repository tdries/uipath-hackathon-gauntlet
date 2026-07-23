"""Generate docs/what-we-built.html — a browser-presentable reference of the
Gauntlet artifacts (agent prompts + fight loop), for the finalist demo when
Studio Web can't render the deployed design. Content is pulled verbatim from
the real artifact sources so it never drifts.

    python scripts/build_what_we_built.py
"""

from __future__ import annotations

import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "docs" / "what-we-built.html"


def prompt_of(agent_dir: str) -> str:
    d = json.loads((REPO / "uipath" / "gauntlet" / agent_dir / "agent.json").read_text())
    return d["messages"][0]["content"]


blue = html.escape(prompt_of("MetroBankCSR"))
ref = html.escape(prompt_of("RefereeAgent"))

HTML = f"""<style>
  :root {{
    --bg: #ffffff;
    --surface: #f6f8fa;
    --surface-2: #eef1f4;
    --ink: #172125;
    --muted: #5a6b72;
    --line: #e2e7ea;
    --orange: #fa4616;   /* Red team / attacker heat, UiPath brand accent */
    --blue: #0079bf;     /* Blue team / defender */
    --code-bg: #f3f5f7;
    --shadow: 0 1px 2px rgba(23,33,37,.06), 0 8px 24px rgba(23,33,37,.06);
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #12181b;
      --surface: #1a2327;
      --surface-2: #212d32;
      --ink: #e8ecee;
      --muted: #9db0b8;
      --line: #2c383e;
      --code-bg: #0e1417;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
    }}
  }}
  :root[data-theme="light"] {{
    --bg: #ffffff; --surface: #f6f8fa; --surface-2: #eef1f4; --ink: #172125;
    --muted: #5a6b72; --line: #e2e7ea; --code-bg: #f3f5f7;
    --shadow: 0 1px 2px rgba(23,33,37,.06), 0 8px 24px rgba(23,33,37,.06);
  }}
  :root[data-theme="dark"] {{
    --bg: #12181b; --surface: #1a2327; --surface-2: #212d32; --ink: #e8ecee;
    --muted: #9db0b8; --line: #2c383e; --code-bg: #0e1417;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
  }}

  * {{ box-sizing: border-box; }}
  body {{
    background: var(--bg);
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.55;
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }}
  .wrap {{ max-width: 1080px; margin: 0 auto; padding: clamp(24px, 5vw, 64px) clamp(18px, 4vw, 40px) 80px; }}

  .eyebrow {{
    font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
    color: var(--orange); font-weight: 700; margin: 0 0 10px;
  }}
  h1 {{ font-size: clamp(28px, 4.5vw, 44px); line-height: 1.05; margin: 0 0 12px; letter-spacing: -.02em; text-wrap: balance; font-weight: 800; }}
  .lede {{ font-size: clamp(16px, 2vw, 19px); color: var(--muted); max-width: 62ch; margin: 0 0 40px; }}

  h2 {{ font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin: 48px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }}

  /* deployed-artifacts strip */
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }}
  .card {{ background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 18px 16px; box-shadow: var(--shadow); }}
  .card .type {{ font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 700; }}
  .card .name {{ font-size: 19px; font-weight: 750; margin: 4px 0 6px; }}
  .card .role {{ font-size: 14px; color: var(--muted); }}
  .card.red {{ border-top: 3px solid var(--orange); }}
  .card.blue {{ border-top: 3px solid var(--blue); }}
  .card.neutral {{ border-top: 3px solid var(--muted); }}

  /* diagram */
  .diagram {{ background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 24px; overflow-x: auto; box-shadow: var(--shadow); }}
  .mermaid {{ display: flex; justify-content: center; min-width: 640px; }}
  .legend {{ display: flex; gap: 20px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; color: var(--muted); }}
  .dot {{ display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: baseline; }}

  /* prompt panels */
  .prompt {{ background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); margin-bottom: 22px; }}
  .prompt > header {{ display: flex; align-items: baseline; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }}
  .prompt.red > header {{ border-left: 4px solid var(--orange); }}
  .prompt.neutral > header {{ border-left: 4px solid var(--muted); }}
  .prompt h3 {{ margin: 0; font-size: 18px; font-weight: 750; }}
  .prompt .tag {{ font-size: 11px; letter-spacing: .07em; text-transform: uppercase; font-weight: 700; padding: 3px 9px; border-radius: 999px; }}
  .tag.red {{ background: color-mix(in srgb, var(--orange) 15%, transparent); color: var(--orange); }}
  .tag.neutral {{ background: var(--surface-2); color: var(--muted); }}
  .prompt pre {{ margin: 0; padding: 20px 22px; background: var(--code-bg); font-family: var(--mono); font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; color: var(--ink); max-height: 460px; overflow-y: auto; }}
  .prompt .sub {{ font-size: 13px; color: var(--muted); padding: 0; margin: 0; }}

  footer {{ margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }}
  code {{ font-family: var(--mono); font-size: .9em; background: var(--surface-2); padding: 1px 5px; border-radius: 5px; }}
  a {{ color: var(--blue); }}
</style>

<div class="wrap">
  <p class="eyebrow">Gauntlet &middot; deployed in Shared / Gauntlet</p>
  <h1>What we built</h1>
  <p class="lede">Four UiPath artifacts make up the arena: a long-running Maestro Case that orchestrates a fight, a Maestro Flow that runs each round, and two Agent Builder agents. Below is the real design, straight from the deployed sources.</p>

  <h2>The four deployed artifacts</h2>
  <div class="grid">
    <div class="card red">
      <div class="type">Maestro Case</div>
      <div class="name">FightArena</div>
      <div class="role">The arena. A long-running case that drives one fight across many rounds as tasks.</div>
    </div>
    <div class="card neutral">
      <div class="type">Maestro Flow</div>
      <div class="name">RoundOrchestrator</div>
      <div class="role">One round, end to end: Red attack, Blue response, Referee verdict, score.</div>
    </div>
    <div class="card blue">
      <div class="type">Agent Builder</div>
      <div class="name">MetroBankCSR</div>
      <div class="role">The Blue target. A bank customer-service agent, the system under test.</div>
    </div>
    <div class="card neutral">
      <div class="type">Agent Builder</div>
      <div class="name">RefereeAgent</div>
      <div class="role">The judge. Scores each round against a strict policy rubric.</div>
    </div>
  </div>

  <h2>The fight loop</h2>
  <div class="diagram">
    <pre class="mermaid">
flowchart LR
  R["Red Coach<br/>(attacker)"] -->|opener + adaptive turns| B["MetroBankCSR<br/>(Blue target)"]
  B -->|"tool calls: verify / disclose / transfer / escalate"| L[("Tool Ledger")]
  B --> J["RefereeAgent<br/>(verdict + score)"]
  L --> J
  J -->|"Red win"| TM["Test Manager<br/>regression test"]
  J -->|"Blue loss"| AC["Action Center<br/>fix task"]
  classDef red fill:#fa4616,stroke:#c9370f,color:#fff;
  classDef blue fill:#0079bf,stroke:#005a8f,color:#fff;
  classDef n fill:#8a9ba3,stroke:#5a6b72,color:#fff;
  class R red; class B blue; class J n; class L n; class TM n; class AC n;
    </pre>
    <div class="legend">
      <span><span class="dot" style="background:#fa4616"></span>Red team (attacker)</span>
      <span><span class="dot" style="background:#0079bf"></span>Blue team (defender under test)</span>
      <span><span class="dot" style="background:#8a9ba3"></span>Judge &amp; downstream</span>
    </div>
  </div>
  <p class="sub" style="margin-top:10px">FightArena (the Maestro Case) wraps this loop, running it round after round until the fight ends.</p>

  <h2>Agent prompt &middot; MetroBankCSR (the Blue target)</h2>
  <div class="prompt blue">
    <header><h3>MetroBankCSR</h3><span class="tag neutral">system prompt</span></header>
    <pre>{blue}</pre>
  </div>

  <h2>Agent prompt &middot; RefereeAgent (the judge)</h2>
  <div class="prompt neutral">
    <header><h3>RefereeAgent</h3><span class="tag neutral">system prompt</span></header>
    <pre>{ref}</pre>
  </div>

  <footer>
    Gauntlet &middot; Adversarial Test Cloud for UiPath agents &middot; UiPath AgentHack 2026, Track 3.
    Prompts shown verbatim from <code>uipath/gauntlet/*/agent.json</code>.
  </footer>
</div>
"""

OUT.write_text(HTML)
print(f"Wrote {OUT} ({len(HTML):,} bytes)")
