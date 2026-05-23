import { useState } from "react";
import { Sidebar, type TabId } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { Analytics } from "./components/Analytics";
import { Coverage } from "./components/Coverage";
import { IntegrationMap } from "./components/IntegrationMap";
import { FightLog } from "./components/FightLog";
import { RunFightModal } from "./components/RunFightModal";
import { CoachLab } from "./components/CoachLab";
import { FixLab } from "./components/FixLab";
import { TriageQueue } from "./components/TriageQueue";
import { CoverageMatrix } from "./components/CoverageMatrix";
import { ComplianceLens } from "./components/ComplianceLens";
import { PersonaModal } from "./components/PersonaModal";
import { ShieldIcon, SwordIcon } from "./components/Icon";
import { SystemUnderTest } from "./components/SystemUnderTest";

function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [runOpen, setRunOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [fixFightId, setFixFightId] = useState<string | null>(null);
  const [personaOpen, setPersonaOpen] = useState<string | null>(null);

  const openFixLab = (fightId?: string | null) => {
    if (fightId) setFixFightId(fightId);
    setTab("defend");
    requestAnimationFrame(() => {
      document
        .getElementById("fix-lab")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <Sidebar active={tab} onNavigate={setTab} />
      <div className="app-shell">
        {tab === "dashboard" && (
          <Dashboard
            onRun={() => {
              setTab("attack");
              setRunOpen(true);
            }}
            onCoach={() => {
              setTab("attack");
              setCoachOpen(true);
            }}
            onFix={() => setTab("defend")}
            onOpenAnalytics={() => setTab("analytics")}
            onOpenLogs={() => setTab("logs")}
            onOpenPersona={setPersonaOpen}
          />
        )}

        {tab === "attack" && (
          <main className="tab-page tab-page-red">
            <header className="tab-page-head tab-page-head-with-aside">
              <div>
                <span className="tab-page-side tab-page-side-red">
                  <SwordIcon size={12} /> RED TEAM
                </span>
                <h1>Attack</h1>
                <p>Run fights against the agent. Coach invents new attacks.</p>
              </div>
              <SystemUnderTest variant="card" />
            </header>
            <section className="tab-page-cards">
              <button className="action-tile" onClick={() => setRunOpen(true)}>
                <span className="action-tile-eyebrow">Run a fight</span>
                <span className="action-tile-title">
                  Single or batch, up to 10
                </span>
                <span className="action-tile-meta">
                  Pick persona × scenario × posture. Watch the call unfold,
                  voice-narrated.
                </span>
              </button>
              <button className="action-tile" onClick={() => setCoachOpen(true)}>
                <span className="action-tile-eyebrow">Coach Lab</span>
                <span className="action-tile-title">
                  Invent a new attacker
                </span>
                <span className="action-tile-meta">
                  Targets the weakest attack category. Adds to the suite.
                </span>
              </button>
            </section>
          </main>
        )}

        {tab === "defend" && (
          <main className="tab-page tab-page-blue">
            <header className="tab-page-head tab-page-head-with-aside">
              <div>
                <span className="tab-page-side tab-page-side-blue">
                  <ShieldIcon size={12} /> BLUE TEAM
                </span>
                <h1>Defend</h1>
                <p>Diagnose failed fights, draft a patch, send to triage.</p>
              </div>
              <SystemUnderTest variant="card" />
            </header>
            <FixLab focusFightId={fixFightId} onOpenPersona={setPersonaOpen} />
            <TriageQueue />
          </main>
        )}

        {tab === "analytics" && (
          <main className="tab-page">
            <header className="tab-page-head">
              <span className="tab-page-side">ANALYTICS</span>
              <h1>Trends and leaderboards</h1>
              <p>
                Every metric derived from the live corpus. Click a persona
                name to drill in.
              </p>
            </header>
            <Analytics onOpenPersona={setPersonaOpen} />
          </main>
        )}

        {tab === "audit" && (
          <main className="tab-page">
            <header className="tab-page-head">
              <span className="tab-page-side">AUDIT</span>
              <h1>Posture and compliance</h1>
              <p>
                What we cover against the AAA spec, ISO 42001, NIST AI RMF.
              </p>
            </header>
            <CoverageMatrix />
            <ComplianceLens />
            <Coverage />
            <IntegrationMap />
          </main>
        )}

        {tab === "logs" && (
          <main className="tab-page">
            <header className="tab-page-head">
              <span className="tab-page-side">LOGS</span>
              <h1>Every adversarial call</h1>
              <p>
                Full transcript, verdict, and policy breaches per fight.
                Search across the corpus. Click any row to expand.
              </p>
            </header>
            <FightLog onOpenFix={openFixLab} onOpenPersona={setPersonaOpen} />
          </main>
        )}
      </div>

      <RunFightModal open={runOpen} onClose={() => setRunOpen(false)} />
      <CoachLab open={coachOpen} onClose={() => setCoachOpen(false)} />
      <PersonaModal persona={personaOpen} onClose={() => setPersonaOpen(null)} />
    </>
  );
}

export default App;
