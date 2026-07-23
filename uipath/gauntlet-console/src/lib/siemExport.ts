// SIEM / SOAR exports - CEF (ArcSight, Splunk-via-CEF) and
// STIX 2.1 (TAXII feeds, MISP, threat-intel pipelines).
//
// CEF: one log line per fight, severity = AVSS score (0-10).
// STIX: one bundle, one Indicator or Vulnerability object per
// fix proposal. Both generated 100% client-side; no library
// dependencies.

import { corpus } from "../data/corpus";
import { computeAvss } from "../data/avss";
import type { FightRecord, FixProposal } from "../data/types";

function cefEscape(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}

function cefHeader(opts: {
  signature: string;
  name: string;
  severity: number;
}): string {
  // CEF:Version|DeviceVendor|DeviceProduct|DeviceVersion|SignatureID|Name|Severity|Extension
  return [
    "CEF:0",
    "GAUNTLET",
    "TestCloud",
    "0.14",
    cefEscape(opts.signature),
    cefEscape(opts.name),
    Math.min(10, Math.max(0, Math.round(opts.severity))).toString(),
  ].join("|");
}

function cefExtension(pairs: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(pairs)) {
    if (v === undefined || v === null || v === "") continue;
    out.push(`${k}=${cefEscape(String(v))}`);
  }
  return out.join(" ");
}

function fightToCef(f: FightRecord): string {
  const avss = f.fix_proposal ? computeAvss(f.fix_proposal, f).score : 0;
  const sev = f.verdict.winner === "red" ? avss : avss * 0.4; // defended fights still log, lower severity
  const fix = f.fix_proposal;
  const head = cefHeader({
    signature: f.transcript.persona_name,
    name: `Adversarial call vs ${f.transcript.scenario_name}`,
    severity: sev,
  });
  const ext = cefExtension({
    cs1Label: "fight_id",
    cs1: f.transcript.fight_id,
    cs2Label: "blue_mode",
    cs2: f.transcript.blue_mode ?? "standard",
    cs3Label: "attack_category",
    cs3: f.verdict.attack_category,
    cs4Label: "owasp",
    cs4: (fix?.taxonomy.owasp_llm_top_10 ?? []).join(","),
    cs5Label: "mitre_atlas",
    cs5: (fix?.taxonomy.mitre_atlas ?? []).join(","),
    cs6Label: "severity_tier",
    cs6: fix?.taxonomy.severity ?? "n/a",
    cn1Label: "avss",
    cn1: avss.toFixed(1),
    cn2Label: "blue_score",
    cn2: f.verdict.blue_score,
    cn3Label: "red_score",
    cn3: f.verdict.red_score,
    outcome: f.verdict.winner,
    rt: f.transcript.started_at ? Date.parse(f.transcript.started_at) : undefined,
    msg: f.verdict.notes,
    sourceServiceName: f.transcript.red_model,
    destinationServiceName: f.transcript.blue_model,
  });
  return `${head}|${ext}`;
}

