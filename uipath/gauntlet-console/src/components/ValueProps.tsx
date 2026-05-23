import "./ValueProps.css";

const PROPS = [
  {
    icon: "①",
    title: "What UiPath ships today",
    body: (
      <>
        Agent Evaluations grade whether your agent did the right thing on a known
        input. Autopilot generates manual test cases from requirements. Test
        Manager tracks pass/fail. <strong>None of it attacks the agent.</strong>
      </>
    ),
  },
  {
    icon: "②",
    title: "What GAUNTLET adds",
    body: (
      <>
        An autonomous Red agent that probes Blue with multi-turn social
        engineering - grandma scams, fake CEOs, regulator impersonations, prompt
        injections. Every successful breach is tagged against{" "}
        <strong>OWASP LLM Top 10 + MITRE ATLAS</strong> and becomes a regression
        test in your Test Manager project.
      </>
    ),
  },
  {
    icon: "③",
    title: "Why a buyer pays",
    body: (
      <>
        Replaces the $50–150k annual human red-team engagement with continuous,
        dashboard-able coverage. Auditors get an <strong>OWASP-tagged transcript
        per scenario</strong>, not a stale PDF. Coach grows the library nightly -
        no humans authoring YAMLs.
      </>
    ),
  },
];

export function ValueProps() {
  return (
    <section className="value-section" id="about">
      <div className="wrap">
        <div className="value-header">
          <h2>What this is, and why it's not a duplicate of Agent Evaluations</h2>
          <p className="section-lede">
            UiPath ships world-class <em>functional</em> agent testing. GAUNTLET
            is the <em>adversarial</em> layer they don't ship. Both run side-by-side
            in the same tenant - one catches "did the agent do the right thing,"
            the other catches "can someone make it do the wrong thing."
          </p>
        </div>
        <div className="value-grid">
          {PROPS.map((p) => (
            <div className="value-card" key={p.title}>
              <div className="value-icon">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
