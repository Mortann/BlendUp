import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, Search, Upload } from "lucide-react";
import { useState } from "react";
import type { ProjectSnapshot } from "../blendup/types";
import { groupProblems } from "../blendup/problems";

export function ProblemsView({ checkingUvAssetIds, onCheckUv, exportingAssetIds, onExportAsset, onOpenAsset, snapshot }: {
  checkingUvAssetIds: string[];
  onCheckUv: (assetId: string) => Promise<boolean>;
  exportingAssetIds: string[];
  onExportAsset: (assetId: string) => Promise<boolean>;
  onOpenAsset: (assetId: string) => void;
  snapshot: ProjectSnapshot;
}) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const allGroups = groupProblems(snapshot.problems, snapshot.assets);
  const groups = groupProblems(snapshot.problems, snapshot.assets, { query, severity, category });
  const blocked = allGroups.filter((group) => group.severity === "error").length;
  return <div className="view-page problems-page">
    <header className="view-header"><div><span className="eyebrow">Diagnostic des assets</span><h1>Problèmes</h1><p>Les causes et les actions à effectuer, regroupées par asset.</p></div></header>
    {!snapshot.problems.length ? <section className="content-panel success-empty"><CheckCircle2 size={38} /><h2>Aucun problème détecté</h2><p>Tous les assets sont à jour.</p></section> : <>
      <div className="problem-overview"><strong>{blocked} {snapshot.project.engine === "none" ? "asset(s) à corriger" : "asset(s) avec un export bloqué"}</strong><span>{allGroups.length - blocked} à vérifier ou à exporter</span></div>
      <div className="problem-filters">
        <label className="search-field"><Search size={16} /><input aria-label="Rechercher un problème" placeholder="Asset, chemin ou cause…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Gravité" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">Toutes les gravités</option><option value="error">Erreurs</option><option value="warning">À vérifier</option><option value="info">Informations</option></select>
        <select aria-label="Type de problème" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Tous les types</option><option value="uv">UV</option><option value="export">Exports</option><option value="project">Projet</option></select>
      </div>
      <section className="problem-list">{groups.map((group) => {
        const assetId = group.asset?.id;
        const busy = Boolean(assetId && (exportingAssetIds.includes(assetId) || checkingUvAssetIds.includes(assetId)));
        const hasUvs = group.problems.some((problem) => problem.category === "uv" || problem.actionLabel === "Vérifier");
        const canExport = group.problems.some((problem) => problem.actionLabel === "Exporter");
        return <article className={`problem-card ${group.severity}`} key={group.id}>
          <header className="problem-card-header"><span className="problem-icon"><ProblemIcon severity={group.severity} /></span><div><h2>{group.asset?.name ?? "Configuration du projet"}</h2><code title={group.asset?.sourcePath}>{group.asset?.sourcePath ?? snapshot.project.name}</code></div><span className={`problem-severity ${group.severity}`}>{group.severity === "error" ? "À corriger" : group.severity === "warning" ? "À vérifier" : "Information"}</span></header>
          <div className="problem-issues">{group.problems.map((problem) => <div className="problem-issue" key={problem.id}>
            <div className="problem-issue-heading"><h3>{problem.title}</h3>{problem.versionLabel ? <span>{problem.versionLabel}</span> : null}{problem.score !== undefined ? <b className={`problem-score ${problem.severity}`}>{problem.score.toFixed(1)}/100 · minimum {problem.minimumScore}</b> : null}</div>
            <p>{problem.detail}</p>
            {problem.technicalDetails ? <details className="problem-details"><summary>Mesures et détails techniques</summary><pre>{problem.technicalDetails}</pre></details> : null}
          </div>)}</div>
          {assetId ? <footer className="problem-actions"><button className="ghost" onClick={() => onOpenAsset(assetId)} type="button">Voir l’asset</button>{hasUvs ? <button disabled={busy} onClick={() => void onCheckUv(assetId)} type="button">{checkingUvAssetIds.includes(assetId) ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />} Vérifier les UV</button> : null}{canExport ? <button className="primary" disabled={busy} onClick={() => void onExportAsset(assetId)} type="button">{exportingAssetIds.includes(assetId) ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Exporter</button> : null}</footer> : null}
        </article>;
      })}{!groups.length ? <div className="content-panel success-empty"><Info size={26} /><p>Aucun problème ne correspond aux filtres.</p></div> : null}</section>
    </>}
  </div>;
}

function ProblemIcon({ severity }: { severity: "info" | "warning" | "error" }) {
  return severity === "error" ? <AlertCircle size={21} /> : severity === "warning" ? <AlertTriangle size={21} /> : <Info size={21} />;
}