export function generateCefLog(): string {
  const lines: string[] = [];
  lines.push("# GAUNTLET adversarial test cloud. CEF event stream");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Events: ${corpus.length}`);
  lines.push("");
  for (const f of corpus) lines.push(fightToCef(f));
  return lines.join("\n");
}

export function downloadCef() {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  download(
    `gauntlet-cef-${ts}.log`,
    generateCefLog(),
    "text/plain;charset=utf-8"
  );
}

// ---------- STIX 2.1 ----------

type StixObject = Record<string, unknown>;

function stixIdentity(): StixObject {
  return {
    type: "identity",
    spec_version: "2.1",
    id: "identity--gauntlet-testcloud",
    created: "2026-05-18T00:00:00.000Z",
    modified: "2026-05-18T00:00:00.000Z",
    name: "GAUNTLET Adversarial Test Cloud",
    identity_class: "system",
    sectors: ["technology"],
  };
}

function fightToStixVulnerability(
  fight: FightRecord,
  fix: FixProposal
): StixObject {
  const avss = computeAvss(fix, fight);
  const created = fight.transcript.started_at ?? new Date().toISOString();
  return {
    type: "vulnerability",
    spec_version: "2.1",
    id: `vulnerability--${fight.transcript.fight_id}`,
    created_by_ref: "identity--gauntlet-testcloud",
    created,
    modified: created,
    name: fix.test_manager.task_title,
    description: fix.summary,
    external_references: fix.taxonomy.owasp_llm_top_10.map((id) => ({
      source_name: "OWASP LLM Top 10",
      external_id: id,
    })),
    labels: [
      `severity:${fix.taxonomy.severity}`,
      `avss:${avss.score.toFixed(1)}`,
      `persona:${fix.persona_name}`,
      `blue_mode:${fix.blue_mode}`,
      `attack_category:${fight.verdict.attack_category}`,
    ],
    x_gauntlet_fight_id: fight.transcript.fight_id,
    x_gauntlet_avss: avss.score,
    x_gauntlet_avss_vector: avss.vector,
    x_gauntlet_winner: fight.verdict.winner,
    x_gauntlet_prompt_patch_intent: fix.prompt_patch.intent,
  };
}

function fightToStixAttackPattern(
  fight: FightRecord,
  fix: FixProposal | undefined
): StixObject {
  const created = fight.transcript.started_at ?? new Date().toISOString();
  return {
    type: "attack-pattern",
    spec_version: "2.1",
    id: `attack-pattern--${fight.transcript.fight_id}-attack`,
    created_by_ref: "identity--gauntlet-testcloud",
    created,
    modified: created,
    name: fight.transcript.persona_name,
    description: `${fight.transcript.persona_name} attacks ${fight.transcript.scenario_name} (blue mode = ${fight.transcript.blue_mode ?? "standard"})`,
    kill_chain_phases: (fix?.taxonomy.mitre_atlas ?? []).map((id) => ({
      kill_chain_name: "mitre-atlas",
      phase_name: id,
    })),
    labels: [
      `attack_category:${fight.verdict.attack_category}`,
      `winner:${fight.verdict.winner}`,
    ],
    x_gauntlet_fight_id: fight.transcript.fight_id,
  };
}

export function generateStixBundle(): string {
  const objects: StixObject[] = [stixIdentity()];
  for (const f of corpus) {
    objects.push(fightToStixAttackPattern(f, f.fix_proposal));
    if (f.fix_proposal) {
      objects.push(fightToStixVulnerability(f, f.fix_proposal));
    }
  }
  const bundle: StixObject = {
    type: "bundle",
    id: `bundle--gauntlet-${Date.now()}`,
    objects,
  };
  return JSON.stringify(bundle, null, 2);
}

export function downloadStix() {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  download(
    `gauntlet-stix-${ts}.json`,
    generateStixBundle(),
    "application/json"
  );
}

// ---------- SBOM (CycloneDX-ish lite) ----------

export function generateSbom(): string {
  // We don't ship code dependencies here - this SBOM enumerates the
  // *AI supply chain*: models, persona/scenario versions, framework
  // adapters. Procurement teams ask for "what's in the box that's
  // making decisions on customer data?" - this answers it.
  const models = new Set<string>();
  const personas = new Set<string>();
  const scenarios = new Set<string>();
  for (const f of corpus) {
    models.add(f.transcript.blue_model);
    models.add(f.transcript.red_model);
    models.add(f.verdict.judge_model);
    personas.add(f.transcript.persona_name);
    scenarios.add(f.transcript.scenario_name);
  }
  const sbom = {
    bomFormat: "GAUNTLET-AI-SBOM",
    specVersion: "0.1",
    serialNumber: `urn:uuid:gauntlet-${Date.now()}`,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "application",
        name: "gauntletapp",
        version: "0.14.0",
        description: "Adversarial test cloud for AI customer-service agents",
      },
      authors: [{ name: "Tim Dries", contact: "tim.dries@biztory.be" }],
    },
    components: [
      ...Array.from(models)
        .sort()
        .map((m) => ({
          type: "model",
          name: m,
          group: m.startsWith("claude") ? "Anthropic" : "external",
          purl: `pkg:llm/${encodeURIComponent(m)}`,
        })),
      {
        type: "framework",
        name: "@uipath/uipath-typescript",
        version: "1.3.8",
        purl: "pkg:npm/@uipath/uipath-typescript@1.3.8",
      },
      {
        type: "framework",
        name: "langgraph",
        version: "1.2.0",
        purl: "pkg:pypi/langgraph@1.2.0",
        scope: "external-blue-mode",
      },
      {
        type: "framework",
        name: "langchain-anthropic",
        version: "1.4.3",
        purl: "pkg:pypi/langchain-anthropic@1.4.3",
        scope: "external-blue-mode",
      },
      {
        type: "framework",
        name: "@anthropic-ai/sdk (via anthropic Python SDK)",
        purl: "pkg:pypi/anthropic",
        scope: "red+blue+coach+fix+referee",
      },
    ],
    "x-gauntlet": {
      personas: Array.from(personas).sort(),
      scenarios: Array.from(scenarios).sort(),
      fight_count: corpus.length,
    },
  };
  return JSON.stringify(sbom, null, 2);
}

export function downloadSbom() {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  download(
    `gauntlet-sbom-${ts}.json`,
    generateSbom(),
    "application/json"
  );
}

// ---------- Generic file download ----------

function download(filename: string, content: string, mimetype: string) {
  const blob = new Blob([content], { type: mimetype });
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
