import "./Sidebar.css";
import type { ReactNode } from "react";
import { LiveStatus } from "./LiveStatus";
import { VoiceToggle } from "./VoiceToggle";
import { ShieldIcon, SwordIcon } from "./Icon";

export type TabId =
  | "dashboard"
  | "attack"
  | "defend"
  | "analytics"
  | "audit"
  | "logs";

interface Props {
  active: TabId;
  onNavigate: (id: TabId) => void;
}

interface NavItem {
  id: TabId;
  label: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

const ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", hint: "Tenant status at a glance" },
  {
    id: "attack",
    label: "Attack",
    hint: "Run fights / Coach Lab",
    icon: <SwordIcon size={14} />,
    className: "nav-red",
  },
  {
    id: "defend",
    label: "Defend",
    hint: "Fix Recommender / Triage",
    icon: <ShieldIcon size={14} />,
    className: "nav-blue",
  },
  { id: "analytics", label: "Analytics", hint: "Trends, heatmap, leaderboard" },
  { id: "audit", label: "Audit", hint: "ISO / NIST / coverage" },
  { id: "logs", label: "Logs", hint: "Every fight, searchable" },
];

export function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img
          className="sidebar-logo"
          src="./gauntlet_logo_mark.png"
          alt=""
          aria-hidden="true"
        />
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">GAUNTLET</span>
          <span className="sidebar-brand-sub">Adversarial test cloud</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <ul>
          {ITEMS.map((item) => (
            <li key={item.id}>
              <button
                aria-current={active === item.id ? "page" : undefined}
                className={`sidebar-item ${item.className ?? ""} ${
                  active === item.id ? "active" : ""
                }`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="sidebar-item-icon" aria-hidden="true">
                  {item.icon ?? <span className="sidebar-bullet" />}
                </span>
                <span className="sidebar-item-text">
                  <span className="sidebar-item-label">{item.label}</span>
                  {item.hint && (
                    <span className="sidebar-item-hint">{item.hint}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <LiveStatus />
        <VoiceToggle />
      </div>
    </aside>
  );
}
