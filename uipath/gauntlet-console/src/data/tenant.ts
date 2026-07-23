// All UiPath deep-links the console uses. The console deliberately routes
// users INTO native UiPath surfaces (Studio Web, Test Manager, Maestro)
// for any action that mutates state - the console is the cockpit, UiPath
// is the runtime.

// UiPath Labs (staging) environment. The solution both runs in the
// Shared/Gauntlet Orchestrator folder (via `uip solution deploy run`) and is
// uploaded to Studio Web (via `uip solution upload`) for browser editing.
// Studio Web mints its own SolutionId on import — that is what the designer
// links below use, and it differs from the local .uipx SolutionId
// (cf351ed9…) that Orchestrator deploys.
const HOST = "https://staging.uipath.com";
const ORG = "hackathon26_038";
const TENANT = "DefaultTenant";

// Studio Web solution id (from `uip solution upload`), NOT the local .uipx id.
const SOLUTION_ID = "a0952f10-b35a-4df1-7f09-08dee7ea4309";
// Studio Web designer root id for this solution — the path segment in the
// `DesignerUrl` that `uip solution upload` returns. The bare `?solutionId=`
// form does not route; the designer id is required.
const SW_DESIGN_ID = "40684a46-d872-4e47-b074-657b78934b7f";

export const tenant = {
  org: ORG,
  tenant: TENANT,
  baseCloud: `${HOST}/${ORG}`,
  baseTenant: `${HOST}/${ORG}/${TENANT}`,
  studioWebSolution: `${HOST}/${ORG}/studio_/designer/${SW_DESIGN_ID}?solutionId=${SOLUTION_ID}`,
  testManagerProject: `${HOST}/${ORG}/${TENANT}/testmanager_`,
  maestroRoot: `${HOST}/${ORG}/${TENANT}/maestro_`,
  agentBuilderBlue: `${HOST}/${ORG}/studio_/designer/${SW_DESIGN_ID}?solutionId=${SOLUTION_ID}`,
  agentBuilderReferee: `${HOST}/${ORG}/studio_/designer/${SW_DESIGN_ID}?solutionId=${SOLUTION_ID}`,
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
    role: "Judge, grades every fight, scores 0–100, flags policy breaches",
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
