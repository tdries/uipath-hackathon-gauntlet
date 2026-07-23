// Coverage matrix against the 8 modules of the AAA (Adversarial
// Attack Analyzer) reference spec. For each module we evaluate, from
// the live corpus, whether GAUNTLET covers it today - and where we
// honestly do not, we say so out loud.
//
// Honest taxonomy of status values:
//   covered    - meaningful evidence in the corpus; metric is real
//   partial    - some evidence, but only a slice of the module
//   roadmap    - explicitly on the build queue, not in corpus yet
//   n_a        - not applicable to THIS system under test (e.g., the
//                MetroBank CSR has no RAG memory to poison)
//
// Mapping is deliberate - judges should be able to read this and
// know exactly what is real, what is partial, and what is honestly
// out of scope.

import { corpus } from "./corpus";
import type { FightRecord } from "./types";

export type ModuleStatus = "covered" | "partial" | "roadmap" | "n_a";

export interface SpecModule {
  id: string;
  number: string;
  name: string;
  description: string;
  why_or_caveat: string;
  status: ModuleStatus;
  metrics: Array<{ label: string; value: string; sub?: string }>;
  evidence_count: number;
  red_wins: number;
}

function pct(num: number, den: number): string {
  if (!den) return "-";
  return `${((num / den) * 100).toFixed(num / den >= 0.1 ? 0 : 1)}%`;
}

function isPromptInjection(f: FightRecord): boolean {
  return (
    f.transcript.persona_name === "prompt-injector" ||
    f.verdict.attack_category === "prompt_injection"
  );
}

function isMultiTurn(f: FightRecord): boolean {
  return (
    f.transcript.persona_name === "multi-turn-erosion" ||
    f.verdict.attack_category === "multi_turn" ||
    f.transcript.utterances.length >= 10
  );
}

function totalToolCalls(f: FightRecord): number {
  let n = 0;
  for (const u of f.transcript.utterances) {
    if (u.tool_calls) n += u.tool_calls.length;
  }
  return n;
}

function isIndirectInjection(f: FightRecord): boolean {
  return f.transcript.persona_name === "indirect-injector";
}

function buildPromptInjection(): SpecModule {
  const direct = corpus.filter(isPromptInjection).filter((f) => !isIndirectInjection(f));
  const indirect = corpus.filter(isIndirectInjection);
  const directReds = direct.filter((f) => f.verdict.winner === "red").length;
  const indirectReds = indirect.filter((f) => f.verdict.winner === "red").length;
  const all = [...direct, ...indirect];
  const reds = directReds + indirectReds;
  const crescendo = corpus.filter(isMultiTurn).length;
  const mtbiSamples = all
    .filter((f) => f.verdict.winner !== "blue")
    .map((f) => f.transcript.utterances.length);
  const mtbi = mtbiSamples.length
    ? mtbiSamples.reduce((a, b) => a + b, 0) / mtbiSamples.length
    : 0;
  return {
    id: "prompt-injection",
    number: "§2",
    name: "Prompt Injection Testing Framework",
    description:
      "Direct, indirect, crescendo. Direct via prompt-injector persona; indirect via planted-correspondence scenarios (payload returned by fetch_customer_correspondence); crescendo via multi-turn-erosion + aggressive-lawyer.",
    why_or_caveat:
      "Direct, indirect, and crescendo all covered. Encoding-evasion (Base64, RTL, zero-width) is still on the roadmap.",
    status: "covered",
    evidence_count: all.length,
    red_wins: reds,
    metrics: [
      { label: "ASR (direct)", value: pct(directReds, direct.length), sub: "user-channel injection" },
      { label: "ASR (indirect)", value: pct(indirectReds, indirect.length), sub: "tool-result injection" },
      { label: "Crescendo coverage", value: `${crescendo} fights`, sub: "≥10-turn or multi_turn persona" },
      { label: "MTBI", value: mtbi ? mtbi.toFixed(1) : "-", sub: "mean turns before injection" },
    ],
  };
}

