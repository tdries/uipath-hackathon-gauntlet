// All UiPath deep-links the console uses. The console deliberately routes
// users INTO native UiPath surfaces (Studio Web, Test Manager, Maestro)
// for any action that mutates state - the console is the cockpit, UiPath
// is the runtime.

const ORG = "thesingularityisnearer";
const TENANT = "DefaultTenant";

const SOLUTION_ID = "cf351ed9-c9ba-4aa2-ceb6-08deb24d397f";
const METROBANK_AGENT_ID = "7e55e6e7-6d26-49aa-abf9-c6b1c3c044d6";
const REFEREE_AGENT_ID = "3d2ef97f-f896-4591-8771-9183ad43d76b";

export const tenant = {
  org: ORG,
  tenant: TENANT,
  baseCloud: `https://cloud.uipath.com/${ORG}`,
  baseTenant: `https://cloud.uipath.com/${ORG}/${TENANT}`,
  studioWebSolution: `https://cloud.uipath.com/${ORG}/studio_/designer/?solutionId=${SOLUTION_ID}`,
  testManagerProject: `https://cloud.uipath.com/${ORG}/${TENANT}/testmanager_`,
  maestroRoot: `https://cloud.uipath.com/${ORG}/${TENANT}/maestro_`,
  agentBuilderBlue: `https://cloud.uipath.com/${ORG}/studio_/designer/${METROBANK_AGENT_ID}?solutionId=${SOLUTION_ID}`,
  agentBuilderReferee: `https://cloud.uipath.com/${ORG}/studio_/designer/${REFEREE_AGENT_ID}?solutionId=${SOLUTION_ID}`,
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
