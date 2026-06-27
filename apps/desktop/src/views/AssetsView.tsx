import { AlertTriangle, Boxes, CheckCircle2, FileSearch, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Role, RoleCapabilities } from "../blendup/roles";
import type { BlendUpAsset, BlendUpProblem } from "../blendup/types";
import { assetFolder } from "../app/metrics";
import { DetailMeta, EmptyState, Owner, PathLine, StatusPill } from "../app/ui";
import {
  formatAssetType,
  formatExportStatus,
  formatStatus,
  severityLabel
} from "../ui/format";

export function AssetsView({
  capabilities,
  exportingAssetId,
  filteredAssets,
  onExportAsset,
  problems,
  query,
  role,
  selectedAsset,
  selectedProblems,
  setQuery,
  setSelectedAssetId
}: {
  capabilities: RoleCapabilities;
  exportingAssetId: string | null;
  filteredAssets: BlendUpAsset[];
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
  query: string;
  role: Role;
  selectedAsset?: BlendUpAsset;
  selectedProblems: BlendUpProblem[];
  setQuery: (query: string) => void;
  setSelectedAssetId: (assetId: string) => void;
}) {
  const [folderFilter, setFolderFilter] = useState("all");
  const folders = useMemo(() => {
    return Array.from(new Set(filteredAssets.map(assetFolder))).sort((left, right) => left.localeCompare(right));
  }, [filteredAssets]);
  const visibleAssets = useMemo(() => {
    return folderFilter === "all"
      ? filteredAssets
      : filteredAssets.filter((asset) => assetFolder(asset) === folderFilter);
  }, [filteredAssets, folderFilter]);

  return (
    <section className={`assets-page role-page assets-page--${role}`} aria-label="Assets">
      <div className="asset-library-header">
        <div>
          <span className="eyebrow">{role === "artist" ? "Bibliotheque artiste" : "Inventaire technique"}</span>
          <h2>{role === "artist" ? "Assets par dossier" : "Assets en retrait"}</h2>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher"
            type="search"
          />
        </label>
      </div>

      <div className="folder-rail" aria-label="Dossiers assets">
        <button className={folderFilter === "all" ? "active" : ""} onClick={() => setFolderFilter("all")} type="button">
          Tous
        </button>
        {folders.map((folder) => (
          <button
            className={folderFilter === folder ? "active" : ""}
            key={folder}
            onClick={() => setFolderFilter(folder)}
            type="button"
          >
            {folder}
          </button>
        ))}
      </div>

      <div className={`asset-workspace ${selectedAsset ? "with-detail" : ""}`}>
        <section className={role === "artist" ? "asset-card-grid" : "asset-table-list"} aria-label="Liste assets">
          {visibleAssets.length > 0 ? (
            visibleAssets.map((asset) =>
              role === "artist" ? (
                <ArtistAssetCard
                  asset={asset}
                  isSelected={asset.id === selectedAsset?.id}
                  key={asset.id}
                  onSelect={() => setSelectedAssetId(asset.id)}
                  problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
                />
              ) : (
                <DeveloperAssetRow
                  asset={asset}
                  isSelected={asset.id === selectedAsset?.id}
                  key={asset.id}
                  onSelect={() => setSelectedAssetId(asset.id)}
                  problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
                />
              )
            )
          ) : (
            <EmptyState icon={<FileSearch size={28} />} label="Aucun asset dans ce dossier" />
          )}
        </section>

        {selectedAsset ? (
          role === "developer" ? (
            <DevAssetDetail
              asset={selectedAsset}
              capabilities={capabilities}
              isExporting={exportingAssetId === selectedAsset.id}
              onExportAsset={onExportAsset}
              problems={selectedProblems}
            />
          ) : (
            <ArtistAssetDetail
              asset={selectedAsset}
              capabilities={capabilities}
              isExporting={exportingAssetId === selectedAsset.id}
              onExportAsset={onExportAsset}
              problems={selectedProblems}
            />
          )
        ) : (
          <aside className="asset-detail-placeholder">
            <Boxes size={30} />
            <strong>Selectionne un asset</strong>
            <span>Les details restent caches tant que tu ne choisis rien.</span>
          </aside>
        )}
      </div>
    </section>
  );
}

