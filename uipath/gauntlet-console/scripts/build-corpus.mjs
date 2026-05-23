// Read every fight JSON from runs/ and emit a single TypeScript module
// the React app imports. Runs as a `prebuild` hook so the deployed app
// always ships with the latest corpus snapshot.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const runsDir = join(repoRoot, "runs");
const outDir = join(here, "..", "src", "data");
const outFile = join(outDir, "corpus.json");

mkdirSync(outDir, { recursive: true });

const files = readdirSync(runsDir)
  .filter(
    (f) => f.endsWith(".json") && !f.endsWith(".fix.json") && !f.startsWith("_")
  )
  .sort();

const corpus = [];
let fixesAttached = 0;
for (const f of files) {
  try {
    const payload = JSON.parse(readFileSync(join(runsDir, f), "utf8"));
    if (!payload.transcript || !payload.verdict) continue;
    const fixSibling = join(runsDir, f.replace(/\.json$/, ".fix.json"));
    try {
      const fix = JSON.parse(readFileSync(fixSibling, "utf8"));
      payload.fix_proposal = fix;
      fixesAttached++;
    } catch {
      // No fix proposal for this run — fine, most fights don't need one.
    }
    corpus.push(payload);
  } catch (err) {
    console.warn(`skip ${f}: ${err.message}`);
  }
}

// Newest first.
corpus.sort((a, b) =>
  (b.transcript.started_at || "").localeCompare(a.transcript.started_at || "")
);

// Strip em-dashes from rendered content. The source runs/*.json
// preserve what the LLMs actually said; the deployed corpus replaces
// the unicode em-dash with a normal hyphen so the UI doesn't read
// "AI-y". Runs through every string in the corpus tree.
function stripEmDashes(node) {
  if (typeof node === "string") return node.replace(/—/g, "-");
  if (Array.isArray(node)) return node.map(stripEmDashes);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = stripEmDashes(v);
    return out;
  }
  return node;
}
const cleaned = corpus.map(stripEmDashes);

writeFileSync(outFile, JSON.stringify(cleaned, null, 2));
console.log(
  `corpus: ${cleaned.length} fights (${fixesAttached} with fix proposals) -> ${outFile}`
);
