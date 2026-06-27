import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  GitBranch,
  Home,
  Layers3,
  Settings
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Role } from "../blendup/roles";
import { roleLabel } from "../blendup/roles";
import type { ProjectSnapshot } from "../blendup/types";
import { roleFilters } from "./filters";
import { viewTitle } from "./metrics";
import type { ActiveView, OperationMessage } from "./types";
import { OperationBanner, SegmentedControl } from "./ui";

type NavItem = {
  icon: ReactNode;
  key: ActiveView;
  label: string;
  tone?: "muted";
};

function navigationForRole(role: Role): NavItem[] {
  const items: Record<ActiveView, NavItem> = {
    assets: { icon: <Boxes size={18} />, key: "assets", label: "Assets" },
    dashboard: { icon: <Home size={18} />, key: "dashboard", label: "Dashboard" },
    git: { icon: <GitBranch size={18} />, key: "git", label: "Git" },
    problems: { icon: <AlertTriangle size={18} />, key: "problems", label: "Problems" },
    references: { icon: <Layers3 size={18} />, key: "references", label: "References" },
    settings: { icon: <Settings size={18} />, key: "settings", label: "Settings" },
    tasks: { icon: <ClipboardList size={18} />, key: "tasks", label: "Tasks" }
  };

  if (role === "developer") {
    return [
      items.dashboard,
      items.problems,
      items.tasks,
      items.git,
      { ...items.assets, tone: "muted" },
      { ...items.references, tone: "muted" },
      items.settings
    ];
  }

  return [
    items.dashboard,
    items.assets,
    items.references,
    items.tasks,
    { ...items.problems, tone: "muted" },
    { ...items.git, tone: "muted" },
    items.settings
  ];
}

export function WorkspaceShell({
  activeView,
  children,
  onCloseMessage,
  operationMessage,
  project,
  role,
  setActiveView,
  setRole,
  shellStyle
}: {
  activeView: ActiveView;
  children: ReactNode;
  onCloseMessage: () => void;
  operationMessage: OperationMessage | null;
  project: ProjectSnapshot;
  role: Role;
  setActiveView: (view: ActiveView) => void;
  setRole: (role: Role) => void;
  shellStyle: CSSProperties;
}) {
  const navItems = navigationForRole(role);

  return (
    <main className={`app-shell role-${role}`} style={shellStyle}>
      <aside className="sidebar" aria-label="Navigation principale">
        <button className="brand brand-button" onClick={() => setActiveView("dashboard")} type="button">
          <div className="brand-mark">BU</div>
          <div>
            <strong>BlendUp</strong>
            <span>{project.project.name}</span>
          </div>
        </button>

        <div className="role-switch">
          <span className="eyebrow">Vue</span>
          <SegmentedControl ariaLabel="Choisir la vue" options={roleFilters} value={role} onChange={setRole} />
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={`nav-item ${item.tone ?? ""} ${activeView === item.key ? "active" : ""}`}
              key={item.key}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
              {item.key === "problems" && project.problems.length > 0 ? (
                <span className="nav-badge">{project.problems.length}</span>
              ) : null}
              {item.key === "tasks" && project.tasks.length > 0 ? (
                <span className="nav-badge neutral">{project.tasks.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Vue {roleLabel(role)}</span>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-meta">
            <span title={project.projectRoot}>{project.projectRoot ?? "Snapshot local"}</span>
            <span>Blender {project.project.targets.blenderMinimumVersion}+</span>
            <span>Unity {project.project.targets.unityTestVersion ?? project.project.targets.unityMinimumVersion}</span>
          </div>
        </header>

        {operationMessage ? <OperationBanner message={operationMessage} onClose={onCloseMessage} /> : null}
        {children}
      </section>
    </main>
  );
}
