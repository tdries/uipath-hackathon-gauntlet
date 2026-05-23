// SystemUnderTest - a compact "we are testing X" badge so the agent
// being attacked is never invisible. Used in Hero, Attack tab header,
// and FightDetail verdict pane.

import "./SystemUnderTest.css";
import { tenant } from "../data/tenant";
import { ShieldIcon } from "./Icon";

export interface SystemUnderTestProps {
  /** Optional blue mode label (standard / lenient / naive / external). */
  mode?: string | null;
  /** Optional blue model id (e.g. claude-sonnet-4-6). Overrides default. */
  model?: string | null;
  /** Render mode: "badge" (small inline) or "card" (full panel). */
  variant?: "badge" | "card";
}

export function SystemUnderTest({
  mode,
  model,
  variant = "badge",
}: SystemUnderTestProps) {
  const blueModel = model ?? "claude-sonnet-4-6";
  const modeLabel = mode ?? "standard";
  if (variant === "card") {
    return (
      <aside className="sut-card">
        <div className="sut-card-head">
          <ShieldIcon size={16} />
          <span className="sut-eyebrow">System under test</span>
        </div>
        <h3>MetroBankCSR ("Cara")</h3>
        <dl className="sut-card-dl">
          <div>
            <dt>Authored in</dt>
            <dd>
              <a
                href={tenant.agentBuilderBlue}
                target="_blank"
                rel="noreferrer"
              >
                UiPath Agent Builder ↗
              </a>
            </dd>
          </div>
          <div>
            <dt>Posture</dt>
            <dd>
              <code>{modeLabel}</code>
            </dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>
              <code>{blueModel}</code>
            </dd>
          </div>
          <div>
            <dt>Judge</dt>
            <dd>
              <a
                href={tenant.agentBuilderReferee}
                target="_blank"
                rel="noreferrer"
              >
                RefereeAgent ↗
              </a>{" "}
              <span className="sut-judge-model">(claude-opus-4-7)</span>
            </dd>
          </div>
        </dl>
      </aside>
    );
  }
  return (
    <a
      className="sut-badge"
      href={tenant.agentBuilderBlue}
      target="_blank"
      rel="noreferrer"
      title="Open the system under test in Studio Web Agent Builder"
    >
      <ShieldIcon size={12} />
      <span className="sut-badge-label">Testing</span>
      <strong>MetroBankCSR</strong>
      <span className="sut-badge-meta">
        Agent Builder · {modeLabel}
      </span>
    </a>
  );
}
