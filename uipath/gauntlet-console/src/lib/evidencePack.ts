// Evidence Pack - one-click audit deliverable.
//
// Produces a single Markdown file that contains everything a
// procurement / audit / compliance reviewer would ask for:
//
//   - Tenant + date-range header
//   - Topline metrics (total calls, ASR, robustness, AVSS bands)
//   - Coverage matrix (against the AAA spec)
//   - Per-fix-proposal evidence: diagnosis, AVSS vector, prompt
//     patch, regression tests
//   - Appendix: CSV of every fight in the corpus
//
// Generated client-side from the static corpus + lib/avss.ts. No
// network calls, no LLM cost, no library dependencies.

import { corpus } from "../data/corpus";
import type { FightRecord, FixProposal } from "../data/types";
import { computeAvss } from "../data/avss";
import { specCoverage } from "../data/specCoverage";

function pct(num: number, den: number): string {
  if (!den) return "n/a";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fightCsvRow(f: FightRecord): string {
  return [
    f.transcript.fight_id,
    f.transcript.started_at ?? "",
    f.transcript.persona_name,
    f.transcript.scenario_name,
    f.transcript.blue_mode ?? "standard",
    f.transcript.blue_model,
    f.transcript.red_model,
    f.verdict.winner,
    String(f.verdict.blue_score ?? ""),
    String(f.verdict.red_score ?? ""),
    String(f.transcript.utterances.length),
    f.transcript.end_reason ?? "",
    csvEscape(f.verdict.attack_category ?? ""),
    csvEscape((f.verdict.policy_breaches ?? []).join(" | ")),
    f.fix_proposal?.taxonomy?.severity ?? "",
    f.fix_proposal ? computeAvss(f.fix_proposal, f).score.toFixed(1) : "",
  ]
    .map(csvEscape)
    .join(",");
}

function proposalMd(fix: FixProposal, fight: FightRecord): string {
  const a = computeAvss(fix, fight);
  return [
    `### ${fix.persona_name} vs ${fight.transcript.scenario_name} (${fix.blue_mode})`,
    "",
    `**AVSS** ${a.score.toFixed(1)}/10 · **Severity** ${fix.taxonomy.severity}`,
    `**Vector** \`${a.vector}\``,
    `**Fight** \`${fix.fight_id}\` · **OWASP** ${fix.taxonomy.owasp_llm_top_10.join(", ") || "n/a"} · **MITRE ATLAS** ${fix.taxonomy.mitre_atlas.join(", ") || "n/a"}`,
    "",
    `**Summary.** ${fix.summary}`,
    "",
    `**Root cause.**`,
    `- Tactic: ${fix.root_cause.tactic}`,
    `- Rule violated: ${fix.root_cause.rule_violated}`,
    `- Break turn ${fix.root_cause.break_turn} quote: "${fix.root_cause.break_quote}"`,
    `- Why it worked: ${fix.root_cause.why_it_worked}`,
    "",
    `**Proposed prompt patch.** _Section: ${fix.prompt_patch.section}._ ${fix.prompt_patch.intent}`,
    "",
    "```",
    fix.prompt_patch.patch_lines.join("\n"),
    "```",
    "",
    `_Rationale._ ${fix.prompt_patch.rationale}`,
    "",
    `**Regression tests (${fix.regression_tests.length}).**`,
    ...fix.regression_tests.map(
      (t, i) => `${i + 1}. **${t.persona_pattern}** × ${t.scenario_pattern}\n   - Why: ${t.why}\n   - \`${t.gauntlet_command}\``
    ),
    "",
    `**Test Manager hand-off.**`,
    `- Title: ${fix.test_manager.task_title}`,
    "",
    fix.test_manager.task_body_markdown,
    "",
    "---",
    "",
  ].join("\n");
}

function asrByMode() {
  const by: Record<string, { n: number; red: number; blue: number; draw: number }> = {};
  for (const f of corpus) {
    const m = f.transcript.blue_mode ?? "standard";
    const s = by[m] ?? { n: 0, red: 0, blue: 0, draw: 0 };
    s.n++;
    s[f.verdict.winner]++;
    by[m] = s;
  }
  return by;
}

export function generateEvidencePackMarkdown(opts?: { tenant?: string }): string {
  const tenantName = opts?.tenant ?? "thesingularityisnearer / DefaultTenant";
  const generatedAt = new Date().toISOString();

  const dates = corpus
    .map((f) => f.transcript.started_at?.slice(0, 10) ?? "")
    .filter(Boolean)
    .sort();
  const firstDate = dates[0] ?? "n/a";
  const lastDate = dates[dates.length - 1] ?? "n/a";

  const total = corpus.length;
  const red = corpus.filter((f) => f.verdict.winner === "red").length;
  const blue = corpus.filter((f) => f.verdict.winner === "blue").length;
  const draw = corpus.filter((f) => f.verdict.winner === "draw").length;
  const personas = new Set(corpus.map((f) => f.transcript.persona_name)).size;
  const scenarios = new Set(corpus.map((f) => f.transcript.scenario_name)).size;
  const modes = new Set(corpus.map((f) => f.transcript.blue_mode ?? "standard")).size;
  const proposals = corpus.filter((f) => f.fix_proposal);

  const avssBands = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of proposals) {
    const s = computeAvss(f.fix_proposal!, f).score;
    if (s >= 9) avssBands.critical++;
    else if (s >= 7) avssBands.high++;
    else if (s >= 4) avssBands.medium++;
    else avssBands.low++;
  }

  const byMode = asrByMode();
  const spec = specCoverage();

  const lines: string[] = [];
  lines.push("# GAUNTLET Evidence Pack");
  lines.push("");
  lines.push(`_Tenant:_ \`${tenantName}\``);
  lines.push(`_Generated:_ ${generatedAt}`);
  lines.push(`_Data window:_ ${firstDate} → ${lastDate}`);
  lines.push("");

  lines.push("## Executive summary");
  lines.push("");
  lines.push(`- **Total adversarial calls:** ${total}`);
  lines.push(`- **Defended (blue won):** ${blue} (${pct(blue, total)})`);
  lines.push(`- **Breached (red won):** ${red} (${pct(red, total)})`);
  lines.push(`- **Inconclusive (draws):** ${draw}`);
  lines.push(`- **Robustness score:** ${pct(blue, total)} = 1 − ASR`);
  lines.push(`- **Personas exercised:** ${personas}`);
  lines.push(`- **Scenarios exercised:** ${scenarios}`);
  lines.push(`- **Blue postures tested:** ${modes}`);
  lines.push(`- **Fix proposals on file:** ${proposals.length}`);
  lines.push("");
  lines.push(
    `_AVSS distribution:_ critical=${avssBands.critical} · high=${avssBands.high} · medium=${avssBands.medium} · low=${avssBands.low}`
  );
  lines.push("");

  lines.push("## ASR by blue posture");
  lines.push("");
  lines.push("| Mode | N | Defended | Breached | Draw | ASR |");
  lines.push("| --- | ---:| ---:| ---:| ---:| ---:|");
  for (const [mode, s] of Object.entries(byMode).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `| ${mode} | ${s.n} | ${s.blue} | ${s.red} | ${s.draw} | ${pct(s.red, s.n)} |`
    );
  }
  lines.push("");

  lines.push("## AAA spec coverage");
  lines.push("");
  lines.push("| § | Module | Status | Notes |");
  lines.push("| --- | --- | --- | --- |");
  for (const m of spec) {
    lines.push(`| ${m.number} | ${m.name} | **${m.status}** | ${m.why_or_caveat.replace(/\n/g, " ")} |`);
  }
  lines.push("");

  lines.push("## Fix proposals — full evidence");
  lines.push("");
  if (proposals.length === 0) {
    lines.push("_No fix proposals on file yet._");
  } else {
    // Sort proposals by AVSS descending
    const sorted = [...proposals].sort((a, b) => {
      const av = computeAvss(a.fix_proposal!, a).score;
      const bv = computeAvss(b.fix_proposal!, b).score;
      return bv - av;
    });
    for (const f of sorted) {
      lines.push(proposalMd(f.fix_proposal!, f));
    }
  }

  lines.push("## Appendix — full fight corpus (CSV)");
  lines.push("");
  lines.push("```csv");
  lines.push(
    "fight_id,started_at,persona,scenario,blue_mode,blue_model,red_model,winner,blue_score,red_score,turns,end_reason,attack_category,policy_breaches,severity,avss"
  );
  for (const f of corpus) lines.push(fightCsvRow(f));
  lines.push("```");
  lines.push("");

  lines.push("---");
  lines.push("_Generated by GAUNTLET — adversarial test cloud for UiPath agents._");
  return lines.join("\n");
}

export function downloadEvidencePack() {
  const md = generateEvidencePackMarkdown();
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `gauntlet-evidence-pack-${ts}.md`;
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
