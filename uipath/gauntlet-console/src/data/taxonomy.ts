// OWASP LLM Top 10 (2025) + MITRE ATLAS taxonomy mapping per persona.
// This is the audit moat - compliance buyers grade adversarial testing
// by these taxonomies. Each persona declares which classes of risk it
// exercises so we can report coverage and gaps.
//
// Sources:
//   - https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/
//   - https://atlas.mitre.org/

export interface TaxonomyTag {
  id: string;
  framework: "OWASP" | "ATLAS";
  name: string;
  url: string;
}

export const OWASP: Record<string, TaxonomyTag> = {
  LLM01: { id: "LLM01:2025", framework: "OWASP", name: "Prompt Injection", url: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/" },
  LLM02: { id: "LLM02:2025", framework: "OWASP", name: "Sensitive Information Disclosure", url: "https://genai.owasp.org/llmrisk/llm02-sensitive-information-disclosure/" },
  LLM06: { id: "LLM06:2025", framework: "OWASP", name: "Excessive Agency", url: "https://genai.owasp.org/llmrisk/llm06-excessive-agency/" },
  LLM07: { id: "LLM07:2025", framework: "OWASP", name: "System Prompt Leakage", url: "https://genai.owasp.org/llmrisk/llm07-system-prompt-leakage/" },
  LLM09: { id: "LLM09:2025", framework: "OWASP", name: "Misinformation", url: "https://genai.owasp.org/llmrisk/llm09-misinformation/" },
};

export const ATLAS: Record<string, TaxonomyTag> = {
  T0050: { id: "AML.T0050", framework: "ATLAS", name: "Adversary-in-the-Middle", url: "https://atlas.mitre.org/techniques/AML.T0050" },
  T0051: { id: "AML.T0051", framework: "ATLAS", name: "LLM Prompt Injection", url: "https://atlas.mitre.org/techniques/AML.T0051" },
  T0054: { id: "AML.T0054", framework: "ATLAS", name: "LLM Jailbreak", url: "https://atlas.mitre.org/techniques/AML.T0054" },
  T0066: { id: "AML.T0066", framework: "ATLAS", name: "Retrieval Tool Misuse", url: "https://atlas.mitre.org/techniques/AML.T0066" },
  T0067: { id: "AML.T0067", framework: "ATLAS", name: "LLM Trusted Output Components Manipulation", url: "https://atlas.mitre.org/techniques/AML.T0067" },
  T0069: { id: "AML.T0069", framework: "ATLAS", name: "False Claims Inducement (social engineering)", url: "https://atlas.mitre.org/techniques/AML.T0069" },
};

// Mapping by persona name → which OWASP and ATLAS techniques it exercises.
// Update when adding a persona or when Coach generates a new one (the
// Coach prompt should be extended to emit suggested taxonomy tags).
export const PERSONA_TAXONOMY: Record<string, TaxonomyTag[]> = {
  "panicked-grandma": [OWASP.LLM02, OWASP.LLM06, ATLAS.T0069],
  "aggressive-lawyer": [OWASP.LLM02, OWASP.LLM06, ATLAS.T0069],
  "executor-of-the-will": [OWASP.LLM02, OWASP.LLM06, ATLAS.T0069],
  "fake-ceo": [OWASP.LLM02, OWASP.LLM06, ATLAS.T0069, ATLAS.T0067],
  "prompt-injector": [OWASP.LLM01, OWASP.LLM07, ATLAS.T0051, ATLAS.T0054],
  "multi-turn-erosion": [OWASP.LLM02, ATLAS.T0069],
  "regulator-compliance-audit": [OWASP.LLM02, OWASP.LLM06, OWASP.LLM09, ATLAS.T0069, ATLAS.T0067],
  "indirect-injector": [OWASP.LLM01, OWASP.LLM06, ATLAS.T0051, ATLAS.T0067],
};

export function tagsFor(personaName: string): TaxonomyTag[] {
  return PERSONA_TAXONOMY[personaName] ?? [];
}

export function allTaxonomyTags(): TaxonomyTag[] {
  return [...Object.values(OWASP), ...Object.values(ATLAS)];
}
