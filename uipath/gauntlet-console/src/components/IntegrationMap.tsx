import "./IntegrationMap.css";
import { componentMap } from "../data/tenant";

export function IntegrationMap() {
  return (
    <section className="integration-section" id="integration">
      <div className="wrap">
        <h2>Where each piece lives in your tenant</h2>
        <p className="section-lede">
          Nothing runs outside UiPath. Click any card to open the matching
          surface: the agents in Studio Web Agent Builder, the orchestration
          in Maestro, the regression suite in Test Manager. This console is a
          Coded Web App in the same solution.
        </p>

        <div className="integration-grid">
          {componentMap.map((c) => (
            <a
              key={c.name}
              className="integration-card"
              href={c.url}
              target="_blank"
              rel="noreferrer"
            >
              <div className="integration-kind">{c.kind}</div>
              <div className="integration-name">{c.name}</div>
              <div className="integration-role">{c.role}</div>
              <div className="integration-cta">Open in UiPath ↗</div>
            </a>
          ))}
        </div>

      </div>
    </section>
  );
}
