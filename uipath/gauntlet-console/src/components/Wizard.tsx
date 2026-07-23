// Wizard - first-run guide. Lives between Hero and the Threat
// Dashboard so a new visitor immediately sees four expandable steps
// that explain WHAT each part of the console does in plain language
// and WHY it matters, with a CTA button that takes them there.
//
// Dismissable; remembers via localStorage. After dismissal a small
// "Show guide again" pill stays in the same slot so it's never lost
// permanently.

import "./Wizard.css";
import { useEffect, useState } from "react";

const DISMISS_KEY = "gauntlet.wizard.dismissed.v1";

interface Step {
  num: string;
  title: string;
  what: string;
  why: string;
  ctaLabel: string;
  scrollTo?: string;
  action?: "run" | "coach" | "fix";
}

const STEPS: Step[] = [
  {
    num: "1",
    title: "See how the agent is holding up",
    what: "The scoreboard at the top tells you, across every adversarial call ever run, how often your AI agent gave the right answer vs. fell for an attack.",
    why: "It's the one-glance answer to 'are we safe to ship?' Green = blue defended. Red = something got through.",
    ctaLabel: "Show me the scoreboard",
    scrollTo: "dashboard",
  },
  {
    num: "2",
    title: "Watch an attack happen, end to end",
    what: "Pick a fraud persona (panicked grandma, fake CEO, aggressive lawyer, etc.), pick the bank's policy posture (strict, lenient, naive), and watch the conversation unfold turn by turn.",
    why: "Seeing one fight beats reading a hundred reports. You see exactly what the attacker says, exactly when your agent breaks character.",
    ctaLabel: "Run a fight",
    action: "run",
  },
  {
    num: "3",
    title: "When an attack succeeds, get a fix you can paste in",
    what: "Click any 'View fix' badge in the fight log (or open Fix Recommender). An AI reads the broken call and drafts a concrete patch for the agent's prompt plus regression tests to prove the patch doesn't break legitimate flows.",
    why: "You don't need a security engineer to write the fix. The model that found the hole also drafts the fix and the proof it works.",
    ctaLabel: "Open Fix Recommender",
    action: "fix",
  },
  {
    num: "4",
    title: "Send the fix to your team for review",
    what: "One click puts the fix proposal into Action Center as a triage task with severity, OWASP tag, root cause, and the patch attached.",
    why: "Findings stop dying in chat. Your reviewers see the same evidence the AI did, and the audit trail lands in UiPath alongside every other ops ticket.",
    ctaLabel: "See the triage queue",
    scrollTo: "triage",
  },
];

export interface WizardActions {
  onRun: () => void;
  onCoach: () => void;
  onFix: () => void;
}

export function Wizard({ actions }: { actions: WizardActions }) {
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState<string | null>("1");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode, ignore
    }
  };

  const reopen = () => {
    setDismissed(false);
    setExpanded("1");
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
  };

  const handleAction = (step: Step) => {
    if (step.action === "run") return actions.onRun();
    if (step.action === "coach") return actions.onCoach();
    if (step.action === "fix") return actions.onFix();
    if (step.scrollTo) {
      document
        .getElementById(step.scrollTo)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (dismissed) {
    return (
      <div className="wizard-reopen-wrap">
        <button className="wizard-reopen" onClick={reopen}>
          First time here? Open the 4-step guide
        </button>
      </div>
    );
  }

  return (
    <section className="wizard-section" aria-label="First-time-user guide">
      <div className="wrap">
        <div className="wizard-card">
          <header className="wizard-head">
            <div>
              <span className="wizard-eyebrow">First time here?</span>
              <h2>Four things to try, in order</h2>
              <p className="wizard-lede">
                You can poke around freely, but this guide walks you straight
                to the demo moments judges will care about. Two minutes.
              </p>
            </div>
            <button
              className="wizard-dismiss"
              onClick={dismiss}
              aria-label="Dismiss guide"
              title="Dismiss"
            >
              Dismiss ×
            </button>
          </header>

          <ul className="wizard-steps">
            {STEPS.map((s) => {
              const open = expanded === s.num;
              return (
                <li
                  key={s.num}
                  className={`wizard-step ${open ? "open" : ""}`}
                >
                  <button
                    className="wizard-step-head"
                    onClick={() => setExpanded(open ? null : s.num)}
                    aria-expanded={open}
                  >
                    <span className="wizard-step-num">{s.num}</span>
                    <span className="wizard-step-title">{s.title}</span>
                    <span className="wizard-step-chev">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="wizard-step-body">
                      <div className="wizard-row">
                        <span className="wizard-label">What</span>
                        <p>{s.what}</p>
                      </div>
                      <div className="wizard-row">
                        <span className="wizard-label">Why</span>
                        <p>{s.why}</p>
                      </div>
                      <button
                        className="btn btn-brand btn-sm wizard-cta"
                        onClick={() => handleAction(s)}
                      >
                        {s.ctaLabel} →
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
