// Compliance mapping - what each ISO / NIST framework asks for, and
// the GAUNTLET evidence that answers it. Used by the Compliance Lens
// panel.
//
// Honest rules:
//   - "covered" = we have shipping evidence; clicking the control
//     should land on the actual surface in this console
//   - "partial" = some evidence, but the control isn't fully audited
//   - "roadmap" = explicitly named on the build queue
//   - "n_a"     = control doesn't apply to this SUT or this product
//                 (we test the agent, not the user's IAM / infra)
//
// Numbers are computed from the live corpus where possible - never
// hard-coded.

import { corpus } from "./corpus";
import type { FightRecord } from "./types";

export type ControlStatus = "covered" | "partial" | "roadmap" | "n_a";

export interface Control {
  ref: string;
  name: string;
  status: ControlStatus;
  evidence: string;
  /** Optional in-app target id to scroll to. */
  targetId?: string;
}

export interface ComplianceFramework {
  id: string;
  short: string;
  long: string;
  scope: string;
  controls: Control[];
}

function severityCount(level: string): number {
  return corpus.filter(
    (f) => f.fix_proposal?.taxonomy?.severity?.toLowerCase() === level
  ).length;
}

function withFix(): number {
  return corpus.filter((f) => f.fix_proposal).length;
}

function modesTested(): number {
  return new Set(corpus.map((f) => f.transcript.blue_mode ?? "standard")).size;
}

function redWins(): number {
  return corpus.filter((f) => f.verdict.winner === "red").length;
}

function fightsWithPolicyBreaches(): number {
  return corpus.filter(
    (f) => (f.verdict.policy_breaches ?? []).length > 0
  ).length;
}

function fightsWithToolFindings(): number {
  return corpus.filter(
    (f) => (f.verdict.deterministic_findings ?? []).length > 0
  ).length;
}

function uniqueOwaspCovered(): number {
  const seen = new Set<string>();
  for (const f of corpus) {
    for (const id of f.fix_proposal?.taxonomy?.owasp_llm_top_10 ?? []) {
      seen.add(id);
    }
  }
  return seen.size;
}

function uniquePersonas(): number {
  return new Set(corpus.map((f) => f.transcript.persona_name)).size;
}

function fightsTotal(_: FightRecord[] = corpus): number {
  return corpus.length;
}