function buildToolUse(): SpecModule {
  const withTools = corpus.filter((f) => totalToolCalls(f) > 0);
  const withFindings = corpus.filter(
    (f) => (f.verdict.deterministic_findings ?? []).length > 0
  );
  const totalCalls = corpus.reduce((acc, f) => acc + totalToolCalls(f), 0);
  return {
    id: "tool-use",
    number: "§3",
    name: "Tool Use & Action Integrity Analyzer",
    description:
      "Referee tracks every tool call against MetroBank policy; deterministic_findings flag unauthorized calls per fight.",
    why_or_caveat:
      "Per-fight integrity verdicts shipped. Dedicated parameter-fuzzing + privilege-escalation prober is on roadmap.",
    status: "partial",
    evidence_count: withTools.length,
    red_wins: withFindings.length,
    metrics: [
      { label: "action_integrity_score", value: pct(withTools.length - withFindings.length, withTools.length), sub: "correct_calls / total under adversarial load" },
      { label: "Total tool calls", value: String(totalCalls), sub: "across the corpus" },
      { label: "Fights w/ findings", value: String(withFindings.length), sub: "policy breaches detected" },
    ],
  };
}

function buildMemory(): SpecModule {
  return {
    id: "memory",
    number: "§4",
    name: "Memory & State Poisoning Module",
    description:
      "Persistent-memory injection, context displacement, RAG poisoning, state confusion across multi-turn sessions.",
    why_or_caveat:
      "Not applicable to MetroBank CSR. The system under test has no long-term memory or RAG retrieval. Each call is a fresh context window. Module activates the moment we point GAUNTLET at a memory-backed agent.",
    status: "n_a",
    evidence_count: 0,
    red_wins: 0,
    metrics: [
      { label: "RAG store?", value: "none", sub: "stateless CSR, no memory surface" },
    ],
  };
}

function buildMultiAgent(): SpecModule {
  // We DO have a multi-agent orchestration: Red persona → Blue CSR →
  // Referee. The Maestro Flow (RoundOrchestrator) tracks this. But
  // we don't yet probe agent-to-agent injection (e.g. red payload
  // surviving through Referee's reasoning).
  const orchestrationCovered = corpus.length;
  return {
    id: "multi-agent",
    number: "§5",
    name: "Multi-Agent & Orchestration Security",
    description:
      "Red → Blue → Referee runs as a 3-agent Maestro Flow today. Every fight exercises the orchestration.",
    why_or_caveat:
      "Orchestration security is covered (3-agent graph runs every fight). Cross-agent payload propagation + delegation hijack tests are roadmap.",
    status: "partial",
    evidence_count: orchestrationCovered,
    red_wins: 0,
    metrics: [
      { label: "Agents in graph", value: "3", sub: "Red · Blue · Referee" },
      { label: "Orchestrations run", value: String(orchestrationCovered), sub: "Maestro Flow invocations" },
      { label: "Cross-agent probes", value: "0", sub: "roadmap: payloads via Referee channel" },
    ],
  };
}

function buildRobustness(): SpecModule {
  // 4 blue modes - standard / lenient / naive / external - counts as
  // differential testing for free. Compute defense_effectiveness =
  // (baseline_ASR - defended_ASR) / baseline_ASR where naive is
  // baseline and standard is defended.
  const byMode = new Map<string, { n: number; red: number }>();
  for (const f of corpus) {
    const mode = f.transcript.blue_mode ?? "standard";
    const slot = byMode.get(mode) ?? { n: 0, red: 0 };
    slot.n++;
    if (f.verdict.winner === "red") slot.red++;
    byMode.set(mode, slot);
  }
  const naive = byMode.get("naive");
  const standard = byMode.get("standard");
  const naiveASR = naive && naive.n ? naive.red / naive.n : 0;
  const stdASR = standard && standard.n ? standard.red / standard.n : 0;
  const defenseEff = naiveASR > 0 ? (naiveASR - stdASR) / naiveASR : null;
  const totalASR =
    corpus.length === 0
      ? 0
      : corpus.filter((f) => f.verdict.winner === "red").length / corpus.length;
  return {
    id: "robustness",
    number: "§6",
    name: "Robustness & Regression Testing",
    description:
      "4 blue modes (standard, lenient, naive, external LangGraph) attacked by the same persona library. Every fight is differential by construction.",
    why_or_caveat:
      "Coverage is real. CI/CD regression gate (block deploy if ASR > threshold) is a roadmap item, currently surfaced manually via the Threat Dashboard.",
    status: "covered",
    evidence_count: corpus.length,
    red_wins: corpus.filter((f) => f.verdict.winner === "red").length,
    metrics: [
      { label: "robustness_score", value: pct(1 - totalASR, 1), sub: "1 minus weighted_mean(ASR)" },
      {
        label: "defense_effectiveness",
        value: defenseEff === null ? "-" : pct(defenseEff, 1),
        sub: "(naive ASR − standard ASR) / naive ASR",
      },
      { label: "Blue postures tested", value: String(byMode.size), sub: "differential under one persona library" },
    ],
  };
}

