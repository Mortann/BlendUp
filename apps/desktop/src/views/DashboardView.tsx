import { AlertTriangle, Boxes, ClipboardList, GitBranch, Layers3 } from "lucide-react";
import type { Role } from "../blendup/roles";
import type { BlendUpAsset, BlendUpTask, ProjectSnapshot } from "../blendup/types";
import { recentAssets } from "../app/metrics";
import { formatStatus, formatTaskPriority, formatTaskStatus } from "../ui/format";

export function DashboardView({
  onOpenAsset,
  onOpenAssets,
  onOpenGit,
  onOpenProblems,
  onOpenReferences,
  onOpenTasks,
  role,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  onOpenAssets: () => void;
  onOpenGit: () => void;
  onOpenProblems: () => void;
  onOpenReferences: () => void;
  onOpenTasks: () => void;
  role: Role;
  snapshot: ProjectSnapshot;
}) {
  return role === "developer" ? (
    <DeveloperDashboard
      onOpenAssets={onOpenAssets}
      onOpenGit={onOpenGit}
      onOpenProblems={onOpenProblems}
      onOpenTasks={onOpenTasks}
      snapshot={snapshot}
    />
  ) : (
    <ArtistDashboard
      onOpenAsset={onOpenAsset}
      onOpenAssets={onOpenAssets}
      onOpenGit={onOpenGit}
      onOpenProblems={onOpenProblems}
      onOpenReferences={onOpenReferences}
      onOpenTasks={onOpenTasks}
      snapshot={snapshot}
    />
  );
}

