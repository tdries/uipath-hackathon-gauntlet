import "./Footer.css";
import { tenant } from "../data/tenant";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-mark">
              <span className="footer-dot" />
              <span className="footer-name">GAUNTLET</span>
            </div>
            <p className="footer-tagline">
              The adversarial complement to UiPath Agent Evaluations.
              <br />
              UiPath AgentHack 2026 · Track 3 (Test Cloud).
            </p>
          </div>
          <div className="footer-col">
            <div className="footer-heading">In your tenant</div>
            <ul>
              <li><a href={tenant.studioWebSolution} target="_blank" rel="noreferrer">gauntlet solution</a></li>
              <li><a href={tenant.testManagerProject} target="_blank" rel="noreferrer">Test Manager · GAUNTLET</a></li>
              <li><a href={tenant.maestroRoot} target="_blank" rel="noreferrer">Maestro</a></li>
              <li><a href={tenant.baseCloud} target="_blank" rel="noreferrer">Automation Cloud</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <div className="footer-heading">Taxonomies</div>
            <ul>
              <li><a href="https://genai.owasp.org/llm-top-10/" target="_blank" rel="noreferrer">OWASP LLM Top 10 (2025)</a></li>
              <li><a href="https://atlas.mitre.org/" target="_blank" rel="noreferrer">MITRE ATLAS</a></li>
              <li><a href="https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf" target="_blank" rel="noreferrer">NIST AI RMF 600-1</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <div className="footer-heading">Built with</div>
            <ul>
              <li><a href="https://www.anthropic.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a></li>
              <li><a href="https://docs.uipath.com/agents/automation-cloud/latest/user-guide" target="_blank" rel="noreferrer">UiPath Agent Builder</a></li>
              <li><a href="https://docs.uipath.com/maestro/automation-cloud/latest/user-guide" target="_blank" rel="noreferrer">UiPath Maestro</a></li>
              <li><a href="https://docs.uipath.com/test-cloud/automation-cloud/latest/user-guide" target="_blank" rel="noreferrer">UiPath Test Cloud</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          © 2026 GAUNTLET · MIT licensed · built primarily with Claude Code
        </div>
      </div>
    </footer>
  );
}
