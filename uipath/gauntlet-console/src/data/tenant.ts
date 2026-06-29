// All UiPath deep-links the console uses. The console deliberately routes
// users INTO native UiPath surfaces (Studio Web, Test Manager, Maestro)
// for any action that mutates state - the console is the cockpit, UiPath
// is the runtime.

// UiPath Labs (staging) environment — the solution is deployed into the
// Shared/Gauntlet folder of this org. Authored in production, deployed here
// via `uip solution deploy`, so the per-agent Studio Web designer IDs have no
// staging equivalent: the component links open the deployed solution instead.
const HOST = "https://staging.uipath.com";
const ORG = "hackathon26_038";
const TENANT = "DefaultTenant";

const SOLUTION_ID = "cf351ed9-c9ba-4aa2-ceb6-08deb24d397f";

export const tenant = {
  org: ORG,
  tenant: TENANT,
  baseCloud: `${HOST}/${ORG}`,
  baseTenant: `${HOST}/${ORG}/${TENANT}`,
  studioWebSolution: `${HOST}/${ORG}/studio_/designer/?solutionId=${SOLUTION_ID}`,
  testManagerProject: `${HOST}/${ORG}/${TENANT}/testmanager_`,
  maestroRoot: `${HOST}/${ORG}/${TENANT}/maestro_`,
  agentBuilderBlue: `${HOST}/${ORG}/studio_/designer/?solutionId=${SOLUTION_ID}`,
  agentBuilderReferee: `${HOST}/${ORG}/studio_/designer/?solutionId=${SOLUTION_ID}`,
};

export const componentMap = [
  {
    name: "MetroBankCSR",
    role: "Blue agent (system under test)",
    kind: "Agent Builder (low-code)",
    url: tenant.agentBuilderBlue,
  },
  {
    name: "RefereeAgent",
    role: "Judge - grades every fight, scores 0–100, flags policy breaches",
    kind: "Agent Builder (low-code, Opus 4.7)",
    url: tenant.agentBuilderReferee,
  },
  {
    name: "FightArena",
    role: "Case lifecycle: Matchmaking → Negotiating → Verdict → Archived",
    kind: "Maestro Case",
    url: tenant.studioWebSolution,
  },
  {
    name: "RoundOrchestrator",
    role: "Executable flow: trigger → Blue → Referee → End",
    kind: "Maestro Flow (BPMN)",
    url: tenant.studioWebSolution,
  },
  {
    name: "GAUNTLET",
    role: "Regression test suite (auto-grown from fight history)",
    kind: "Test Manager project",
    url: tenant.testManagerProject,
  },
];
