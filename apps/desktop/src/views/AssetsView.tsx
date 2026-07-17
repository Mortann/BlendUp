import {
  Box,
  CheckCircle2,
  ExternalLink,
  FileBox,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  TriangleAlert,
  Upload
} from "lucide-react";
import { useMemo, useState } from "react";
import type { BlendUpAsset, ProjectSnapshot } from "../blendup/types";

export function AssetsView({
  exportingAssetIds,
  onExportAll,
  onExportAsset,
  onOpenAsset,
  onOpenPath,
  onRefresh,
  selectedAssetId,
  setSelectedAssetId,
  snapshot
}: {
  exportingAssetIds: string[];
  onExportAll: () => void;
  onExportAsset: (assetId: string) => Promise<boolean>;
  onOpenAsset: (asset: BlendUpAsset) => void;
  onOpenPath: (path: string) => void;
  onRefresh: () => void;
  selectedAssetId: string | null;
  setSelectedAssetId: (assetId: string | null) => void;
  snapshot: ProjectSnapshot;
}) {
  const [query, setQuery] = useState("");
  const engineLabel = snapshot.project.engine === "godot" ? "Godot" : "Unity";
  const pendingCount = snapshot.assets.filter((asset) => asset.status !== "exported").length;
  const exportedCount = snapshot.assets.length - pendingCount;
  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return snapshot.assets;
    return snapshot.assets.filter((asset) =>
      `${asset.name} ${asset.folder} ${asset.sourcePath}`.toLowerCase().includes(normalized)
    );
  }, [query, snapshot.assets]);

  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <span className="eyebrow">{engineLabel} · export {snapshot.project.engine === "godot" ? "GLB" : "FBX"}</span>
          <h1>Assets</h1>
          <p>Chaque fichier Blender place dans Art devient automatiquement un asset exportable.</p>
        </div>
        <div className="button-row">
          <button className="ghost" onClick={() => onOpenPath(snapshot.project.paths.artRoot)} type="button">
            <FolderOpen size={16} /> Ouvrir Art
          </button>
          <button className="ghost" onClick={() => onOpenPath(snapshot.project.paths.engineAssetsRoot)} type="button">
            <ExternalLink size={16} /> Ouvrir Assets
          </button>
          <button className="ghost" onClick={onRefresh} type="button"><RefreshCw size={16} /> Actualiser</button>
          <button className="primary" disabled={pendingCount === 0 || exportingAssetIds.length > 0} onClick={onExportAll} type="button">
            {exportingAssetIds.length > 0 ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
            Exporter {pendingCount > 0 ? `(${pendingCount})` : ""}
          </button>
        </div>
      </header>

      <section className="summary-grid" aria-label="Resume des assets">
        <div><FileBox size={18} /><span>Fichiers Blender</span><strong>{snapshot.assets.length}</strong></div>
        <div><CheckCircle2 size={18} /><span>A jour</span><strong>{exportedCount}</strong></div>
        <div><TriangleAlert size={18} /><span>A exporter</span><strong>{pendingCount}</strong></div>
      </section>

      <section className="content-panel asset-panel">
        <div className="asset-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un asset…" value={query} />
          </label>
          <span>{visibleAssets.length} asset{visibleAssets.length > 1 ? "s" : ""}</span>
        </div>

        {visibleAssets.length > 0 ? (
          <div className="asset-list">
            <div className="asset-list-head">
              <span>Asset</span><span>Source</span><span>Destination</span><span>Etat</span><span>Actions</span>
            </div>
            {visibleAssets.map((asset) => {
              const exporting = exportingAssetIds.includes(asset.id);
              return (
                <article
                  className={`asset-row ${selectedAssetId === asset.id ? "selected" : ""}`}
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                >
                  <div className="asset-name-cell">
                    <span className="asset-icon"><Box size={19} /></span>
                    <div><strong>{asset.name}</strong><span>{asset.folder || "Art"}</span></div>
                  </div>
                  <code title={asset.sourcePath}>{asset.sourcePath}</code>
                  <code title={asset.outputPath}>{asset.outputPath}</code>
                  <Status status={asset.status} />
                  <div className="row-actions">
                    <button onClick={(event) => { event.stopPropagation(); onOpenAsset(asset); }} type="button">Blender</button>
                    <button
                      className="primary small"
                      disabled={exporting}
                      onClick={(event) => { event.stopPropagation(); void onExportAsset(asset.id); }}
                      type="button"
                    >
                      {exporting ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}
                      {asset.status === "exported" ? "Reexporter" : "Exporter"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <FileBox size={34} />
            <h2>{query ? "Aucun resultat" : "Aucun fichier Blender"}</h2>
            <p>{query ? "Essaie une autre recherche." : `Ajoute un fichier .blend dans ${snapshot.project.paths.artRoot}.`}</p>
            {!query ? <button onClick={() => onOpenPath(snapshot.project.paths.artRoot)} type="button"><FolderOpen size={16} /> Ouvrir Art</button> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function Status({ status }: { status: BlendUpAsset["status"] }) {
  const labels = {
    error: "Erreur",
    exported: "A jour",
    outdated: "A reexporter",
    ready: "Pret"
  } as const;
  return <span className={`asset-status ${status}`}>{labels[status]}</span>;
}
