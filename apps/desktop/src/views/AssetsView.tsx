import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileSearch,
  Folder,
  FolderOpen,
  Grid2X2,
  History,
  ImageIcon,
  List,
  ListTodo,
  Image as ImageIconFiles,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { assetLabel, buildAssetName, renameCore, TYPE_PREFIX } from "../blendup/naming";
import { selectImageFiles } from "../blendup/projectLoader";
import { useShortcuts, type ShortcutBindings } from "../app/shortcuts";
import type { Role, RoleCapabilities } from "../blendup/roles";
import type { AssetStatus, AssetType, BlendUpAsset, BlendUpProblem, BlendUpTask, ProjectSnapshot } from "../blendup/types";
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
type AssetQuickFilter = "all" | "favorites" | "todo" | "in_progress" | "review" | "needs_art_fix" | "validated";
type AssetThumbSize = "small" | "medium" | "large";

interface AssetSettings {
  defaultDisplayMode: AssetDisplayMode;
  thumbnailSize: AssetThumbSize;
  defaultSort: AssetSortMode;
  hideEmptyFolders: boolean;
  showTasks: boolean;
}

const defaultAssetSettings: AssetSettings = {
  defaultDisplayMode: "grid",
  thumbnailSize: "medium",
  defaultSort: "recent",
  hideEmptyFolders: false,
  showTasks: true
};