function ArtistDashboard({
  onOpenAsset,
  onOpenAssets,
  onOpenGit,
  onOpenProblems,
  onOpenReferences,
  onOpenTasks,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  onOpenAssets: () => void;
  onOpenGit: () => void;
  onOpenProblems: () => void;
  onOpenReferences: () => void;
  onOpenTasks: () => void;
  snapshot: ProjectSnapshot;
}) {
  const openTasks = snapshot.tasks.filter((task) => task.status !== "done").slice(0, 4);
  const recentlyTouched = recentAssets(snapshot, 4);
  const blockingProblems = snapshot.problems.filter(
    (problem) => problem.severity === "critical" || problem.severity === "error"
  ).length;

  return (
    <section className="dashboard-page role-page artist-home" aria-label="Dashboard artiste">
      <div className="dashboard-hero">
        <div>
          <span className="eyebrow">Aujourd'hui</span>
          <h2>{openTasks[0]?.title ?? "Rien de bloque"}</h2>
          <p>{openTasks[0]?.description ?? "Tu peux reprendre un asset recent ou organiser les references."}</p>
        </div>
        <div className="hero-actions">
          <button onClick={onOpenAssets} type="button">
            <Boxes size={16} />
            Assets
          </button>
          <button className="secondary" onClick={onOpenReferences} type="button">
            <Layers3 size={16} />
            References
          </button>
        </div>
      </div>

      <div className="artist-dashboard-grid">
        <section className="surface-panel emphasis-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">A faire</span>
              <h2>Taches artiste</h2>
            </div>
            <button className="ghost-button" onClick={onOpenTasks} type="button">
              Tout voir
            </button>
          </div>
          <div className="task-card-list">
            {openTasks.length > 0 ? (
              openTasks.map((task) => <TaskPreview key={task.id} task={task} />)
            ) : (
              <p className="soft-text">Aucune tache ouverte.</p>
            )}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Reprise rapide</span>
              <h2>Derniers assets</h2>
            </div>
            <button className="ghost-button" onClick={onOpenAssets} type="button">
              Bibliotheque
            </button>
          </div>
          <div className="recent-asset-grid">
            {recentlyTouched.map((asset) => (
              <button className="recent-asset-card" key={asset.id} onClick={() => onOpenAsset(asset.id)} type="button">
                <span>{asset.type.replace("_", " ")}</span>
                <strong>{asset.displayName}</strong>
                <small>{formatStatus(asset.status)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <span className="eyebrow">References</span>
          <h2>Direction visuelle</h2>
          <p className="soft-text">Regroupe les boards, refs globales et refs liees aux assets.</p>
          <div className="settings-actions">
            <button onClick={onOpenReferences} type="button">
              <Layers3 size={16} />
              Ouvrir
            </button>
          </div>
        </section>

        <section className="surface-panel quiet-panel">
          <span className="eyebrow">Suivi</span>
          <h2>Git et alertes</h2>
          <p className="soft-text">
            {snapshot.gitStatus.message} · {blockingProblems} probleme(s) bloquant(s)
          </p>
          <div className="settings-actions">
            <button className="secondary" onClick={onOpenGit} type="button">
              <GitBranch size={16} />
              Git
            </button>
            <button className="secondary" onClick={onOpenProblems} type="button">
              <AlertTriangle size={16} />
              Problems
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function DeveloperDashboard({
  onOpenAssets,
  onOpenGit,
  onOpenProblems,
  onOpenTasks,
  snapshot
}: {
  onOpenAssets: () => void;
  onOpenGit: () => void;
  onOpenProblems: () => void;
  onOpenTasks: () => void;
  snapshot: ProjectSnapshot;
}) {
  const openTasks = snapshot.tasks.filter((task) => task.status !== "done").slice(0, 5);
  const errors = snapshot.problems.filter((problem) => problem.severity === "critical" || problem.severity === "error");
  const importedAssets = snapshot.assets.filter((asset) => asset.unity.importStatus === "imported").length;

  return (
    <section className="dashboard-page role-page developer-home" aria-label="Dashboard dev">
      <div className="dev-overview-grid">
        <MetricPanel label="Problems" value={String(snapshot.problems.length)} detail={`${errors.length} bloquant(s)`} />
        <MetricPanel label="Tasks" value={String(openTasks.length)} detail="ouvertes" />
        <MetricPanel label="Git" value={snapshot.gitStatus.branch ?? "-"} detail={snapshot.gitStatus.message} />
        <MetricPanel label="Unity" value={String(importedAssets)} detail="assets importes" />
      </div>

      <div className="developer-dashboard-grid">
        <section className="surface-panel emphasis-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Priorite</span>
              <h2>Problems</h2>
            </div>
            <button className="ghost-button" onClick={onOpenProblems} type="button">
              Tout voir
            </button>
          </div>
          <div className="technical-list">
            {errors.length > 0 ? (
              errors.slice(0, 5).map((problem) => (
                <button className="technical-row" key={problem.id} onClick={onOpenProblems} type="button">
                  <span className={`severity-dot ${problem.severity}`} />
                  <strong>{problem.title}</strong>
                  <small>{problem.source}</small>
                </button>
              ))
            ) : (
              <p className="soft-text">Aucun probleme bloquant.</p>
            )}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Execution</span>
              <h2>Taches</h2>
            </div>
            <button className="ghost-button" onClick={onOpenTasks} type="button">
              Tasks
            </button>
          </div>
          <div className="task-card-list dense">
            {openTasks.map((task) => <TaskPreview key={task.id} task={task} />)}
          </div>
        </section>

        <section className="surface-panel">
          <span className="eyebrow">Git</span>
          <h2>{snapshot.gitStatus.branch ?? "Depot non detecte"}</h2>
          <p className="soft-text">{snapshot.gitStatus.message}</p>
          <div className="settings-actions">
            <button onClick={onOpenGit} type="button">
              <GitBranch size={16} />
              Ouvrir Git
            </button>
          </div>
        </section>

        <section className="surface-panel quiet-panel">
          <span className="eyebrow">Secondaire</span>
          <h2>Assets</h2>
          <p className="soft-text">{snapshot.assets.length} asset(s) suivis. Section en retrait pour la vue dev.</p>
          <button className="secondary compact-action" onClick={onOpenAssets} type="button">
            Voir les assets
          </button>
        </section>
      </div>
    </section>
  );
}

function MetricPanel({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="metric-panel">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function TaskPreview({ task }: { task: BlendUpTask }) {
  return (
    <div className="task-preview">
      <strong>{task.title}</strong>
      <span>
        {formatTaskStatus(task.status)} · {formatTaskPriority(task.priority)}
      </span>
    </div>
  );
}