function ArtistAssetCard({
  asset,
  isSelected,
  onSelect,
  problemCount
}: {
  asset: BlendUpAsset;
  isSelected: boolean;
  onSelect: () => void;
  problemCount: number;
}) {
  return (
    <button className={`artist-asset-card ${isSelected ? "selected" : ""}`} onClick={onSelect} type="button">
      <span className="asset-folder-label">{assetFolder(asset)}</span>
      <strong>{asset.displayName}</strong>
      <small>{formatAssetType(asset.type)}</small>
      <div>
        <StatusPill label={formatStatus(asset.status)} tone="blue" />
        {problemCount > 0 ? <span className="mini-warning">{problemCount}</span> : null}
      </div>
    </button>
  );
}

function DeveloperAssetRow({
  asset,
  isSelected,
  onSelect,
  problemCount
}: {
  asset: BlendUpAsset;
  isSelected: boolean;
  onSelect: () => void;
  problemCount: number;
}) {
  return (
    <button className={`developer-asset-row ${isSelected ? "selected" : ""}`} onClick={onSelect} type="button">
      <div>
        <strong>{asset.displayName}</strong>
        <span>{asset.id}</span>
      </div>
      <span>{asset.unity.importStatus.replace("_", " ")}</span>
      <span>{formatExportStatus(asset.export.lastExportStatus)}</span>
      <span>{problemCount}</span>
    </button>
  );
}