type ContextTarget =
  | { kind: "asset"; assetId: string }
  | { kind: "folder"; path: string };

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextTarget;
}

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
  onRenameAsset,
  onMoveAsset,
  onMoveFolder,
  onDeleteAsset,
  onSetAssetOwners,
  onSetAssignees,
  onCreateAsset,
  onCreateFolder,
  shortcutBindings,
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
  onChangeAssetStatus: (
    assetId: string,
    status: AssetStatus,
    actor: string,
    actorIsArtDirector: boolean
  ) => void;
  onRenameAsset: (assetId: string, newName: string, actor: string) => void;
  onMoveAsset: (assetId: string, targetDir: string, actor: string) => void;
  onMoveFolder: (fromDir: string, targetDir: string, actor: string) => void;
  onDeleteAsset: (assetId: string, actor: string) => void;
  onSetAssetOwners: (
    assetId: string,
    owners: { artist: string | null; developer: string | null; reviewer: string | null },
    actor: string
  ) => void;
  onSetAssignees: (assetId: string, assignees: string[], actor: string) => void;
  onCreateAsset: (
    input: {
      parentDir: string;
      name: string;
      assetType: string;
      notes: string;
      referenceImages: string[];
      textureImages: string[];
    },
    actor: string
  ) => void;
  onCreateFolder: (parentDir: string, name: string, actor: string) => void;
  shortcutBindings: ShortcutBindings;
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
  const projectId = snapshot.project.projectId;
  const [settings, setSettings] = useState<AssetSettings>(() => loadAssetSettings(projectId));
  const [folderFilter, setFolderFilter] = useState("all");
  const [sortMode, setSortMode] = useState<AssetSortMode>(() => loadAssetSettings(projectId).defaultSort);
  const [displayMode, setDisplayMode] = useState<AssetDisplayMode>(() => loadAssetSettings(projectId).defaultDisplayMode);
  const defaultExplorerPath = normalizeFolderPath(snapshot.project.paths.blenderRoot);
  const [currentPath, setCurrentPath] = useState(() => loadAssetExplorerPath(projectId) ?? defaultExplorerPath);
  const [quickFilter, setQuickFilter] = useState<AssetQuickFilter>("all");
  const [favoriteAssetIds, setFavoriteAssetIds] = useState<string[]>(() => loadAssetFavorites(projectId));
  const [recentFolders, setRecentFolders] = useState<string[]>(() => loadRecentFolders(projectId));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ assetId: string; currentName: string } | null>(null);
  const [dragInfo, setDragInfo] = useState<ContextTarget | null>(null);
  const [createMode, setCreateMode] = useState<null | "asset" | "folder">(null);
  const activeMember = useMemo(() => getActiveMember(projectId), [projectId]);
  const members = useMemo(() => loadTeamMembers(projectId), [projectId]);
  const actorName = activeMember?.name ?? "BlendUp";

  useEffect(() => {
    const nextSettings = loadAssetSettings(projectId);
    setSettings(nextSettings);
    setSortMode(nextSettings.defaultSort);
    setDisplayMode(nextSettings.defaultDisplayMode);
    setCurrentPath(loadAssetExplorerPath(projectId) ?? defaultExplorerPath);
    setFavoriteAssetIds(loadAssetFavorites(projectId));
    setRecentFolders(loadRecentFolders(projectId));
    setQuickFilter("all");
  }, [defaultExplorerPath, projectId]);

  useEffect(() => {
    saveAssetExplorerPath(projectId, currentPath);
  }, [currentPath, projectId]);

  useEffect(() => {
    saveAssetFavorites(projectId, favoriteAssetIds);
  }, [favoriteAssetIds, projectId]);

  useEffect(() => {
    saveAssetSettings(projectId, settings);
  }, [projectId, settings]);

  useEffect(() => {
    saveRecentFolders(projectId, recentFolders);
  }, [projectId, recentFolders]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

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

  const allFolders = useMemo(() => {
    const directories = new Map<string, number>();

    for (const asset of filteredAssets) {
      const directory = assetDirectory(asset);

      if (!directory) {
        continue;
      }

      directories.set(directory, (directories.get(directory) ?? 0) + 1);
    }

    return Array.from(directories.entries())
      .map(([path, count]) => ({ path, name: path.split("/").filter(Boolean).slice(-1)[0] ?? path, count }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [filteredAssets]);

  const linkedTasks = useMemo(() => snapshot.tasks.slice(0, 6), [snapshot.tasks]);

  const recentFolderDetails = useMemo(
    () =>
      recentFolders
        .map((path) => ({ path, name: path.split("/").filter(Boolean).slice(-1)[0] ?? path }))
        .filter((folder) => Boolean(folder.name)),
    [recentFolders]
  );

  const recordRecentFolder = (path: string) => {
    const normalized = normalizeFolderPath(path);

    if (!normalized) {
      return;
    }

    setRecentFolders((current) =>
      current[0] === normalized
        ? current
        : [normalized, ...current.filter((entry) => entry !== normalized)].slice(0, 5)
    );
  };

  // Recent = dossiers d'un asset ouvert dans Blender (pas juste navigue dans BlendUp).
  const handleOpenInBlender = (assetId: string) => {
    const asset = filteredAssets.find((item) => item.id === assetId);

    if (asset) {
      recordRecentFolder(assetDirectory(asset));
    }

    onOpenInBlender(assetId);
  };

  const openFolder = (path: string) => {
    setCurrentPath(normalizeFolderPath(path));
    setQuickFilter("all");
  };

  const openContextMenu = (event: ReactMouseEvent, target: ContextTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  };

  const submitRename = (newCore: string) => {
    if (renameTarget && newCore.trim()) {
      onRenameAsset(renameTarget.assetId, renameCore(renameTarget.currentName, newCore), actorName);
    }

    setRenameTarget(null);
  };

  const handleDropOnFolder = (targetDir: string) => {
    if (!dragInfo) {
      return;
    }

    const normalizedTarget = normalizeFolderPath(targetDir);

    if (dragInfo.kind === "asset") {
      onMoveAsset(dragInfo.assetId, normalizedTarget, actorName);
    } else if (dragInfo.kind === "folder" && dragInfo.path !== normalizedTarget) {
      onMoveFolder(dragInfo.path, normalizedTarget, actorName);
    }

    setDragInfo(null);
  };

  useShortcuts(shortcutBindings, {
    "asset.new": () => setCreateMode("asset"),
    "folder.new": () => setCreateMode("folder"),
    "asset.rename": () =>
      selectedAsset && setRenameTarget({ assetId: selectedAsset.id, currentName: selectedAsset.displayName }),
    "asset.delete": () => selectedAsset && onDeleteAsset(selectedAsset.id, actorName),
    "asset.favorite": () => selectedAsset && toggleFavorite(selectedAsset.id),
    "asset.openBlender": () => selectedAsset && handleOpenInBlender(selectedAsset.id),
    "asset.validate": () =>
      selectedAsset &&
      onChangeAssetStatus(
        selectedAsset.id,
        "validated",
        actorName,
        activeMember?.roles.includes("art_director") ?? false
      )
  });

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
            <div className="asset-shortcuts-scroll">
              {recentFolderDetails.length > 0 ? (
                <div className="asset-shortcut-group">
                  <span className="eyebrow">Recent</span>
                  {recentFolderDetails.map((folder) => (
                    <button
                      className={quickFilter === "all" && currentPath === folder.path ? "active" : ""}
                      key={folder.path}
                      onClick={() => openFolder(folder.path)}
                      title={folder.path}
                      type="button"
                    >
                      <Clock size={16} />
                      <span>{folder.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="asset-shortcut-group">
                <span className="eyebrow">Etat</span>
                {artistStatuses.map((option) => {
                  const count = filteredAssets.filter(
                    (asset) => normalizeArtistStatus(asset.status) === option.status
                  ).length;

                  return (
                    <button
                      className={quickFilter === option.status ? "active" : ""}
                      key={option.status}
                      onClick={() => setQuickFilter(option.status as AssetQuickFilter)}
                      type="button"
                    >
                      <span className={`status-dot status-${option.status}`} />
                      <span>{option.label}</span>
                      <strong>{count}</strong>
                    </button>
                  );
                })}
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
                    <span>{assetLabel(asset.displayName)}</span>
                  </button>
                ))}
              </div>

            </div>

            <button className="asset-settings-button" onClick={() => setIsSettingsOpen(true)} type="button">
              <SlidersHorizontal size={16} />
              <span>Parametres</span>
            </button>
          </aside>

          <div className="asset-explorer-main">
            <div className="asset-explorer-toolbar">
              <div className="asset-breadcrumb" aria-label="Emplacement asset">
                {breadcrumbParts(currentPath).map((part, index, parts) => (
                  <button
                    key={part.path || "root"}
                    className={index === parts.length - 1 ? "active" : ""}
                    onClick={() => openFolder(part.path)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropOnFolder(part.path)}
                    type="button"
                  >
                    {part.label}
                    {index < parts.length - 1 ? <ChevronRight size={14} /> : null}
                  </button>
                ))}
              </div>
              <div className="asset-view-controls">
                <button className="asset-create-action" onClick={() => setCreateMode("asset")} type="button">
                  <Plus size={15} />
                  Asset
                </button>
                <button className="asset-create-action ghost" onClick={() => setCreateMode("folder")} type="button">
                  <Plus size={15} />
                  Dossier
                </button>
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

            {quickFilter === "all" && childFolders.length > 0 ? (
              <section className="folder-child-grid" aria-label="Dossiers enfants">
                {childFolders.map((folder) => (
                  <button
                    className="folder-tile"
                    key={folder.path}
                    onClick={() => openFolder(folder.path)}
                    onContextMenu={(event) => openContextMenu(event, { kind: "folder", path: folder.path })}
                    draggable
                    onDragStart={() => setDragInfo({ kind: "folder", path: folder.path })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropOnFolder(folder.path)}
                    type="button"
                  >
                    <Folder size={24} />
                    <strong>{folder.name}</strong>
                    <span>{folder.assetCount} asset(s)</span>
                  </button>
                ))}
              </section>
            ) : null}

            <section
              className={`asset-card-grid display-${displayMode} thumb-${settings.thumbnailSize}`}
              aria-label={`Assets ${currentFolderLabel}`}
            >
              {visibleAssets.map((asset) => (
                <ArtistAssetCard
                  asset={asset}
                  displayMode={displayMode}
                  isFavorite={favoriteAssetIds.includes(asset.id)}
                  isSelected={asset.id === selectedAsset?.id}
                  key={asset.id}
                  onContextMenu={(event) => openContextMenu(event, { kind: "asset", assetId: asset.id })}
                  onDragStart={() => setDragInfo({ kind: "asset", assetId: asset.id })}
                  onSelect={() => setSelectedAssetId(asset.id)}
                  onToggleFavorite={() => toggleFavorite(asset.id)}
                  problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
                />
              ))}
            </section>
          </div>

          {contextMenu ? (
            <AssetContextMenu
              isFavorite={
                contextMenu.target.kind === "asset" && favoriteAssetIds.includes(contextMenu.target.assetId)
              }
              onClose={() => setContextMenu(null)}
              onDelete={() => {
                if (contextMenu.target.kind === "asset") {
                  onDeleteAsset(contextMenu.target.assetId, actorName);
                }
                setContextMenu(null);
              }}
              onOpenFolder={() => {
                if (contextMenu.target.kind === "folder") {
                  openFolder(contextMenu.target.path);
                }
                setContextMenu(null);
              }}
              onRename={() => {
                if (contextMenu.target.kind === "asset") {
                  const targetId = contextMenu.target.assetId;
                  const asset = filteredAssets.find((item) => item.id === targetId);
                  if (asset) {
                    setRenameTarget({ assetId: asset.id, currentName: asset.displayName });
                  }
                }
                setContextMenu(null);
              }}
              onToggleFavorite={() => {
                if (contextMenu.target.kind === "asset") {
                  toggleFavorite(contextMenu.target.assetId);
                }
                setContextMenu(null);
              }}
              target={contextMenu.target}
              x={contextMenu.x}
              y={contextMenu.y}
            />
          ) : null}

          {renameTarget ? (
            <RenameDialog
              current={assetLabel(renameTarget.currentName)}
              onCancel={() => setRenameTarget(null)}
              onSubmit={submitRename}
            />
          ) : null}

          {isSettingsOpen ? (
            <AssetSettingsPanel
              onChange={setSettings}
              onClose={() => setIsSettingsOpen(false)}
              settings={settings}
            />
          ) : null}

          {createMode === "folder" ? (
            <CreateFolderDialog
              currentPath={currentPath}
              onCancel={() => setCreateMode(null)}
              onSubmit={(name) => {
                onCreateFolder(currentPath, name, actorName);
                setCreateMode(null);
              }}
            />
          ) : null}

          {createMode === "asset" ? (
            <CreateAssetDialog
              currentPath={currentPath}
              onCancel={() => setCreateMode(null)}
              onSubmit={(input) => {
                onCreateAsset(input, actorName);
                setCreateMode(null);
              }}
            />
          ) : null}
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
        <div
          className="asset-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Detail asset artiste"
          onClick={() => setSelectedAssetId("")}
        >
          <ArtistAssetDetail
            activeMember={activeMember}
            asset={selectedAsset}
            capabilities={capabilities}
            isFavorite={favoriteAssetIds.includes(selectedAsset.id)}
            members={members}
            onAssignOwners={(owners) => onSetAssetOwners(selectedAsset.id, owners, actorName)}
            onSetAssignees={(assignees) => onSetAssignees(selectedAsset.id, assignees, actorName)}
            onChangeStatus={(status) =>
              onChangeAssetStatus(
                selectedAsset.id,
                status,
                actorName,
                activeMember?.roles.includes("art_director") ?? false
              )
            }
            onClose={() => setSelectedAssetId("")}
            onDelete={() => onDeleteAsset(selectedAsset.id, actorName)}
            onOpenInBlender={() => handleOpenInBlender(selectedAsset.id)}
            onRename={() => setRenameTarget({ assetId: selectedAsset.id, currentName: selectedAsset.displayName })}
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
  onContextMenu,
  onDragStart,
  onSelect,
  onToggleFavorite,
  problemCount
}: {
  asset: BlendUpAsset;
  displayMode: AssetDisplayMode;
  isFavorite: boolean;
  isSelected: boolean;
  onContextMenu: (event: ReactMouseEvent) => void;
  onDragStart: () => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  problemCount: number;
}) {
  const assignees = asset.assignees ?? [];

  return (
    <article
      className={`artist-asset-card ${displayMode} ${isSelected ? "selected" : ""}`}
      draggable
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    >
      <button className="asset-favorite-button" onClick={onToggleFavorite} title="Favori" type="button">
        <Star fill={isFavorite ? "currentColor" : "none"} size={16} />
      </button>
      <button className="artist-asset-card-main" onClick={onSelect} type="button">
        <AssetVisual asset={asset} />
        <span className="asset-folder-label">{assetDirectory(asset)}</span>
        <strong>{assetLabel(asset.displayName)}</strong>
        <small>{formatAssetType(asset.type)}</small>
        <div className="asset-card-footer">
          <StatusPill label={formatStatus(normalizeArtistStatus(asset.status))} tone="blue" />
          <AssetAvatars names={assignees} small />
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
  members,
  onAssignOwners,
  onSetAssignees,
  onChangeStatus,
  onClose,
  onDelete,
  onOpenInBlender,
  onRename,
  onToggleFavorite,
  problems
}: {
  activeMember?: TeamMember;
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isFavorite: boolean;
  members: TeamMember[];
  onAssignOwners: (owners: { artist: string | null; developer: string | null; reviewer: string | null }) => void;
  onSetAssignees: (assignees: string[]) => void;
  onChangeStatus: (status: AssetStatus) => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenInBlender: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  problems: BlendUpProblem[];
}) {
  const exported = asset.export.lastExportStatus === "success";
  const assignees = asset.assignees ?? [];
  const artistStatus = normalizeArtistStatus(asset.status);
  const isArtDirector = activeMember?.roles.includes("art_director") ?? false;
  const isValidated = artistStatus === "validated";
  const canEditStatus =
    (isArtDirector || isAssociatedMember(activeMember, asset)) && (!isValidated || isArtDirector);

  const changeOwner = (slot: "artist" | "developer" | "reviewer", value: string) => {
    const next = {
      artist: asset.owners.artist,
      developer: asset.owners.developer,
      reviewer: asset.owners.reviewer
    };
    next[slot] = value ? value : null;
    onAssignOwners(next);
  };

  const artistMembers = members.filter(
    (member) => member.roles.includes("artist") || member.roles.includes("art_director")
  );
  const devMembers = members.filter((member) => member.roles.includes("developer"));

  return (
    <aside
      className="asset-focus-panel artist-detail-panel centered"
      aria-label="Detail asset artiste"
      onClick={(event) => event.stopPropagation()}
    >
      <button className="icon-button close-button" onClick={onClose} title="Fermer" type="button">
        <X size={18} />
      </button>

      <div className="detail-header">
        <div className="detail-thumbnail large">
          <AssetVisual asset={asset} />
        </div>
        <div>
          <span className="role-badge">{capabilities.orientationLabel}</span>
          <h2>{assetLabel(asset.displayName)}</h2>
          <span className="eyebrow">{formatAssetType(asset.type)} - {asset.displayName}</span>
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
              : isValidated
                ? "Asset valide : seul le Directeur artistique peut le rouvrir."
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
        <button className="secondary" onClick={onRename} type="button">
          <Pencil size={16} />
          Renommer
        </button>
        <button className="secondary danger" onClick={onDelete} type="button">
          <Trash2 size={16} />
          Supprimer
        </button>
      </div>

      <div className="detail-sections airy">
        <section className="section-block">
          <h3>Equipe assignee</h3>
          <div className="assignee-editor">
            <AssetAvatars names={assignees} max={8} />
            <div className="assignee-toggle-list">
              {members.map((member) => {
                const active = assignees.includes(member.name);
                return (
                  <button
                    className={active ? "assignee-chip active" : "assignee-chip"}
                    key={member.id}
                    onClick={() =>
                      onSetAssignees(
                        active
                          ? assignees.filter((name) => name !== member.name)
                          : [...assignees, member.name]
                      )
                    }
                    type="button"
                  >
                    <span className="avatar tiny" style={{ background: memberColor(member.name) }}>
                      {memberInitials(member.name)}
                    </span>
                    {member.name}
                    {active ? <Check size={13} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="owner-assign-grid">
            <label>
              <span><UserRound size={14} /> Artiste</span>
              <select value={asset.owners.artist ?? ""} onChange={(event) => changeOwner("artist", event.target.value)}>
                <option value="">Non assigne</option>
                {artistMembers.map((member) => (
                  <option key={member.id} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span><UserRound size={14} /> Dev</span>
              <select
                value={asset.owners.developer ?? ""}
                onChange={(event) => changeOwner("developer", event.target.value)}
              >
                <option value="">Non assigne</option>
                {devMembers.map((member) => (
                  <option key={member.id} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span><UserRound size={14} /> Reviewer</span>
              <select
                value={asset.owners.reviewer ?? ""}
                onChange={(event) => changeOwner("reviewer", event.target.value)}
              >
                <option value="">Non assigne</option>
                {members.map((member) => (
                  <option key={member.id} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="section-block">
          <h3>Notes artiste</h3>
          <p className="soft-text">{asset.notes.artist || "Aucune note artiste."}</p>
        </section>
        <section className="section-block">
          <h3>Contenu de l'asset</h3>
          <PathLine label="Dossier" value={asset.paths.assetFolder} />
          <PathLine label="References" value={asset.paths.referencesDir} />
          <PathLine label="Textures" value={asset.paths.texturesDir} />
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

function AssetContextMenu({
  isFavorite,
  onClose,
  onDelete,
  onOpenFolder,
  onRename,
  onToggleFavorite,
  target,
  x,
  y
}: {
  isFavorite: boolean;
  onClose: () => void;
  onDelete: () => void;
  onOpenFolder: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  target: ContextTarget;
  x: number;
  y: number;
}) {
  return (
    <div
      className="asset-context-menu"
      style={{ top: y, left: x }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      {target.kind === "asset" ? (
        <>
          <button onClick={onRename} role="menuitem" type="button">
            <Pencil size={14} />
            Renommer
          </button>
          <button onClick={onToggleFavorite} role="menuitem" type="button">
            <Star size={14} />
            {isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          </button>
          <button className="danger" onClick={onDelete} role="menuitem" type="button">
            <Trash2 size={14} />
            Supprimer
          </button>
        </>
      ) : (
        <button onClick={onOpenFolder} role="menuitem" type="button">
          <FolderOpen size={14} />
          Ouvrir le dossier
        </button>
      )}
      <button className="context-close" onClick={onClose} role="menuitem" type="button">
        Fermer
      </button>
    </div>
  );
}

function RenameDialog({
  current,
  onCancel,
  onSubmit
}: {
  current: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <div className="asset-modal-overlay" onClick={onCancel} role="presentation">
      <div className="asset-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>Renommer l'asset</h3>
        <input
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSubmit(value);
            } else if (event.key === "Escape") {
              onCancel();
            }
          }}
          value={value}
        />
        <div className="asset-modal-actions">
          <button className="secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button disabled={!value.trim()} onClick={() => onSubmit(value)} type="button">
            Renommer
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetSettingsPanel({
  onChange,
  onClose,
  settings
}: {
  onChange: (settings: AssetSettings) => void;
  onClose: () => void;
  settings: AssetSettings;
}) {
  const update = (patch: Partial<AssetSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="asset-modal-overlay" onClick={onClose} role="presentation">
      <div className="asset-settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="asset-settings-head">
          <h3>Parametres d'affichage</h3>
          <button className="icon-button" onClick={onClose} title="Fermer" type="button">
            <X size={16} />
          </button>
        </div>

        <label className="settings-field">
          <span>Affichage par defaut</span>
          <select
            onChange={(event) => update({ defaultDisplayMode: event.target.value as AssetDisplayMode })}
            value={settings.defaultDisplayMode}
          >
            <option value="grid">Grille</option>
            <option value="list">Liste</option>
            <option value="compact">Compact</option>
          </select>
        </label>

        <label className="settings-field">
          <span>Taille des vignettes</span>
          <select
            onChange={(event) => update({ thumbnailSize: event.target.value as AssetThumbSize })}
            value={settings.thumbnailSize}
          >
            <option value="small">Petites</option>
            <option value="medium">Moyennes</option>
            <option value="large">Grandes</option>
          </select>
        </label>

        <label className="settings-field">
          <span>Tri par defaut</span>
          <select
            onChange={(event) => update({ defaultSort: event.target.value as AssetSortMode })}
            value={settings.defaultSort}
          >
            <option value="recent">Recents</option>
            <option value="name">Nom</option>
            <option value="status">Statut</option>
          </select>
        </label>

        <label className="settings-toggle">
          <input
            checked={settings.hideEmptyFolders}
            onChange={(event) => update({ hideEmptyFolders: event.target.checked })}
            type="checkbox"
          />
          <span>Masquer les dossiers vides</span>
        </label>

        <label className="settings-toggle">
          <input
            checked={settings.showTasks}
            onChange={(event) => update({ showTasks: event.target.checked })}
            type="checkbox"
          />
          <span>Afficher la partie Taches</span>
        </label>
      </div>
    </div>
  );
}

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "prop", label: "Prop" },
  { value: "static_mesh", label: "Static Mesh" },
  { value: "environment_piece", label: "Environment" },
  { value: "material", label: "Material" },
  { value: "texture", label: "Texture" },
  { value: "ui_image", label: "UI Image" },
  { value: "character", label: "Character" }
];

function CreateFolderDialog({
  currentPath,
  onCancel,
  onSubmit
}: {
  currentPath: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <div className="asset-modal-overlay" onClick={onCancel} role="presentation">
      <div className="asset-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>Nouveau dossier</h3>
        <p className="soft-text">Dans : {currentPath || "Racine"}</p>
        <input
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              onSubmit(name.trim());
            } else if (event.key === "Escape") {
              onCancel();
            }
          }}
          placeholder="Nom du dossier"
          value={name}
        />
        <div className="asset-modal-actions">
          <button className="secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button disabled={!name.trim()} onClick={() => onSubmit(name.trim())} type="button">
            Creer
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAssetDialog({
  currentPath,
  onCancel,
  onSubmit
}: {
  currentPath: string;
  onCancel: () => void;
  onSubmit: (input: {
    parentDir: string;
    name: string;
    assetType: string;
    notes: string;
    referenceImages: string[];
    textureImages: string[];
  }) => void;
}) {
  const [core, setCore] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("prop");
  const [notes, setNotes] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [textureImages, setTextureImages] = useState<string[]>([]);

  const technicalName = core.trim() ? buildAssetName(assetType, core) : "";

  const pickImages = async (current: string[], setter: (paths: string[]) => void) => {
    try {
      const files = await selectImageFiles();
      if (files.length > 0) {
        setter([...current, ...files]);
      }
    } catch {
      // Selection annulee.
    }
  };

  return (
    <div className="asset-modal-overlay" onClick={onCancel} role="presentation">
      <div className="asset-modal create-asset" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>Nouvel asset</h3>
        <p className="soft-text">Dans : {currentPath || "Racine"}</p>

        <label className="settings-field">
          <span>Type</span>
          <select value={assetType} onChange={(event) => setAssetType(event.target.value as AssetType)}>
            {ASSET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span>Nom</span>
          <input autoFocus onChange={(event) => setCore(event.target.value)} placeholder="ex: Rock" value={core} />
        </label>
        {technicalName ? <p className="soft-text">Nom de fichier : {technicalName}</p> : null}

        <label className="field-stack">
          <span>Notes</span>
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes artiste (optionnel)"
            rows={3}
            value={notes}
          />
        </label>

        <div className="create-image-row">
          <button className="secondary" onClick={() => pickImages(referenceImages, setReferenceImages)} type="button">
            <ImageIconFiles size={15} /> References ({referenceImages.length})
          </button>
          <button className="secondary" onClick={() => pickImages(textureImages, setTextureImages)} type="button">
            <ImageIconFiles size={15} /> Textures ({textureImages.length})
          </button>
        </div>

        <div className="asset-modal-actions">
          <button className="secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button
            disabled={!core.trim()}
            onClick={() =>
              onSubmit({
                parentDir: currentPath,
                name: technicalName,
                assetType,
                notes,
                referenceImages,
                textureImages
              })
            }
            type="button"
          >
            Creer
          </button>
        </div>
      </div>
    </div>
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

function memberColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 52%, 46%)`;
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AssetAvatars({ names, max = 4, small = false }: { names: string[]; max?: number; small?: boolean }) {
  if (names.length === 0) {
    return <span className="avatar-empty">Non assigne</span>;
  }

  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  return (
    <span className={`avatar-stack ${small ? "small" : ""}`}>
      {shown.map((name) => (
        <span className="avatar" key={name} style={{ background: memberColor(name) }} title={name}>
          {memberInitials(name)}
        </span>
      ))}
      {extra > 0 ? <span className="avatar more">+{extra}</span> : null}
    </span>
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

const ARTIST_STATUS_FILTERS: AssetStatus[] = [
  "todo",
  "in_progress",
  "review",
  "needs_art_fix",
  "validated"
];

function filterArtistAssets(
  assets: BlendUpAsset[],
  currentPath: string,
  quickFilter: AssetQuickFilter,
  favoriteAssetIds: string[]
) {
  if (quickFilter === "favorites") {
    return assets.filter((asset) => favoriteAssetIds.includes(asset.id));
  }

  if (ARTIST_STATUS_FILTERS.includes(quickFilter as AssetStatus)) {
    return assets.filter((asset) => normalizeArtistStatus(asset.status) === quickFilter);
  }

  const normalizedPath = normalizeFolderPath(currentPath);

  return assets.filter((asset) => assetDirectory(asset) === normalizedPath);
}

function assetDirectory(asset: BlendUpAsset) {
  // Modele dossier : l'emplacement explorer est le parent du dossier de l'asset.
  if (asset.paths.assetFolder) {
    const parts = normalizeFolderPath(asset.paths.assetFolder).split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }

  // Fallback (pre-migration, fichier .blend a plat) : dossier du fichier.
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

function loadAssetSettings(projectId: string): AssetSettings {
  try {
    const raw = window.localStorage.getItem(scopedPreferenceKey("asset-settings", projectId));

    if (!raw) {
      return defaultAssetSettings;
    }

    return { ...defaultAssetSettings, ...(JSON.parse(raw) as Partial<AssetSettings>) };
  } catch {
    return defaultAssetSettings;
  }
}

function saveAssetSettings(projectId: string, settings: AssetSettings) {
  try {
    window.localStorage.setItem(scopedPreferenceKey("asset-settings", projectId), JSON.stringify(settings));
  } catch {
    // Preference locale non critique.
  }
}

function loadRecentFolders(projectId: string): string[] {
  try {
    const raw = window.localStorage.getItem(scopedPreferenceKey("asset-recent-folders", projectId));
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function saveRecentFolders(projectId: string, folders: string[]) {
  try {
    window.localStorage.setItem(
      scopedPreferenceKey("asset-recent-folders", projectId),
      JSON.stringify(folders.slice(0, 5))
    );
  } catch {
    // Preference locale non critique.
  }
}

function scopedPreferenceKey(key: string, projectId: string) {
  return `blendup:${projectId}:${key}`;
}
