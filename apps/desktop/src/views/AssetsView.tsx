import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Folder,
  Grid2X2,
  History,
  ImageIcon,
  List,
  Pencil,
  Search,
  Star,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Role, RoleCapabilities } from "../blendup/roles";
import type { AssetStatus, BlendUpAsset, BlendUpProblem, ProjectSnapshot } from "../blendup/types";
import { assetFolder } from "../app/metrics";
import { loadActiveMemberId, loadTeamMembers, type TeamMember } from "../app/people";
import { DetailMeta, EmptyState, Owner, PathLine, StatusPill } from "../app/ui";
import {
  formatAssetType,
  formatExportStatus,
  formatStatus,
  severityLabel
} from "../ui/format";

type AssetSortMode = "name" | "recent" | "status";
type AssetDisplayMode = "grid" | "list" | "compact";
type AssetQuickFilter = "all" | "favorites" | "review" | "needs_art_fix";

const artistStatuses: { label: string; status: AssetStatus }[] = [
  { label: "A faire", status: "todo" },
  { label: "En cours", status: "in_progress" },
  { label: "A valider", status: "review" },
  { label: "A retravailler", status: "needs_art_fix" },
  { label: "Valide", status: "validated" }
];

export function AssetsView({
  capabilities,
  exportingAssetId,
  filteredAssets,
  onChangeAssetStatus,
  onExportAsset,
  onOpenInBlender,
  problems,
  query,
  role,
  selectedAsset,
  selectedProblems,
  setQuery,
  setSelectedAssetId,
  snapshot
}: {
  capabilities: RoleCapabilities;
  exportingAssetId: string | null;
  filteredAssets: BlendUpAsset[];
  onChangeAssetStatus: (assetId: string, status: AssetStatus, actor: string) => void;
  onExportAsset: (assetId: string) => void;
  onOpenInBlender: (assetId: string) => void;
  problems: BlendUpProblem[];
  query: string;
  role: Role;
  selectedAsset?: BlendUpAsset;
  selectedProblems: BlendUpProblem[];
  setQuery: (query: string) => void;
  setSelectedAssetId: (assetId: string) => void;
  snapshot: ProjectSnapshot;
}) {
  const [folderFilter, setFolderFilter] = useState("all");
  const [sortMode, setSortMode] = useState<AssetSortMode>("recent");
  const [displayMode, setDisplayMode] = useState<AssetDisplayMode>("grid");
  const projectId = snapshot.project.projectId;
  const defaultExplorerPath = normalizeFolderPath(snapshot.project.paths.blenderRoot);
  const [currentPath, setCurrentPath] = useState(() => loadAssetExplorerPath(projectId) ?? defaultExplorerPath);
  const [quickFilter, setQuickFilter] = useState<AssetQuickFilter>("all");
  const [favoriteAssetIds, setFavoriteAssetIds] = useState<string[]>(() => loadAssetFavorites(projectId));
  const activeMember = useMemo(() => getActiveMember(projectId), [projectId]);

  useEffect(() => {
    setCurrentPath(loadAssetExplorerPath(projectId) ?? defaultExplorerPath);
    setFavoriteAssetIds(loadAssetFavorites(projectId));
    setQuickFilter("all");
  }, [defaultExplorerPath, projectId]);

  useEffect(() => {
    saveAssetExplorerPath(projectId, currentPath);
  }, [currentPath, projectId]);

  useEffect(() => {
    saveAssetFavorites(projectId, favoriteAssetIds);
  }, [favoriteAssetIds, projectId]);

  const folders = useMemo(() => {
    return Array.from(new Set(filteredAssets.map(assetFolder))).sort((left, right) => left.localeCompare(right));
  }, [filteredAssets]);
  const visibleAssets = useMemo(() => {
    const assets =
      role === "artist"
        ? filterArtistAssets(filteredAssets, currentPath, quickFilter, favoriteAssetIds)
        : folderFilter === "all"
          ? filteredAssets
          : filteredAssets.filter((asset) => assetFolder(asset) === folderFilter);

    return [...assets].sort((left, right) => {
      if (sortMode === "recent") {
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      }

      if (sortMode === "status") {
        return left.status.localeCompare(right.status) || left.displayName.localeCompare(right.displayName);
      }

      return left.displayName.localeCompare(right.displayName);
    });
  }, [currentPath, favoriteAssetIds, filteredAssets, folderFilter, quickFilter, role, sortMode]);
  const childFolders = useMemo(
    () => foldersForPath(filteredAssets, currentPath),
    [currentPath, filteredAssets]
  );
  const currentFolderLabel = currentPath || "Assets";
  const favoriteAssets = filteredAssets.filter((asset) => favoriteAssetIds.includes(asset.id));
  const reviewCount = filteredAssets.filter((asset) => normalizeArtistStatus(asset.status) === "review").length;
  const reworkCount = filteredAssets.filter((asset) => normalizeArtistStatus(asset.status) === "needs_art_fix").length;
  const toggleFavorite = (assetId: string) => {
    setFavoriteAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [assetId, ...current]
    );
  };

  return (
    <section className={`assets-page role-page assets-page--${role}`} aria-label="Assets">
      <div className="asset-library-header">
        <div>
          <span className="eyebrow">{role === "artist" ? "Bibliotheque artiste" : "Inventaire technique"}</span>
          <h2>{role === "artist" ? "Assets" : "Assets projet"}</h2>
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

      {role === "artist" ? (
        <div className="artist-asset-explorer">
          <aside className="asset-shortcuts-panel" aria-label="Acces rapides assets">
            <div className="asset-shortcut-group">
              <span className="eyebrow">General</span>
              <button
                className={quickFilter === "all" ? "active" : ""}
                onClick={() => setQuickFilter("all")}
                type="button"
              >
                <Folder size={16} />
                <span>Dossier courant</span>
              </button>
              <button
                className={quickFilter === "review" ? "active" : ""}
                onClick={() => setQuickFilter("review")}
                type="button"
              >
                <CheckCircle2 size={16} />
                <span>A valider</span>
                <strong>{reviewCount}</strong>
              </button>
              <button
                className={quickFilter === "needs_art_fix" ? "active" : ""}
                onClick={() => setQuickFilter("needs_art_fix")}
                type="button"
              >
                <AlertTriangle size={16} />
                <span>A retravailler</span>
                <strong>{reworkCount}</strong>
              </button>
            </div>
            <div className="asset-shortcut-group">
              <span className="eyebrow">Favoris</span>
              <button
                className={quickFilter === "favorites" ? "active" : ""}
                onClick={() => setQuickFilter("favorites")}
                type="button"
              >
                <Star size={16} />
                <span>Tous les favoris</span>
                <strong>{favoriteAssets.length}</strong>
              </button>
              {favoriteAssets.slice(0, 5).map((asset) => (
                <button key={asset.id} onClick={() => setSelectedAssetId(asset.id)} type="button">
                  <AssetVisual asset={asset} small />
                  <span>{asset.displayName}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="asset-explorer-main">
            <div className="asset-breadcrumb" aria-label="Emplacement asset">
              {breadcrumbParts(currentPath).map((part, index, parts) => (
                <button
                  key={part.path || "root"}
                  className={index === parts.length - 1 ? "active" : ""}
                  onClick={() => {
                    setCurrentPath(part.path);
                    setQuickFilter("all");
                  }}
                  type="button"
                >
                  {part.label}
                  {index < parts.length - 1 ? <ChevronRight size={14} /> : null}
                </button>
              ))}
            </div>

            <section className="folder-child-grid" aria-label="Dossiers enfants">
              {quickFilter === "all"
                ? childFolders.map((folder) => (
                    <button
                      className="folder-tile"
                      key={folder.path}
                      onClick={() => setCurrentPath(folder.path)}
                      type="button"
                    >
                      <Folder size={24} />
                      <strong>{folder.name}</strong>
                      <span>{folder.assetCount} asset(s)</span>
                    </button>
                  ))
                : null}
            </section>

            <section className={`asset-card-grid display-${displayMode}`} aria-label={`Assets ${currentFolderLabel}`}>
              {visibleAssets.length > 0 ? (
                visibleAssets.map((asset) => (
                  <ArtistAssetCard
                    asset={asset}
                    displayMode={displayMode}
                    isFavorite={favoriteAssetIds.includes(asset.id)}
                    isSelected={asset.id === selectedAsset?.id}
                    key={asset.id}
                    onSelect={() => setSelectedAssetId(asset.id)}
                    onToggleFavorite={() => toggleFavorite(asset.id)}
                    problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
                  />
                ))
              ) : (
                <EmptyState icon={<FileSearch size={28} />} label="Aucun asset ici" />
              )}
            </section>
          </div>
        </div>
      ) : (
        <>
      <div className="asset-tools-row">
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
        <div className="asset-view-controls">
          <label className="select-control">
            <ArrowUpDown size={15} />
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as AssetSortMode)}>
              <option value="recent">Recents</option>
              <option value="name">Nom</option>
              <option value="status">Statut</option>
            </select>
          </label>
          <button
            className={displayMode === "grid" ? "compact-action active" : "compact-action"}
            onClick={() => setDisplayMode("grid")}
            title="Grille"
            type="button"
          >
            <Grid2X2 size={16} />
          </button>
          <button
            className={displayMode === "list" ? "compact-action active" : "compact-action"}
            onClick={() => setDisplayMode("list")}
            title="Liste"
            type="button"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      <div className="asset-workspace">
        <section className={`asset-table-list display-${displayMode}`} aria-label="Liste assets">
          {visibleAssets.length > 0 ? (
            visibleAssets.map((asset) => (
              <DeveloperAssetRow
                asset={asset}
                isSelected={asset.id === selectedAsset?.id}
                key={asset.id}
                onSelect={() => setSelectedAssetId(asset.id)}
                problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
              />
            ))
          ) : (
            <EmptyState icon={<FileSearch size={28} />} label="Aucun asset dans ce dossier" />
          )}
        </section>

        {role === "developer" && selectedAsset ? (
          <DevAssetDetail
            asset={selectedAsset}
            capabilities={capabilities}
            isExporting={exportingAssetId === selectedAsset.id}
            onExportAsset={onExportAsset}
            problems={selectedProblems}
          />
        ) : null}
      </div>
        </>
      )}

      {role === "artist" && selectedAsset ? (
        <div className="asset-overlay" role="dialog" aria-modal="true" aria-label="Detail asset artiste">
          <ArtistAssetDetail
            activeMember={activeMember}
            asset={selectedAsset}
            capabilities={capabilities}
            isFavorite={favoriteAssetIds.includes(selectedAsset.id)}
            onChangeStatus={(status) => onChangeAssetStatus(selectedAsset.id, status, activeMember?.name ?? "BlendUp")}
            onClose={() => setSelectedAssetId("")}
            onOpenInBlender={() => onOpenInBlender(selectedAsset.id)}
            onToggleFavorite={() => toggleFavorite(selectedAsset.id)}
            problems={selectedProblems}
          />
        </div>
      ) : null}
    </section>
  );
}

