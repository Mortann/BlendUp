import { AlertTriangle, Boxes, ChevronLeft, Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSnapshot } from "../blendup/types";
import type { ActiveView, OperationMessage } from "./types";
import { OperationBanner } from "./ui";

const navigation: Array<{ icon: ReactNode; key: ActiveView; label: string }> = [
  { icon: <Boxes size={19} />, key: "assets", label: "Assets" },
  { icon: <AlertTriangle size={19} />, key: "problems", label: "Problemes" },
  { icon: <Settings size={19} />, key: "settings", label: "Parametres" }
];

export function WorkspaceShell({
  activeView,
  children,
  onCloseMessage,
  onCloseProject,
  operationMessage,
  project,
  setActiveView
}: {
  activeView: ActiveView;
  children: ReactNode;
  onCloseMessage: () => void;
  onCloseProject: () => void;
  operationMessage: OperationMessage | null;
  project: ProjectSnapshot;
  setActiveView: (view: ActiveView) => void;
}) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">BU</span>
          <div>
            <strong>BlendUp</strong>
            <span>{project.project.name}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Navigation principale">
          {navigation.map((item) => (
            <button
              className={activeView === item.key ? "active" : ""}
              key={item.key}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
              {item.key === "problems" && project.problems.length > 0 ? (
                <b>{project.problems.length}</b>
              ) : null}
            </button>
          ))}
        </nav>

        <button className="close-project" onClick={onCloseProject} type="button">
          <ChevronLeft size={17} />
          Changer de projet
        </button>
      </aside>

      <section className="workspace">
        {operationMessage ? <OperationBanner message={operationMessage} onClose={onCloseMessage} /> : null}
        {children}
      </section>
    </main>
  );
}
