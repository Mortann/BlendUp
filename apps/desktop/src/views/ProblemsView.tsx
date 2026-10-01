import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, Upload } from "lucide-react";
import type { ProjectSnapshot } from "../blendup/types";

export function ProblemsView({
  checkingUvAssetIds,
  onCheckUv,
  exportingAssetIds,
  onExportAsset,
  onOpenAsset,
  snapshot
}: {
  checkingUvAssetIds: string[];
  onCheckUv: (assetId: string) => Promise<boolean>;
  exportingAssetIds: string[];
  onExportAsset: (assetId: string) => Promise<boolean>;
  onOpenAsset: (assetId: string) => void;
  snapshot: ProjectSnapshot;
}) {
  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <span className="eyebrow">Controle utile uniquement</span>
          <h1>Problemes</h1>
          <p>{snapshot.project.engine === "none" ? "Les problèmes de ta bibliothèque d'assets." : "BlendUp signale seulement ce qui bloque ou demande un nouvel export."}</p>
        </div>
      </header>

      {snapshot.problems.length === 0 ? (
        <section className="content-panel success-empty">
          <CheckCircle2 size={38} />
          <h2>{snapshot.project.engine === "none" ? "Aucun problème détecté" : "Tout est à jour"}</h2>
          <p>{snapshot.project.engine === "none" ? "Ta bibliothèque d'assets ne nécessite aucun export moteur." : `Aucun problème détecté dans le flux Art vers ${snapshot.project.engine === "godot" ? "Godot" : "Unity"}.`}</p>
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
                    {problem.actionLabel === "Vérifier" ? <button className="primary" disabled={exporting || checkingUvAssetIds.includes(problem.assetId)} onClick={() => void onCheckUv(problem.assetId!)} type="button">{checkingUvAssetIds.includes(problem.assetId) ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />} Vérifier les UV</button> : null}
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