function ArtistAssetCard({
  asset,
  displayMode,
  isFavorite,
  isSelected,
  onSelect,
  onToggleFavorite,
  problemCount
}: {
  asset: BlendUpAsset;
  displayMode: AssetDisplayMode;
  isFavorite: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  problemCount: number;
}) {
  return (
    <article className={`artist-asset-card ${displayMode} ${isSelected ? "selected" : ""}`}>
      <button className="asset-favorite-button" onClick={onToggleFavorite} title="Favori" type="button">
        <Star fill={isFavorite ? "currentColor" : "none"} size={16} />
      </button>
      <button className="artist-asset-card-main" onClick={onSelect} type="button">
        <AssetVisual asset={asset} />
        <span className="asset-folder-label">{assetDirectory(asset)}</span>
        <strong>{asset.displayName}</strong>
        <small>{formatAssetType(asset.type)}</small>
        <div className="asset-card-footer">
          <StatusPill label={formatStatus(normalizeArtistStatus(asset.status))} tone="blue" />
          <span>{asset.owners.artist ?? "Non assigne"}</span>
          {problemCount > 0 ? <span className="mini-warning">{problemCount}</span> : null}
        </div>
      </button>
    </article>
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
  problems,
  showActions = true
}: {
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
  showActions?: boolean;
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
          {showActions && problem.actionLabel ? (
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
  activeMember,
  asset,
  capabilities,
  isFavorite,
  onChangeStatus,
  onClose,
  onOpenInBlender,
  onToggleFavorite,
  problems
}: {
  activeMember?: TeamMember;
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isFavorite: boolean;
  onChangeStatus: (status: AssetStatus) => void;
  onClose: () => void;
  onOpenInBlender: () => void;
  onToggleFavorite: () => void;
  problems: BlendUpProblem[];
}) {
  const exported = asset.export.lastExportStatus === "success";
  const artistStatus = normalizeArtistStatus(asset.status);
  const isArtDirector = activeMember?.roles.includes("art_director") ?? false;
  const canEditStatus = isArtDirector || isAssociatedMember(activeMember, asset);

  return (
    <aside className="asset-focus-panel artist-detail-panel floating" aria-label="Detail asset artiste">
      <button className="icon-button close-button" onClick={onClose} title="Fermer" type="button">
        <X size={18} />
      </button>

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
        <StatusPill label={formatStatus(artistStatus)} tone="blue" />
        <StatusPill label={exported ? "Exporte" : "A exporter depuis Blender"} tone={exported ? "green" : "orange"} />
      </div>

      <section className="asset-status-panel">
        <div>
          <span className="eyebrow">Etat artiste</span>
          <p className="soft-text">
            {isArtDirector
              ? "Tu peux valider l'asset."
              : canEditStatus
                ? "Tu peux faire avancer l'asset jusqu'a la demande de validation."
                : "Statut modifiable par les personnes associees a l'asset."}
          </p>
        </div>
        <div className="asset-status-actions" aria-label="Changer le statut artiste">
          {artistStatuses.map((option) => {
            const disabled =
              option.status === artistStatus ||
              !canEditStatus ||
              (option.status === "validated" && !isArtDirector);

            return (
              <button
                className={option.status === artistStatus ? "active" : ""}
                disabled={disabled}
                key={option.status}
                onClick={() => onChangeStatus(option.status)}
                type="button"
              >
                {option.status === artistStatus ? <Check size={14} /> : null}
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="asset-action-bar">
        <button disabled={!asset.paths.blenderSource} onClick={onOpenInBlender} type="button">
          <ExternalLink size={16} />
          Ouvrir dans Blender
        </button>
        <button className="secondary" onClick={onToggleFavorite} type="button">
          <Star fill={isFavorite ? "currentColor" : "none"} size={16} />
          Favori
        </button>
        <button className="secondary" type="button">
          <Pencil size={16} />
          Modifier
        </button>
        <button className="secondary danger" type="button">
          <Trash2 size={16} />
          Supprimer
        </button>
      </div>

      <div className="detail-sections airy">
        <section className="section-block">
          <h3>Notes artiste</h3>
          <p className="soft-text">{asset.notes.artist || "Aucune note artiste."}</p>
        </section>
        <section className="section-block">
          <h3>References liees</h3>
          <p className="soft-text">
            {asset.references.length > 0
              ? `${asset.references.length} reference(s) liee(s). PureRef pourra les ouvrir depuis ici.`
              : "Aucune reference liee pour le moment."}
          </p>
        </section>
        <section className="section-block">
          <h3>Historique</h3>
          <div className="history-list">
            <div>
              <History size={15} />
              <span>Derniere modification</span>
              <strong>{asset.updatedAt}</strong>
            </div>
            <div>
              <History size={15} />
              <span>Dernier export</span>
              <strong>{asset.export.lastExportAt ?? "Jamais"}</strong>
            </div>
          </div>
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
            isExporting={false}
            onExportAsset={() => undefined}
            problems={problems}
            showActions={false}
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
          <span className="action-hint">Export depuis Blender / vue Artiste</span>
        )}
        <button className="secondary" type="button">
          Rebuild prefab
        </button>
        <button className="secondary" type="button">
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
          <h3>Historique</h3>
          <div className="history-list">
            <div>
              <History size={15} />
              <span>Modifie</span>
              <strong>{asset.updatedAt}</strong>
            </div>
            <div>
              <History size={15} />
              <span>Export</span>
              <strong>{asset.export.lastExportAt ?? "Jamais"}</strong>
            </div>
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

function AssetVisual({ asset, small = false }: { asset: BlendUpAsset; small?: boolean }) {
  const thumbnail = asset.paths.thumbnail;

  if (thumbnail && isRenderableThumbnail(thumbnail)) {
    return (
      <span className={`asset-visual ${small ? "small" : ""}`}>
        <img alt="" src={thumbnail} />
      </span>
    );
  }

  return (
    <span className={`asset-visual ${small ? "small" : ""} type-${asset.type}`}>
      {asset.type === "texture" || asset.type === "ui_image" ? <ImageIcon size={small ? 14 : 28} /> : <Boxes size={small ? 14 : 28} />}
    </span>
  );
}

function breadcrumbParts(path: string) {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean);
  const crumbs = [{ label: "Assets", path: "" }];
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  }

  return crumbs;
}

function foldersForPath(assets: BlendUpAsset[], path: string) {
  const normalizedPath = normalizeFolderPath(path);
  const folders = new Map<string, { name: string; path: string; assetCount: number }>();

  for (const asset of assets) {
    const directory = assetDirectory(asset);
    const isInCurrentBranch =
      normalizedPath === "" || directory === normalizedPath || directory.startsWith(`${normalizedPath}/`);

    if (!isInCurrentBranch || directory === normalizedPath) {
      continue;
    }

    const relative = normalizedPath === "" ? directory : directory.slice(normalizedPath.length + 1);
    const childName = relative.split("/").filter(Boolean)[0];

    if (!childName) {
      continue;
    }

    const childPath = normalizedPath ? `${normalizedPath}/${childName}` : childName;
    const existing = folders.get(childPath);

    if (existing) {
      existing.assetCount += 1;
    } else {
      folders.set(childPath, { name: childName, path: childPath, assetCount: 1 });
    }
  }

  return Array.from(folders.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function filterArtistAssets(
  assets: BlendUpAsset[],
  currentPath: string,
  quickFilter: AssetQuickFilter,
  favoriteAssetIds: string[]
) {
  if (quickFilter === "favorites") {
    return assets.filter((asset) => favoriteAssetIds.includes(asset.id));
  }

  if (quickFilter === "review") {
    return assets.filter((asset) => normalizeArtistStatus(asset.status) === "review");
  }

  if (quickFilter === "needs_art_fix") {
    return assets.filter((asset) => normalizeArtistStatus(asset.status) === "needs_art_fix");
  }

  const normalizedPath = normalizeFolderPath(currentPath);

  return assets.filter((asset) => assetDirectory(asset) === normalizedPath);
}

function assetDirectory(asset: BlendUpAsset) {
  const preferredPath = asset.paths.blenderSource ?? asset.paths.fbxExport ?? asset.paths.unityPrefab ?? "";
  const parts = normalizeFolderPath(preferredPath).split("/").filter(Boolean);

  parts.pop();

  return parts.join("/");
}

function normalizeArtistStatus(status: AssetStatus): AssetStatus {
  if (artistStatuses.some((option) => option.status === status)) {
    return status;
  }

  if (status === "needs_dev_fix") {
    return "needs_art_fix";
  }

  if (status === "ready_for_export" || status === "exported" || status === "unity_imported") {
    return "review";
  }

  if (status === "archived") {
    return "validated";
  }

  return "todo";
}

function isAssociatedMember(member: TeamMember | undefined, asset: BlendUpAsset) {
  if (!member) {
    return false;
  }

  const owners = [asset.owners.artist, asset.owners.developer, asset.owners.reviewer].filter(Boolean);

  if (owners.length === 0) {
    return member.roles.includes("artist") || member.roles.includes("art_director");
  }

  return owners.includes(member.name);
}

function getActiveMember(projectId: string) {
  const members = loadTeamMembers(projectId);
  const activeMemberId = loadActiveMemberId(projectId);

  return members.find((member) => member.id === activeMemberId) ?? members[0];
}

function normalizeFolderPath(path: string | undefined) {
  return (path ?? "").replaceAll("\\", "/").split("/").filter(Boolean).join("/");
}

function isRenderableThumbnail(path: string) {
  return path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://");
}

function loadAssetExplorerPath(projectId: string) {
  try {
    return window.localStorage.getItem(scopedPreferenceKey("asset-explorer-path", projectId));
  } catch {
    return null;
  }
}

function saveAssetExplorerPath(projectId: string, path: string) {
  try {
    window.localStorage.setItem(scopedPreferenceKey("asset-explorer-path", projectId), path);
  } catch {
    // Preference locale non critique.
  }
}

function loadAssetFavorites(projectId: string) {
  try {
    const value = window.localStorage.getItem(scopedPreferenceKey("asset-favorites", projectId));
    const parsed = value ? JSON.parse(value) : [];

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveAssetFavorites(projectId: string, assetIds: string[]) {
  try {
    window.localStorage.setItem(scopedPreferenceKey("asset-favorites", projectId), JSON.stringify(assetIds));
  } catch {
    // Preference locale non critique.
  }
}

function scopedPreferenceKey(key: string, projectId: string) {
  return `blendup:${projectId}:${key}`;
}
