import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, Upload } from "lucide-react";
import type { ProjectSnapshot } from "../blendup/types";

export function ProblemsView({
  exportingAssetIds,
  onExportAsset,
  onOpenAsset,
  snapshot
}: {
  exportingAssetIds: string[];
  onExportAsset: (assetId: string) => Promise<boolean>;
  onOpenAsset: (assetId: string) => void;
  snapshot: ProjectSnapshot;
}) {
  return (
    <div className="view-page narrow">
      <header className="view-header">
        <div>
          <span className="eyebrow">Controle utile uniquement</span>
          <h1>Problemes</h1>
          <p>BlendUp signale seulement ce qui bloque ou demande un nouvel export.</p>
        </div>
      </header>

      {snapshot.problems.length === 0 ? (
        <section className="content-panel success-empty">
          <CheckCircle2 size={38} />
          <h2>Tout est a jour</h2>
          <p>Aucun probleme detecte dans le flux Art vers {snapshot.project.engine === "godot" ? "Godot" : "Unity"}.</p>
        </section>
      ) : (
        <section className="problem-list">
          {snapshot.problems.map((problem) => {
            const exporting = problem.assetId ? exportingAssetIds.includes(problem.assetId) : false;
            return (
              <article className={`problem-card ${problem.severity}`} key={problem.id}>
                <span className="problem-icon"><ProblemIcon severity={problem.severity} /></span>
                <div>
                  <span className="problem-source">{problem.source}</span>
                  <h2>{problem.title}</h2>
                  <p>{problem.detail}</p>
                </div>
                {problem.assetId ? (
                  <div className="problem-actions">
                    <button className="ghost" onClick={() => onOpenAsset(problem.assetId!)} type="button">Voir l'asset</button>
                    {problem.actionLabel === "Exporter" ? (
                      <button className="primary" disabled={exporting} onClick={() => void onExportAsset(problem.assetId!)} type="button">
                        {exporting ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Exporter
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function ProblemIcon({ severity }: { severity: "info" | "warning" | "error" }) {
  if (severity === "error") return <AlertCircle size={21} />;
  if (severity === "warning") return <AlertTriangle size={21} />;
  return <Info size={21} />;
}
