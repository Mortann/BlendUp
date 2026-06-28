import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  Code2,
  GalleryHorizontal,
  GitBranch,
  Home,
  KanbanSquare,
  ListTree,
  Settings,
  Sparkles,
  UsersRound
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import type { Role } from "../blendup/roles";
import type { ProjectSnapshot } from "../blendup/types";
import { viewTitle } from "./metrics";
import type { ActiveView, OperationMessage } from "./types";
import { OperationBanner } from "./ui";

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
    nomenclature: { icon: <ListTree size={18} />, key: "nomenclature", label: "Nomenclature" },
    problems: { icon: <AlertTriangle size={18} />, key: "problems", label: "Problemes" },
    references: { icon: <GalleryHorizontal size={18} />, key: "references", label: "References" },
    settings: { icon: <Settings size={18} />, key: "settings", label: "Settings" },
    tasks: { icon: <KanbanSquare size={18} />, key: "tasks", label: "Taches" },
    team: { icon: <UsersRound size={18} />, key: "team", label: "Equipe" }
  };

  if (role === "developer") {
    return [
      items.dashboard,
      items.problems,
      items.tasks,
      items.git,
      items.nomenclature,
      items.team,
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
    items.nomenclature,
    items.team,
    { ...items.problems, tone: "muted" },
    { ...items.git, tone: "muted" },
    items.settings
  ];
}

export function WorkspaceShell({
  activeView,
  children,
  onCloseMessage,
  onCloseProject,
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
  onCloseProject: () => void;
  operationMessage: OperationMessage | null;
  project: ProjectSnapshot;
  role: Role;
  setActiveView: (view: ActiveView) => void;
  setRole: (role: Role) => void;
  shellStyle: CSSProperties;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navItems = navigationForRole(role);
  const handleNavigate = (view: ActiveView) => {
    setActiveView(view);
    setIsCollapsed((current) => !current);
  };

  return (
    <main className={`app-shell role-${role} ${isCollapsed ? "sidebar-collapsed" : ""}`} style={shellStyle}>
      <aside className="sidebar" aria-label="Navigation principale">
        <button
          aria-label={isCollapsed ? "Deplier la navigation" : "Replier la navigation"}
          className="sidebar-brand-toggle"
          onClick={() => setIsCollapsed((current) => !current)}
          title={isCollapsed ? "Deplier la navigation" : "Replier la navigation"}
          type="button"
        >
          <span className="brand-mark mini">BU</span>
          <span className="brand-wordmark">BlendUp</span>
        </button>

        <div className="role-toggle" aria-label="Choisir la vue">
          <button
            className={role === "artist" ? "active" : ""}
            onClick={() => setRole("artist")}
            title="Vue Artiste"
            type="button"
          >
            <Sparkles size={17} />
            <span>Artiste</span>
          </button>
          <button
            className={role === "developer" ? "active" : ""}
            onClick={() => setRole("developer")}
            title="Vue Dev"
            type="button"
          >
            <Code2 size={17} />
            <span>Dev</span>
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              aria-label={item.label}
              className={`nav-item ${item.tone ?? ""} ${activeView === item.key ? "active" : ""}`}
              key={item.key}
              onClick={() => handleNavigate(item.key)}
              title={item.label}
              type="button"
            >
              <span className="nav-icon-shell">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
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

      <section className="workspace" aria-label={viewTitle(activeView)}>
        <button
          aria-label="Fermer le projet et revenir a l'accueil"
          className="project-home-button"
          onClick={onCloseProject}
          title={`Fermer ${project.project.name}`}
          type="button"
        >
          <BadgeCheck size={17} />
          <span>Accueil</span>
        </button>

        {operationMessage ? <OperationBanner message={operationMessage} onClose={onCloseMessage} /> : null}
        {children}
      </section>
    </main>
  );
}