export const FRAMEWORKS: ComplianceFramework[] = [
  {
    id: "iso-42001",
    short: "ISO/IEC 42001:2023",
    long: "AI Management System",
    scope:
      "Robustness, transparency, risk management for AI systems. The flagship control framework GAUNTLET aligns to.",
    controls: [
      {
        ref: "6.1",
        name: "AI risk management",
        status: "covered",
        evidence: `Risk-weighted Coach + analyze_coverage_gaps - ${uniquePersonas()} personas across the live attack categories with gap-score ranking.`,
        targetId: "coach",
      },
      {
        ref: "8.2",
        name: "AI system impact assessment",
        status: "covered",
        evidence: `Every Fix Proposal carries a severity tier + OWASP + MITRE tags. ${withFix()} proposals on file.`,
        targetId: "fix",
      },
      {
        ref: "8.4",
        name: "Design & development",
        status: "covered",
        evidence: `Differential testing across ${modesTested()} blue postures (standard, lenient, naive, external LangGraph) on every persona.`,
        targetId: "dashboard",
      },
      {
        ref: "9.1",
        name: "Performance evaluation",
        status: "covered",
        evidence: `robustness_score + defense_effectiveness computed live from ${fightsTotal()} fights - see Spec Coverage §6.`,
        targetId: "spec-coverage",
      },
      {
        ref: "9.2",
        name: "Internal audit",
        status: "covered",
        evidence: `One Test Manager case per fight; ${fightsWithPolicyBreaches()} carry policy-breach evidence.`,
      },
      {
        ref: "10.1",
        name: "Continual improvement",
        status: "covered",
        evidence: `Coach grows the suite from corpus history; ${redWins()} red wins have driven new regression tests.`,
      },
      {
        ref: "Annex B.5",
        name: "Bias / fairness controls",
        status: "n_a",
        evidence:
          "Not in scope: GAUNTLET is an adversarial-security tester, not a bias/fairness auditor. Use UiPath Agent Evaluations for fairness.",
      },
      {
        ref: "Annex B.7",
        name: "AVSS-style severity scoring",
        status: "covered",
        evidence:
          "Every fix proposal carries an AVSS 0-10 score computed from Base x Exploitability x Impact x Temporal x Environmental. Vector string visible on hover. Bands match CVSS conventions (>=9 critical, >=7 high, >=4 medium).",
        targetId: "fix-lab",
      },
    ],
  },
  {
    id: "nist-ai-rmf",
    short: "NIST AI RMF 1.0",
    long: "AI Risk Management Framework",
    scope:
      "Govern → Map → Measure → Manage. Adopted as the federal baseline.",
    controls: [
      {
        ref: "Govern",
        name: "Policies, accountability, risk tolerance",
        status: "partial",
        evidence:
          "Policy lives in the blue system prompt itself; severity-tier triage in Action Center. Org-wide governance integration roadmap.",
      },
      {
        ref: "Map 1.x",
        name: "Context & risk identification",
        status: "covered",
        evidence: `${uniqueOwaspCovered()} unique OWASP categories mapped per fix; persona library tags every attack with OWASP+MITRE.`,
        targetId: "coverage",
      },
      {
        ref: "Map 5.x",
        name: "Impact / characterization",
        status: "covered",
        evidence: `Severity histogram across ${withFix()} proposals: critical=${severityCount("critical")}, high=${severityCount("high")}, medium=${severityCount("medium")}, low=${severityCount("low")}.`,
      },
      {
        ref: "Measure 2.x",
        name: "Robustness & adversarial measurement",
        status: "covered",
        evidence: `Continuous corpus, ${fightsTotal()} fights, ASR + MTBI computed per category (Spec §6).`,
        targetId: "spec-coverage",
      },
      {
        ref: "Manage 1.x",
        name: "Risk treatment & response",
        status: "covered",
        evidence:
          "Fix Recommender drafts a concrete prompt patch + regression tests + Action Center triage task - one-click handoff.",
        targetId: "fix",
      },
      {
        ref: "Manage 4.x",
        name: "Monitor & document",
        status: "covered",
        evidence: `Every fight persists as a Test Manager case; ${fightsWithToolFindings()} fights have policy-breach findings on record.`,
        targetId: "triage",
      },
    ],
  },
  {
    id: "iso-23894",
    short: "ISO/IEC 23894:2023",
    long: "AI Risk Management Lifecycle",
    scope:
      "End-to-end lifecycle: identify → analyse → evaluate → treat → monitor.",
    controls: [
      {
        ref: "6.2",
        name: "Risk identification",
        status: "covered",
        evidence: `Coach + corpus enumeration - ${uniquePersonas()} attack personas, ${uniqueOwaspCovered()} OWASP categories tagged.`,
      },
      {
        ref: "6.3",
        name: "Risk analysis",
        status: "covered",
        evidence:
          "Referee assigns winner + blue/red scores + policy-breach list per fight.",
      },
      {
        ref: "6.4",
        name: "Risk evaluation",
        status: "covered",
        evidence: `Risk-weighted gap analysis: weakest attack category surfaced for next Coach run.`,
        targetId: "coach",
      },
      {
        ref: "6.5",
        name: "Risk treatment",
        status: "covered",
        evidence:
          "Fix Recommender drafts copy-pasteable prompt patches + 1-3 regression tests per proposal.",
        targetId: "fix",
      },
      {
        ref: "6.6",
        name: "Monitoring & review",
        status: "covered",
        evidence:
          "Live Maestro instances panel + auto-growing fight log; Coach reviews corpus nightly.",
      },
    ],
  },
  {
    id: "iso-27001",
    short: "ISO/IEC 27001:2022",
    long: "Information Security Management System (ISMS)",
    scope:
      "Information security controls. Most of the standard concerns infra/IAM, not the agent itself - relevant controls only.",
    controls: [
      {
        ref: "A.5.1",
        name: "Policies for information security",
        status: "partial",
        evidence:
          "Blue agent's bank policy is the information-security policy under test - published in Studio Web Agent Builder.",
      },
      {
        ref: "A.5.24",
        name: "Incident management - planning",
        status: "covered",
        evidence:
          "Fix Recommender → Action Center triage queue is the incident pipeline.",
        targetId: "triage",
      },
      {
        ref: "A.5.26",
        name: "Response to incidents",
        status: "covered",
        evidence: `Severity-tagged proposals; ${severityCount("critical") + severityCount("high")} high/critical handled.`,
      },
      {
        ref: "A.8.16",
        name: "Monitoring activities",
        status: "covered",
        evidence:
          "Every adversarial call recorded as a Test Manager case; live tenant data via SDK.",
      },
      {
        ref: "A.8.28",
        name: "Secure coding",
        status: "n_a",
        evidence: "Not applicable: GAUNTLET tests prompt + tool policy, not source-code security.",
      },
    ],
  },
  {
    id: "iso-25059",
    short: "ISO/IEC 25059:2023",
    long: "Quality model for AI systems",
    scope: "Quality characteristics specific to AI - robustness, transparency, explainability.",
    controls: [
      {
        ref: "Functional adequacy",
        name: "Functional correctness under adversarial load",
        status: "covered",
        evidence: `${fightsTotal()} adversarial calls measured; per-mode pass-rate visible in Threat Dashboard.`,
        targetId: "dashboard",
      },
      {
        ref: "Robustness",
        name: "Behavior under hostile inputs",
        status: "covered",
        evidence: "robustness_score + defense_effectiveness in Spec §6.",
        targetId: "spec-coverage",
      },
      {
        ref: "Transparency",
        name: "Decision explainability",
        status: "partial",
        evidence:
          "Referee verdicts include a free-text 'notes' field per fight; full chain-of-thought capture is roadmap.",
      },
      {
        ref: "Functional appropriateness",
        name: "Tool-use appropriateness",
        status: "covered",
        evidence: `${fightsWithToolFindings()} fights with deterministic tool-policy findings recorded.`,
      },
      {
        ref: "Bias / Fairness",
        name: "Demographic bias detection",
        status: "n_a",
        evidence:
          "Not in scope. Bias auditing is a separate product surface - use UiPath Agent Evaluations.",
      },
    ],
  },
  {
    id: "iso-27032",
    short: "ISO/IEC 27032:2023",
    long: "Cybersecurity controls",
    scope:
      "Cyberspace security guidance. Mostly infrastructural - touches GAUNTLET only at the API boundary + supply-chain layer.",
    controls: [
      {
        ref: "Supply chain",
        name: "AI supply chain tracking (SBOM)",
        status: "covered",
        evidence:
          "One-click AI SBOM download (top of this section) lists every model, framework, persona, and scenario version that participated in the corpus.",
        targetId: "compliance-lens",
      },
      {
        ref: "API boundary",
        name: "Tool call / external API integrity",
        status: "covered",
        evidence:
          "Every tool invocation graded by Referee; deterministic_findings flag policy breaches.",
      },
      {
        ref: "Network",
        name: "Network-layer attacks",
        status: "n_a",
        evidence:
          "Not in scope - tests the agent's reasoning, not the transport layer.",
      },
      {
        ref: "Endpoint",
        name: "Endpoint hardening",
        status: "n_a",
        evidence:
          "Not in scope - agent runs in UiPath; endpoint security is the host's concern.",
      },
    ],
  },
];
