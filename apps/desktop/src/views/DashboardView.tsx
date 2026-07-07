import { AlertTriangle, Boxes, Layers3 } from "lucide-react";
import type { BlendUpAsset, BlendUpTask, ProjectSnapshot } from "../blendup/types";
import { recentAssets } from "../app/metrics";
import { formatStatus, formatTaskPriority, formatTaskStatus } from "../ui/format";

export function DashboardView({
  onOpenAsset,
  onOpenAssets,
  onOpenProblems,
  onOpenReferences,
  onOpenTasks,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  onOpenAssets: () => void;
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
              <RecentAssetButton asset={asset} key={asset.id} onOpenAsset={onOpenAsset} />
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
          <span className="eyebrow">Validation</span>
          <h2>Alertes</h2>
          <p className="soft-text">{blockingProblems} probleme(s) bloquant(s) a verifier avant validation.</p>
          <div className="settings-actions">
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

function RecentAssetButton({
  asset,
  onOpenAsset
}: {
  asset: BlendUpAsset;
  onOpenAsset: (assetId?: string) => void;
}) {
  return (
    <button className="recent-asset-card" onClick={() => onOpenAsset(asset.id)} type="button">
      <span>{asset.type.replace("_", " ")}</span>
      <strong>{asset.displayName}</strong>
      <small>{formatStatus(asset.status)}</small>
    </button>
  );
}

function TaskPreview({ task }: { task: BlendUpTask }) {
  return (
    <div className="task-preview">
      <strong>{task.title}</strong>
      <span>
        {formatTaskStatus(task.status)} - {formatTaskPriority(task.priority)}
      </span>
    </div>
  );
}