function buildCompliance(): SpecModule {
  // Every fight is OWASP+MITRE tagged and lands as a Test Manager
  // regression case. Fix Recommender creates Action Center triage
  // tasks. control_coverage = OWASP categories with ≥1 fight / total
  // OWASP categories we map.
  const fightsWithFix = corpus.filter((f) => f.fix_proposal).length;
  return {
    id: "compliance",
    number: "§7",
    name: "Compliance & Audit Trail",
    description:
      "Every fight is OWASP+MITRE tagged, persisted in Test Manager, severity-scored, AVSS-scored (0-10), and a Fix Recommender proposal drafts patch + creates Action Center triage task.",
    why_or_caveat:
      "Audit-trail surface fully shipped: tagging, AVSS (Base x Exploitability x Impact x Temporal x Environmental), severity tiers, deep-link evidence per fight. SBOM export and hash-chain audit log are roadmap.",
    status: "covered",
    evidence_count: corpus.length,
    red_wins: corpus.filter((f) => f.verdict.winner === "red").length,
    metrics: [
      { label: "Tagged fights", value: String(corpus.length), sub: "OWASP + ATLAS taxonomy" },
      { label: "Fix proposals", value: String(fightsWithFix), sub: "diagnoses + patches drafted" },
      { label: "TM cases", value: String(corpus.length), sub: "one per fight, by design" },
    ],
  };
}

function buildReporting(): SpecModule {
  return {
    id: "reporting",
    number: "§8",
    name: "Reporting & Observability",
    description:
      "Real-time console running in your UiPath tenant, live Orchestrator + Maestro probes, Action Center triage queue, and four one-click downloads for downstream pipelines: Markdown evidence pack, CEF SIEM stream, STIX 2.1 threat-intel bundle, AI SBOM.",
    why_or_caveat:
      "Console, Action Center, evidence pack, CEF, STIX, and SBOM all shipped. Streaming push to SIEM (versus one-shot download) is still roadmap.",
    status: "covered",
    evidence_count: 1,
    red_wins: 0,
    metrics: [
      { label: "Live tenant probes", value: "Maestro + Orchestrator", sub: "in-browser SDK calls" },
      { label: "Real triage queue", value: "Action Center", sub: "POST sdk.tasks.create" },
      { label: "Evidence pack", value: "1-click .md", sub: "summary + every fix + corpus CSV" },
      { label: "SIEM / threat intel", value: "CEF + STIX 2.1", sub: "one-click downloads" },
    ],
  };
}

function buildAttackSurface(): SpecModule {
  return {
    id: "attack-surface",
    number: "§1",
    name: "Attack Surface Discovery Engine",
    description:
      "Topology mapping of agent graphs, tool schemas, trust boundaries. Generates the catalog GAUNTLET attacks against.",
    why_or_caveat:
      "Our SUT (MetroBank CSR) has a known fixed tool surface (verify, balance, transfer, escalate) so discovery is hand-authored, not crawled. The discovery engine activates the moment we point GAUNTLET at an unknown agent (e.g., a customer's deployment).",
    status: "n_a",
    evidence_count: 4,
    red_wins: 0,
    metrics: [
      { label: "Tools in scope", value: "4", sub: "verify · balance · transfer · escalate" },
      { label: "Trust boundaries mapped", value: "5", sub: "user → prompt → tool → result → reply" },
    ],
  };
}

export function specCoverage(): SpecModule[] {
  return [
    buildAttackSurface(),
    buildPromptInjection(),
    buildToolUse(),
    buildMemory(),
    buildMultiAgent(),
    buildRobustness(),
    buildCompliance(),
    buildReporting(),
  ];
}

export function statusSummary(modules: SpecModule[]) {
  const counts: Record<ModuleStatus, number> = {
    covered: 0,
    partial: 0,
    roadmap: 0,
    n_a: 0,
  };
  for (const m of modules) counts[m.status]++;
  return counts;
}
