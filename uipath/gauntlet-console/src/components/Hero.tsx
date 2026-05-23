import "./Hero.css";
import { corpus } from "../data/corpus";
import { tenant } from "../data/tenant";
import { SystemUnderTest } from "./SystemUnderTest";

interface Props {
  onRun: () => void;
  onCoach: () => void;
  onFix?: () => void;
}

function postureLabel(rate: number): { label: string; tone: "ok" | "warn" | "alert" } {
  if (rate >= 0.95) return { label: "Strong", tone: "ok" };
  if (rate >= 0.8) return { label: "Holding", tone: "warn" };
  return { label: "At risk", tone: "alert" };
}

export function Hero({ onRun, onCoach, onFix }: Props) {
  const total = corpus.length;
  const blueWins = corpus.filter((f) => f.verdict.winner === "blue").length;
  const redWins = corpus.filter((f) => f.verdict.winner === "red").length;
  const rate = total ? blueWins / total : 1;
  const posture = postureLabel(rate);
  const asr = total ? redWins / total : 0;
  const diagnosed = corpus.filter((f) => f.fix_proposal).length;

  return (
    <header className="hero">
      <div className="wrap hero-inner">
        <div className="hero-text">
          <div className="hero-brand-row">
            <img className="hero-logo" src="./gauntlet_logo.png" alt="GAUNTLET" />
          </div>
          <h1>
            Find the holes in your AI agent{" "}
            <span className="hero-accent">before fraudsters do</span>.
          </h1>
          <p className="hero-lede">
            GAUNTLET attacks your AI customer-service agent the way real
            fraudsters would: grandma scams, fake CEOs, lawyers, prompt
            injectors. Every successful breach becomes a regression test that
            runs forever.
          </p>
          <div className="hero-sut">
            <SystemUnderTest variant="badge" />
          </div>
          <div className="hero-cta">
            <button className="btn btn-brand" onClick={onRun}>
              Run an attack
            </button>
            <button className="btn btn-outline" onClick={onCoach}>
              Let Coach invent one
            </button>
            {onFix && diagnosed > 0 && (
              <button className="btn btn-outline" onClick={onFix}>
                Open Fix Recommender ({diagnosed})
              </button>
            )}
            <a
              className="btn btn-ghost"
              href={tenant.testManagerProject}
              target="_blank"
              rel="noreferrer"
            >
              Open Test Manager ↗
            </a>
          </div>
        </div>
        <aside className={`hero-posture hero-posture-${posture.tone}`}>
          <div className="posture-label">Current security posture</div>
          <div className="posture-value">{posture.label}</div>
          <div className="posture-meta">
            <span className="posture-num">{(rate * 100).toFixed(0)}%</span>
            <span className="posture-desc">
              of {total.toLocaleString()} adversarial calls defended
            </span>
          </div>
          <div className="posture-metric">
            <div>
              <span className="posture-metric-label">Attack success rate</span>
              <span className="posture-metric-value posture-asr">{(asr * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="posture-metric-label">Coverage</span>
              <span className="posture-metric-value">
                {new Set(corpus.map((f) => f.transcript.persona_name)).size} attack
                personas active
              </span>
            </div>
          </div>
          {redWins > 0 && (
            <div className="posture-alert">
              {redWins} successful {redWins === 1 ? "attack" : "attacks"} on file:
              triage in the fight log
            </div>
          )}
        </aside>
      </div>
    </header>
  );
}
