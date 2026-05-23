// Mirrors the Pydantic models in src/gauntlet/models.py. Only the
// fields the console renders are typed strictly - extras are allowed.

export type Speaker = "red" | "blue" | "system";
export type Winner = "red" | "blue" | "draw";
export type BlueMode = "standard" | "lenient" | "naive" | "external";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  timestamp?: string;
}

export interface Utterance {
  speaker: Speaker;
  content: string;
  timestamp?: string;
  tool_calls?: ToolCall[];
}

export interface Transcript {
  fight_id: string;
  persona_name: string;
  scenario_name: string;
  blue_model: string;
  blue_mode?: BlueMode;
  red_model: string;
  started_at: string;
  ended_at?: string | null;
  utterances: Utterance[];
  end_reason?: string | null;
}

export interface Verdict {
  winner: Winner;
  attack_category: string;
  policy_breaches: string[];
  escalation_correct?: boolean | null;
  blue_score: number;
  red_score: number;
  notes: string;
  deterministic_findings: string[];
  judge_model: string;
}

export interface RegressionTest {
  persona_pattern: string;
  scenario_pattern: string;
  gauntlet_command: string;
  why: string;
}

export interface FixProposal {
  fight_id: string;
  persona_name: string;
  blue_mode: BlueMode;
  summary: string;
  root_cause: {
    tactic: string;
    break_turn: number;
    break_quote: string;
    rule_violated: string;
    why_it_worked: string;
  };
  prompt_patch: {
    section: string;
    intent: string;
    patch_lines: string[];
    rationale: string;
  };
  regression_tests: RegressionTest[];
  taxonomy: {
    owasp_llm_top_10: string[];
    mitre_atlas: string[];
    severity: "low" | "medium" | "high" | "critical";
  };
  test_manager: {
    task_title: string;
    task_body_markdown: string;
  };
}

export interface FightRecord {
  transcript: Transcript;
  verdict: Verdict;
  fix_proposal?: FixProposal;
}
