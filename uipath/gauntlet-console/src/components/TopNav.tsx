import "./TopNav.css";
import type { ReactNode } from "react";
import { LiveStatus } from "./LiveStatus";
import { VoiceToggle } from "./VoiceToggle";
import { ShieldIcon, SwordIcon } from "./Icon";

export type TabId = "overview" | "attack" | "defend" | "audit" | "logs";

interface Props {
  active: TabId;
  onNavigate: (id: TabId) => void;
}

interface Tab {
  id: TabId;
  label: string;
  icon?: ReactNode;
  className?: string;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "attack", label: "Attack", icon: <SwordIcon size={14} />, className: "tab-red" },
  { id: "defend", label: "Defend", icon: <ShieldIcon size={14} />, className: "tab-blue" },
  { id: "audit", label: "Audit" },
  { id: "logs", label: "Logs" },
];

export function TopNav({ active, onNavigate }: Props) {
  return (
    <nav className="topnav">
      <div className="topnav-inner">
        <button
          className="brand-mark"
          onClick={() => onNavigate("overview")}
          aria-label="GAUNTLET - go to overview"
        >
          <img
            className="brand-logo"
            src="./gauntlet_logo_mark.png"
            alt=""
            aria-hidden="true"
          />
          <span className="brand-name">GAUNTLET</span>
        </button>
        <ul className="topnav-tabs" role="tablist">
          {TABS.map((tab) => (
            <li key={tab.id} role="presentation">
              <button
                role="tab"
                aria-selected={active === tab.id}
                className={`topnav-tab ${tab.className ?? ""} ${active === tab.id ? "active" : ""}`}
                onClick={() => onNavigate(tab.id)}
              >
                {tab.icon && (
                  <span className="topnav-tab-icon" aria-hidden="true">
                    {tab.icon}
                  </span>
                )}
                <span className="topnav-tab-label">{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="topnav-spacer" />
        <VoiceToggle />
        <LiveStatus />
      </div>
    </nav>
  );
}
