"""Render the fight corpus to a self-contained HTML dashboard.

One-page static dashboard meant for the demo video AND for use inside
UiPath as an embedded app:
  - What is GAUNTLET / why it matters / how to operate it (text panels)
  - Live regression suite numbers (totals + per-mode + per-persona)
  - All fights table with inline transcript viewer

No build step, no server. `gauntlet render` writes
`dashboard/index.html` and the corpus is inlined as a JSON blob.

Brand: UiPath. Orange #FA4616 brand accent, blue #0079BF primary,
near-black #172125 text on white / light teal backgrounds. Poppins
for headings, Inter for body. Red/blue contrast on agent transcripts
is the only departure from the brand palette — that contrast carries
the "red team vs blue team" metaphor and is core to the product.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = REPO_ROOT / "runs"
DASHBOARD_DIR = REPO_ROOT / "dashboard"


_HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GAUNTLET — agentic red-team testing for AI customer-service agents</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* UiPath brand tokens */
:root {
  --brand: #FA4616;           /* UiPath orange */
  --brand-hover: #C2320C;
  --primary: #0079BF;         /* UiPath action blue */
  --primary-hover: #006CA6;
  --visited: #004D73;

  --ink: #172125;             /* primary text */
  --ink-2: #4F5F66;           /* secondary */
  --ink-3: #7D9199;           /* tertiary */
  --hairline: #D5E3E8;
  --panel: #F0F9FC;
  --bg: #FFFFFF;

  --red: #D8252C;             /* attacker bubble — kept brand-adjacent */
  --red-bg: #FDECEE;
  --blue: #0079BF;            /* defender bubble */
  --blue-bg: #E6F2FA;
  --warn-bg: #FFF7E0;
  --warn: #B17A00;
}

* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body {
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4 { font-family: 'Poppins', sans-serif; color: var(--ink); margin: 0; font-weight: 700; }
a { color: var(--primary); text-decoration: none; }
a:hover { color: var(--primary-hover); text-decoration: underline; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* TOP NAV */
.nav {
  background: var(--bg); border-bottom: 1px solid var(--hairline);
  padding: 14px 32px; display: flex; align-items: center; gap: 16px;
}
.nav .brand-mark {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 18px;
  letter-spacing: 0.04em; color: var(--ink);
}
.nav .brand-mark .dot {
  width: 12px; height: 12px; border-radius: 50%; background: var(--brand);
}
.nav .subtitle {
  color: var(--ink-3); font-size: 13px; font-weight: 500; margin-left: 8px;
  padding-left: 12px; border-left: 1px solid var(--hairline);
}
.nav .spacer { flex: 1; }
.nav .nav-link { color: var(--ink-2); font-size: 13px; font-weight: 500; margin-left: 16px; }
.nav .nav-link:hover { color: var(--brand); text-decoration: none; }

.wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }

/* HERO */
.hero { padding: 56px 0 40px; }
.hero .eyebrow {
  display: inline-block; background: var(--panel); color: var(--primary);
  font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 6px 12px; border-radius: 999px; margin-bottom: 16px;
}
.hero h1 { font-size: 48px; line-height: 1.15; max-width: 820px; }
.hero h1 .accent { color: var(--brand); }
.hero p.lede {
  font-size: 18px; color: var(--ink-2); margin: 16px 0 24px; max-width: 720px;
}
.hero .cta-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;
  border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;
  border: 1px solid transparent; transition: all 0.15s;
  font-family: 'Inter', sans-serif;
}
.btn-brand { background: var(--brand); color: white; }
.btn-brand:hover { background: var(--brand-hover); color: white; text-decoration: none; }
.btn-outline {
  background: white; color: var(--ink); border-color: var(--hairline);
}
.btn-outline:hover { border-color: var(--ink-3); color: var(--ink); text-decoration: none; }

/* WHAT/HOW/WHY */
.value-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
  padding: 32px 0; border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline);
}
.value-card h3 { font-size: 16px; margin-bottom: 6px; }
.value-card .icon {
  width: 36px; height: 36px; border-radius: 8px; background: var(--panel);
  display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
  color: var(--brand); font-size: 18px; font-weight: 700;
}
.value-card p { color: var(--ink-2); font-size: 14px; margin: 0; }

/* SECTIONS */
section { padding: 40px 0; }
section.alt { background: var(--panel); margin: 0 -32px; padding: 40px 32px; }
section h2 { font-size: 24px; margin-bottom: 6px; }
section .lede { color: var(--ink-2); margin: 0 0 24px; max-width: 720px; }

/* SCOREBOARD */
.score { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.score .card {
  background: white; border: 1px solid var(--hairline); border-radius: 12px;
  padding: 20px;
}
.score .card .label {
  color: var(--ink-3); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  font-weight: 600;
}
.score .card .value {
  font-family: 'Poppins', sans-serif; font-size: 36px; font-weight: 700;
  margin-top: 6px; color: var(--ink);
}
.score .card .sub { color: var(--ink-3); font-size: 12px; margin-top: 4px; }
.score .card.brand .value { color: var(--brand); }
.score .card.red .value { color: var(--red); }
.score .card.blue .value { color: var(--blue); }

/* HOW TO OPERATE */
.cmd-list { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
.cmd {
  background: white; border: 1px solid var(--hairline); border-radius: 10px; padding: 16px 18px;
}
.cmd .name { font-weight: 600; color: var(--ink); font-size: 14px; }
.cmd pre {
  margin: 8px 0; background: #0E1316; color: #F0F9FC; padding: 10px 12px;
  border-radius: 6px; font-size: 12px; overflow-x: auto;
}
.cmd .why { color: var(--ink-2); font-size: 13px; margin-top: 4px; }

/* MINI TABLES */
.mini { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
@media (max-width: 880px) {
  .mini, .cmd-list, .value-grid { grid-template-columns: 1fr; }
  .score { grid-template-columns: repeat(2, 1fr); }
  .hero h1 { font-size: 32px; }
}
table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; border: 1px solid var(--hairline); }
th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--hairline); font-size: 13px; }
tr:last-child td { border-bottom: none; }
th { color: var(--ink-3); font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase; font-weight: 600; background: var(--panel); }
.right { text-align: right; font-family: ui-monospace, monospace; }
tr.fight { cursor: pointer; }
tr.fight:hover { background: var(--panel); }
tr.fight.open { background: var(--panel); }
tr.fight.open td { font-weight: 600; }

.tag {
  display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px;
  font-weight: 600; letter-spacing: 0.04em; vertical-align: middle;
  font-family: 'Inter', sans-serif;
}
.tag.red { background: var(--red-bg); color: var(--red); }
.tag.blue { background: var(--blue-bg); color: var(--blue); }
.tag.yellow { background: var(--warn-bg); color: var(--warn); }
.tag.neutral { background: var(--panel); color: var(--ink-2); border: 1px solid var(--hairline); }

/* TRANSCRIPT EXPANSION */
tr.detail td { padding: 0; background: var(--panel); border-top: 1px solid var(--hairline); }
.transcript { padding: 20px 28px; max-height: 720px; overflow-y: auto; background: white; }
.utt {
  margin: 8px 0; padding: 12px 16px; border-radius: 14px; max-width: 78%;
  font-size: 14px; line-height: 1.55; white-space: pre-wrap;
}
.utt .who {
  display: block; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  font-weight: 700; margin-bottom: 6px; opacity: 0.9;
}
.utt.red { background: var(--red-bg); color: var(--ink); margin-right: auto; border: 1px solid #F5C4C8; }
.utt.red .who { color: var(--red); }
.utt.blue { background: var(--blue-bg); color: var(--ink); margin-left: auto; border: 1px solid #BFDEEF; }
.utt.blue .who { color: var(--blue); }
.utt.system { background: var(--panel); color: var(--ink-3); border: 1px solid var(--hairline); margin: 8px auto; font-size: 12px; }
.tools { margin-top: 6px; font-size: 11px; color: var(--ink-3); font-family: ui-monospace, monospace; }
.verdict-bar {
  padding: 16px 28px; background: var(--bg); border-top: 1px solid var(--hairline);
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px; color: var(--ink-2);
}
.verdict-bar h4 {
  margin: 0 0 6px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
}
.verdict-bar ul { margin: 0; padding-left: 18px; }

footer {
  background: #0E1316; color: #D5E3E8; padding: 32px; margin-top: 40px;
  text-align: center; font-size: 13px;
}
footer a { color: white; }
footer .dot { color: var(--brand); }
</style>
</head>
<body>

<!-- TOP NAV -->
<nav class="nav">
  <div class="brand-mark"><span class="dot"></span> GAUNTLET</div>
  <div class="subtitle">Agentic red-team testing for AI customer-service agents</div>
  <div class="spacer"></div>
  <a class="nav-link" href="#what">What it does</a>
  <a class="nav-link" href="#operate">How to operate</a>
  <a class="nav-link" href="#suite">Test suite</a>
  <a class="nav-link" href="#fights">Fight log</a>
</nav>

<!-- HERO -->
<div class="wrap">
  <div class="hero">
    <div class="eyebrow">UiPath AgentHack 2026 · Track 3 · Test Cloud</div>
    <h1>The bank put an AI on the phones.<br><span class="accent">We test it like a real attacker would.</span></h1>
    <p class="lede">
      GAUNTLET is a continuous adversarial test factory for production AI customer-service agents.
      Red-team agents impersonate scammers, regulators, and grieving customers; the blue agent
      (the bank's CSR) has to follow policy under pressure. Every successful attack becomes a
      regression test the bank must never fail again — and the suite grows itself.
    </p>
    <div class="cta-row">
      <a class="btn btn-brand" href="#operate">▶ How to run a fight</a>
      <a class="btn btn-outline" href="#fights">See the fight log</a>
      <a class="btn btn-outline" href="https://cloud.uipath.com/thesingularityisnearer/DefaultTenant/testmanager_" target="_blank">Open Test Manager →</a>
    </div>
  </div>

  <!-- WHAT / HOW / WHY -->
  <div id="what" class="value-grid">
    <div class="value-card">
      <div class="icon">①</div>
      <h3>What it is</h3>
      <p>An arena where two AIs square off on every fight: a Red attacker with a social-engineering persona, and Blue — the bank's customer-service agent built in UiPath Agent Builder.</p>
    </div>
    <div class="value-card">
      <div class="icon">②</div>
      <h3>How it works</h3>
      <p>Each round runs as a Maestro Case. A Referee Agent grades the call. Wins are saved as regression test cases in UiPath Test Manager. A Coach Agent reads losses and writes new attacks — the suite is self-growing.</p>
    </div>
    <div class="value-card">
      <div class="icon">③</div>
      <h3>Why it matters</h3>
      <p>AI customer-service agents handle real money. They will be social-engineered. Banks need a continuous, agentic test layer — not a one-time red-team week. GAUNTLET is that layer.</p>
    </div>
  </div>

  <!-- HOW TO OPERATE -->
  <section id="operate">
    <h2>How to operate</h2>
    <p class="lede">Every command writes a transcript to <code>runs/</code> and an entry to UiPath Test Manager after sync.</p>
    <div class="cmd-list">
      <div class="cmd">
        <div class="name">Run one fight</div>
        <pre>gauntlet fight panicked-grandma \\
  --scenario grandma-bail-money \\
  --blue-mode standard</pre>
        <div class="why">Pit one red persona against the blue CSR. <code>--blue-mode</code> picks the bank's policy posture: <b>standard</b> (strict), <b>lenient</b> (soft), <b>naive</b> (escalation-averse).</div>
      </div>
      <div class="cmd">
        <div class="name">Run the full matrix</div>
        <pre>gauntlet batch --pairs canonical \\
  --blue-modes standard,lenient,naive \\
  --repeat 2 --parallel 4</pre>
        <div class="why">Sweep every persona × every blue mode. Builds the corpus that the leaderboard below reads from.</div>
      </div>
      <div class="cmd">
        <div class="name">Coach invents a new attack</div>
        <pre>gauntlet coach --auto-fight</pre>
        <div class="why">Coach reads recent losses, drafts a NEW red persona (Claude Opus), writes it to <code>personas/</code>, and immediately runs it against every blue mode. This is the auto-growing suite.</div>
      </div>
      <div class="cmd">
        <div class="name">Push the corpus to Test Manager</div>
        <pre>python scripts/import_runs_to_test_manager.py</pre>
        <div class="why">Idempotent. Creates the <code>GAUNTLET</code> Test Manager project + 3 test sets (one per blue mode). New fights become new test cases automatically.</div>
      </div>
      <div class="cmd">
        <div class="name">Aggregate everything</div>
        <pre>gauntlet leaderboard
gauntlet export-jsonl
gauntlet render --open</pre>
        <div class="why">Terminal leaderboard, single-file JSONL milestone artifact, or re-render this dashboard from the latest <code>runs/</code>.</div>
      </div>
      <div class="cmd">
        <div class="name">Inspect a fight</div>
        <pre># Click any row in the Fight log below
# or list/inspect raw JSON:
ls runs/
cat runs/&lt;file&gt;.json | jq .verdict</pre>
        <div class="why">Every fight is a JSON transcript + verdict with policy breaches called out. The fight log table at the bottom of this page lets you expand any row inline.</div>
      </div>
    </div>
  </section>
</div>

<!-- TEST SUITE (alt background) -->
<section class="alt" id="suite">
  <div class="wrap">
    <h2>Live regression suite</h2>
    <p class="lede">
      The numbers below come from the <code>runs/</code> directory at render time —
      <b>__TS__</b>. Every fight is also live in
      <a href="https://cloud.uipath.com/thesingularityisnearer/DefaultTenant/testmanager_" target="_blank">UiPath Test Manager</a>
      under the <code>GAUNTLET</code> project.
    </p>

    <div class="score">
      <div class="card brand">
        <div class="label">Total fights</div>
        <div class="value">__TOTAL__</div>
        <div class="sub">across every persona × blue mode</div>
      </div>
      <div class="card red">
        <div class="label">Red wins (bug fixtures)</div>
        <div class="value">__RED__</div>
        <div class="sub">successful attacks — must-fix regressions</div>
      </div>
      <div class="card blue">
        <div class="label">Blue holds (regression passes)</div>
        <div class="value">__BLUE__</div>
        <div class="sub">defenses that worked, locked in</div>
      </div>
      <div class="card">
        <div class="label">Draws</div>
        <div class="value">__DRAW__</div>
        <div class="sub">inconclusive (aborted, off-script)</div>
      </div>
    </div>

    <div class="mini">
      <div>
        <h3 style="font-size:14px; color:var(--ink-3); letter-spacing:0.1em; text-transform:uppercase; margin: 24px 0 10px;">By blue mode</h3>
        <table>
          <thead><tr><th>Blue policy posture</th><th class="right">N</th><th class="right">🛡 holds</th><th class="right">🩸 losses</th><th class="right">Avg score</th></tr></thead>
          <tbody>__MODE_ROWS__</tbody>
        </table>
      </div>
      <div>
        <h3 style="font-size:14px; color:var(--ink-3); letter-spacing:0.1em; text-transform:uppercase; margin: 24px 0 10px;">By red persona (most dangerous first)</h3>
        <table>
          <thead><tr><th>Red persona</th><th class="right">N</th><th class="right">🩸 wins</th><th class="right">Red win %</th></tr></thead>
          <tbody>__PERSONA_ROWS__</tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<!-- FIGHT LOG -->
<div class="wrap">
  <section id="fights">
    <h2>Fight log</h2>
    <p class="lede">Click any row to expand the full transcript and verdict. Red bubbles are the attacker; blue bubbles are Cara, MetroBank's CSR.</p>
    <table>
      <thead>
        <tr>
          <th>Started (UTC)</th>
          <th>Persona</th>
          <th>Blue mode</th>
          <th>Winner</th>
          <th class="right">Blue</th>
          <th class="right">Red</th>
          <th class="right">Turns</th>
          <th>End reason</th>
        </tr>
      </thead>
      <tbody id="fights-tbody"></tbody>
    </table>
  </section>
</div>

<footer>
  <div><b>GAUNTLET</b> <span class="dot">·</span> UiPath AgentHack 2026 <span class="dot">·</span> Track 3 (Test Cloud)</div>
  <div style="margin-top:6px; color:#7D9199; font-size:12px;">
    Blue agent: MetroBankCSR (Agent Builder) <span class="dot">·</span>
    Judge: RefereeAgent (Agent Builder) <span class="dot">·</span>
    Orchestration: FightArena (Maestro Case) + RoundOrchestrator (Maestro Flow) <span class="dot">·</span>
    Regression suite: GAUNTLET project in Test Manager
  </div>
</footer>

<script>
const CORPUS = __CORPUS_JSON__;
const tbody = document.getElementById('fights-tbody');

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function winnerTag(w) {
  if (w === 'red') return `<span class="tag red">🩸 RED won</span>`;
  if (w === 'blue') return `<span class="tag blue">🛡 BLUE held</span>`;
  return `<span class="tag yellow">— draw</span>`;
}

function modeTag(m) {
  return `<span class="tag neutral">${escape(m)}</span>`;
}

function rowHtml(f, i) {
  const t = f.transcript, v = f.verdict;
  const started = new Date(t.started_at).toISOString().slice(0,16).replace('T',' ');
  return `
    <tr class="fight" data-i="${i}">
      <td><code>${started}</code></td>
      <td>${escape(t.persona_name)}</td>
      <td>${modeTag(t.blue_mode || 'standard')}</td>
      <td>${winnerTag(v.winner)}</td>
      <td class="right">${v.blue_score}</td>
      <td class="right">${v.red_score}</td>
      <td class="right">${t.utterances.length}</td>
      <td><code style="color:var(--ink-3)">${escape(t.end_reason || '')}</code></td>
    </tr>
    <tr class="detail" id="d${i}" style="display:none"><td colspan="8"></td></tr>
  `;
}

function detailHtml(f) {
  const t = f.transcript, v = f.verdict;
  let utts = '';
  for (const u of t.utterances) {
    const cls = u.speaker;
    const who = u.speaker === 'red' ? '🩸 RED · ' + escape(t.persona_name) : u.speaker === 'blue' ? '🛡 BLUE · Cara (MetroBank CSR)' : u.speaker.toUpperCase();
    let tools = '';
    if (u.tool_calls && u.tool_calls.length) {
      tools = `<div class="tools">↳ tools: ${u.tool_calls.map(c => escape(c.name)).join(', ')}</div>`;
    }
    utts += `<div class="utt ${cls}"><span class="who">${who}</span>${escape(u.content)}${tools}</div>`;
  }
  const breaches = (v.policy_breaches || []).map(b => `<li>${escape(b)}</li>`).join('');
  const findings = (v.deterministic_findings || []).map(b => `<li>${escape(b)}</li>`).join('');
  return `
    <div class="transcript">${utts}</div>
    <div class="verdict-bar">
      <div class="left">
        <h4>Verdict notes</h4>
        <div>${escape(v.notes)}</div>
      </div>
      <div class="right">
        ${breaches ? `<h4>Policy breaches detected</h4><ul>${breaches}</ul>` : ''}
        ${findings ? `<h4>Deterministic findings</h4><ul>${findings}</ul>` : ''}
        ${!breaches && !findings ? '<h4>No policy breaches detected</h4>' : ''}
      </div>
    </div>
  `;
}

tbody.innerHTML = CORPUS.map(rowHtml).join('');
document.querySelectorAll('tr.fight').forEach(tr => {
  tr.addEventListener('click', () => {
    const i = tr.dataset.i;
    const d = document.getElementById('d' + i);
    if (d.style.display === 'none') {
      d.querySelector('td').innerHTML = detailHtml(CORPUS[i]);
      d.style.display = '';
      tr.classList.add('open');
    } else {
      d.style.display = 'none';
      tr.classList.remove('open');
    }
  });
});
</script>
</body>
</html>
"""