function AssetProblems({
  asset,
  capabilities,
  isExporting,
  onExportAsset,
  problems
}: {
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
}) {
  if (problems.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={24} />} label="Aucun probleme pour cet asset" />;
  }

  return (
    <div className="problem-list">
      {problems.map((problem) => (
        <div className={`problem-row ${problem.severity}`} key={problem.id}>
          <AlertTriangle size={16} />
          <div>
            <strong>{problem.title}</strong>
            <span>
              {severityLabel(problem.severity)} - {problem.detail}
            </span>
          </div>
          {problem.actionLabel ? (
            <ProblemActionButton
              asset={asset}
              exportAllowed={capabilities.canExport}
              isExporting={isExporting}
              onExportAsset={onExportAsset}
              problem={problem}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ArtistAssetDetail({
  asset,
  capabilities,
  isExporting,
  onExportAsset,
  problems
}: {
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
}) {
  const exported = asset.export.lastExportStatus === "success";

  return (
    <aside className="asset-focus-panel artist-detail-panel" aria-label="Detail asset artiste">
      <div className="detail-header">
        <div className="detail-thumbnail large">
          <Boxes size={34} />
        </div>
        <div>
          <span className="role-badge">{capabilities.orientationLabel}</span>
          <h2>{asset.displayName}</h2>
          <span className="eyebrow">{formatAssetType(asset.type)}</span>
        </div>
      </div>

      <div className="status-strip">
        <StatusPill label={formatStatus(asset.status)} tone="blue" />
        <StatusPill label={exported ? "Exporte" : "A exporter"} tone={exported ? "green" : "orange"} />
      </div>

      <div className="asset-action-bar">
        <button disabled={isExporting} onClick={() => onExportAsset(asset.id)} type="button">
          {isExporting ? "Export en cours" : "Exporter FBX"}
        </button>
        <button className="secondary" disabled title="A venir" type="button">
          Ouvrir dans Blender
        </button>
      </div>

      <div className="detail-sections airy">
        <section className="section-block">
          <h3>Notes artiste</h3>
          <p className="soft-text">{asset.notes.artist || "Aucune note artiste."}</p>
        </section>
        <section className="section-block">
          <h3>References</h3>
          <p className="soft-text">
            {asset.references.length > 0
              ? `${asset.references.length} reference(s) liee(s).`
              : "Aucune reference liee pour le moment."}
          </p>
        </section>
        <details className="detail-disclosure">
          <summary>Details fichier</summary>
          <PathLine label="Blender" value={asset.paths.blenderSource} />
          <PathLine label="FBX" value={asset.paths.fbxExport} />
        </details>
        <section className="section-block">
          <h3>A corriger</h3>
          <AssetProblems
            asset={asset}
            capabilities={capabilities}
            isExporting={isExporting}
            onExportAsset={onExportAsset}
            problems={problems}
          />
        </section>
      </div>
    </aside>
  );
}

function DevAssetDetail({
  asset,
  capabilities,
  isExporting,
  onExportAsset,
  problems
}: {
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
}) {
  return (
    <aside className="asset-focus-panel dev-detail-panel" aria-label="Detail asset dev">
      <div className="detail-header compact">
        <div className="detail-thumbnail small">
          <Boxes size={22} />
        </div>
        <div>
          <span className="role-badge">{capabilities.orientationLabel}</span>
          <h2>{asset.displayName}</h2>
          <span className="eyebrow">
            {formatAssetType(asset.type)} - {asset.id}
          </span>
        </div>
      </div>

      <div className="status-strip">
        <StatusPill label={formatStatus(asset.status)} tone="blue" />
        <StatusPill label={asset.unity.importStatus.replace("_", " ")} tone="orange" />
        <StatusPill label={`Export: ${formatExportStatus(asset.export.lastExportStatus)}`} tone="neutral" />
      </div>

      <div className="asset-action-bar wrap">
        {capabilities.canExport ? (
          <button disabled={isExporting} onClick={() => onExportAsset(asset.id)} type="button">
            Exporter FBX
          </button>
        ) : (
          <span className="action-hint">Export en vue Artiste</span>
        )}
        <button className="secondary" disabled title="A venir" type="button">
          Rebuild prefab
        </button>
        <button className="secondary" disabled title="A venir" type="button">
          Definir composants
        </button>
      </div>

      <div className="detail-sections">
        <section className="section-block">
          <h3>Unity</h3>
          <div className="problem-detail-meta">
            <DetailMeta label="Import" value={asset.unity.importStatus.replace("_", " ")} />
            <DetailMeta label="Dernier import" value={asset.unity.lastImportAt ?? "Jamais"} />
          </div>
          <PathLine label="Prefab" value={asset.paths.unityPrefab} />
        </section>

        <section className="section-block">
          <h3>Composants attendus</h3>
          <div className="component-list">
            {asset.unity.expectedComponents.length > 0 ? (
              asset.unity.expectedComponents.map((component) => (
                <div className="component-row" key={component.name}>
                  <CheckCircle2 size={16} />
                  <span>{component.name}</span>
                  <small>{component.requirement}</small>
                </div>
              ))
            ) : (
              <p className="soft-text">Aucun composant attendu defini.</p>
            )}
          </div>
        </section>

        <section className="section-block">
          <h3>Fichiers</h3>
          <PathLine label="Blender" value={asset.paths.blenderSource} />
          <PathLine label="FBX" value={asset.paths.fbxExport} />
          <PathLine label="Prefab" value={asset.paths.unityPrefab} />
        </section>

        <section className="section-block">
          <h3>Equipe</h3>
          <div className="owner-grid">
            <Owner label="Artiste" value={asset.owners.artist} />
            <Owner label="Dev" value={asset.owners.developer} />
            <Owner label="Review" value={asset.owners.reviewer} />
          </div>
        </section>

        <section className="section-block">
          <h3>Problems</h3>
          <AssetProblems
            asset={asset}
            capabilities={capabilities}
            isExporting={isExporting}
            onExportAsset={onExportAsset}
            problems={problems}
          />
        </section>
      </div>
    </aside>
  );
}

function ProblemActionButton({
  asset,
  exportAllowed,
  isExporting,
  onExportAsset,
  problem
}: {
  asset?: BlendUpAsset;
  exportAllowed: boolean;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problem: BlendUpProblem;
}) {
  const isExportAction = problem.actionLabel === "Exporter";
  const canExport = isExportAction && Boolean(asset) && exportAllowed;

  return (
    <button
      disabled={!canExport || isExporting}
      onClick={() => {
        if (asset && canExport) {
          onExportAsset(asset.id);
        }
      }}
      title={isExportAction && !exportAllowed ? "Export disponible en vue Artiste" : "Action pas encore disponible"}
      type="button"
    >
      {isExporting && canExport ? "Export" : problem.actionLabel}
    </button>
  );
}