def _load_runs() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in sorted(RUNS_DIR.glob("*.json")):
        if p.name.startswith("_"):
            continue
        try:
            payload = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        out.append(payload)
    # Newest first.
    out.sort(key=lambda r: r["transcript"]["started_at"], reverse=True)
    return out


def _scoreboard(runs: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"total": len(runs), "red": 0, "blue": 0, "draw": 0}
    for r in runs:
        counts[r["verdict"]["winner"]] += 1
    return counts


def _mode_rows(runs: list[dict[str, Any]]) -> str:
    per_mode: dict[str, dict[str, int]] = defaultdict(
        lambda: {"n": 0, "blue": 0, "red": 0, "draw": 0, "blue_score_sum": 0}
    )
    for r in runs:
        mode = r["transcript"].get("blue_mode", "standard")
        v = r["verdict"]
        per_mode[mode]["n"] += 1
        per_mode[mode][v["winner"]] += 1
        per_mode[mode]["blue_score_sum"] += v.get("blue_score", 0)
    rows = []
    for mode in ("standard", "lenient", "naive"):
        s = per_mode.get(mode)
        if not s:
            continue
        avg = s["blue_score_sum"] / s["n"] if s["n"] else 0.0
        rows.append(
            f'<tr><td><span class="tag neutral">{mode}</span></td>'
            f'<td class="right">{s["n"]}</td>'
            f'<td class="right" style="color:var(--blue)">{s.get("blue",0)}</td>'
            f'<td class="right" style="color:var(--red)">{s.get("red",0)}</td>'
            f'<td class="right">{avg:.1f}</td></tr>'
        )
    return "\n".join(rows)


def _persona_rows(runs: list[dict[str, Any]]) -> str:
    per: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "red": 0})
    for r in runs:
        name = r["transcript"]["persona_name"]
        per[name]["n"] += 1
        if r["verdict"]["winner"] == "red":
            per[name]["red"] += 1
    rows = []
    sorted_personas = sorted(
        per.items(),
        key=lambda kv: (-(kv[1]["red"] / kv[1]["n"] if kv[1]["n"] else 0), kv[0]),
    )
    for name, s in sorted_personas:
        rate = s["red"] / s["n"] if s["n"] else 0
        color = "var(--red)" if rate > 0 else "var(--ink-3)"
        rows.append(
            f"<tr><td>{name}</td>"
            f'<td class="right">{s["n"]}</td>'
            f'<td class="right" style="color:var(--red)">{s["red"]}</td>'
            f'<td class="right" style="color:{color}">{rate:.0%}</td></tr>'
        )
    return "\n".join(rows)


def render(out_path: Path | None = None) -> Path:
    """Render the dashboard. Returns the written path."""
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    target = out_path or (DASHBOARD_DIR / "index.html")

    runs = _load_runs()
    scores = _scoreboard(runs)
    mode_rows = _mode_rows(runs)
    persona_rows = _persona_rows(runs)
    corpus_json = json.dumps(runs, default=str, separators=(",", ":"))

    html = (
        _HTML_TEMPLATE.replace("__TOTAL__", str(scores["total"]))
        .replace("__RED__", str(scores["red"]))
        .replace("__BLUE__", str(scores["blue"]))
        .replace("__DRAW__", str(scores["draw"]))
        .replace("__MODE_ROWS__", mode_rows)
        .replace("__PERSONA_ROWS__", persona_rows)
        .replace("__TS__", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
        .replace("__CORPUS_JSON__", corpus_json)
    )

    target.write_text(html)
    return target
