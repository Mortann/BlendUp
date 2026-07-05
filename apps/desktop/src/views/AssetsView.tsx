import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Copy,
  ExternalLink,
  FilePlus,
  FileSearch,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  History,
  ImageIcon,
  Layers,
  List,
  Image as ImageIconFiles,
  Pencil,
  Plus,
  Scissors,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { assetLabel, buildAssetName, categoryToType, labelForType, renameCore } from "../blendup/naming";
import { selectImageFiles } from "../blendup/projectLoader";
import { useShortcuts, type ShortcutBindings } from "../app/shortcuts";
import type { Role, RoleCapabilities } from "../blendup/roles";
import type {
  AssetStatus,
  AssetNamingRules,
  AssetTypePreset,
  AssetType,
  AssetVariant,
  BlendUpActivityEvent,
  BlendUpAsset,
  BlendUpProblem,
  ProjectSnapshot
} from "../blendup/types";
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
type HistoryTypeFilter = "all" | "status" | "team" | "notes" | "files" | "export" | "other";

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
  | { kind: "folder"; path: string }
  | { kind: "background" };

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextTarget;
}

type ClipboardEntry = { assetId: string; mode: "copy" | "cut" };

// Type dynamique : chaque dossier de categorie sous la racine Blender definit un type.
// On prend le 1er segment sous la racine Blender comme categorie -> token de type.
function typeForPath(path: string, assetRoots: string[], presets: AssetTypePreset[]): AssetType {
  const normalizedPath = normalizeFolderPath(path);
  const normalizedRoots = assetRoots.map(normalizeFolderPath).filter(Boolean);
  const normalizedRoot =
    normalizedRoots
      .filter((root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`))
      .sort((left, right) => right.length - left.length)[0] ?? normalizedRoots[0] ?? "";
  const relative =
    normalizedRoot && (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`))
      ? normalizedPath.slice(normalizedRoot.length).replace(/^\//, "")
      : normalizedPath;
  const category = relative.split("/").filter(Boolean)[0] ?? "";

  return category ? categoryToType(category, presets) : "prop";
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
  onUpdateAssetNotes,
  onSetAssignees,
  onCreateAsset,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onDuplicateAsset,
  onPasteAsset,
  onSaveAssetConfiguration,
  onSetVariants,
  shortcutBindings,
  onExportAsset,
  onOpenInBlender,
  onOpenContentPath,
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
    owners: { artist: string[]; developer: string[]; reviewer: string | null },
    actor: string
  ) => void;
  onUpdateAssetNotes: (assetId: string, artistNotes: string, actor: string) => void;
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
  onDeleteFolder: (dir: string, actor: string) => void;
  onRenameFolder: (dir: string, newName: string, actor: string) => void;
  onDuplicateAsset: (assetId: string, actor: string) => void;
  onPasteAsset: (assetId: string, targetDir: string, move: boolean, actor: string) => void;
  onSaveAssetConfiguration: (
    assetRoots: string[],
    assetTypePresets: AssetTypePreset[],
    assetNamingRules: AssetNamingRules
  ) => void;
  onSetVariants: (assetId: string, variants: AssetVariant[], actor: string) => void;
  shortcutBindings: ShortcutBindings;
  onExportAsset: (assetId: string) => void;
  onOpenInBlender: (assetId: string) => void;
  onOpenContentPath: (relativePath: string) => void;
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
  const assetRoots = useMemo(() => getAssetRoots(snapshot), [snapshot]);
  const defaultExplorerPath = normalizeFolderPath(assetRoots[0] ?? snapshot.project.paths.blenderRoot);
  const [currentPath, setCurrentPath] = useState(() => loadAssetExplorerPath(projectId) ?? defaultExplorerPath);
  const [quickFilter, setQuickFilter] = useState<AssetQuickFilter>("all");
  const [favoriteAssetIds, setFavoriteAssetIds] = useState<string[]>(() => loadAssetFavorites(projectId));
  const [recentFolders, setRecentFolders] = useState<string[]>(() => loadRecentFolders(projectId));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ assetId: string; currentName: string } | null>(null);
  const [dragInfo, setDragInfo] = useState<ContextTarget | null>(null);
  const [createMode, setCreateMode] = useState<null | "asset" | "folder">(null);
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);
  const [folderRenameTarget, setFolderRenameTarget] = useState<{ path: string; currentName: string } | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSpotlightOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
  const knownFolderPaths = useMemo(
    () => mergeKnownFolders(snapshot.assetFolders, filteredAssets, assetRoots),
    [assetRoots, filteredAssets, snapshot.assetFolders]
  );
  // Dossiers qui contiennent les infos d'un asset (references/textures/.blend) :
  // ils ne doivent pas apparaitre comme des dossiers d'organisation navigables.
  const assetFolderSet = useMemo(
    () => new Set(filteredAssets.map((asset) => normalizeFolderPath(asset.paths.assetFolder)).filter(Boolean)),
    [filteredAssets]
  );
  const childFolders = useMemo(
    () =>
      foldersForPath(filteredAssets, knownFolderPaths, currentPath).filter(
        (folder) => !assetFolderSet.has(folder.path) && (!settings.hideEmptyFolders || folder.assetCount > 0)
      ),
    [assetFolderSet, currentPath, filteredAssets, knownFolderPaths, settings.hideEmptyFolders]
  );
  const generalFolders = useMemo(
    () =>
      assetRoots.flatMap((root) =>
        foldersForPath(filteredAssets, knownFolderPaths, root).filter(
          (folder) => !assetFolderSet.has(folder.path) && (!settings.hideEmptyFolders || folder.assetCount > 0)
        )
      ),
    [assetFolderSet, assetRoots, filteredAssets, knownFolderPaths, settings.hideEmptyFolders]
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

  const recentFolderDetails = useMemo(() => {
    const roots = assetRoots.map(normalizeFolderPath).filter(Boolean);
    return recentFolders
      .map((path) => ({ path: normalizeFolderPath(path), name: path.split("/").filter(Boolean).slice(-1)[0] ?? path }))
      .filter(
        (folder) =>
          Boolean(folder.name) &&
          roots.some((root) => folder.path !== root && folder.path.startsWith(`${root}/`))
      );
  }, [assetRoots, recentFolders]);

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

  const removeRecentFolder = (path: string) => {
    const normalized = normalizeFolderPath(path);
    setRecentFolders((current) => current.filter((entry) => entry !== normalized));
  };

  const copyAssetToClipboard = (assetId: string, mode: "copy" | "cut") => {
    setClipboard({ assetId, mode });
  };

  const pasteClipboard = (targetDir: string) => {
    if (!clipboard) {
      return;
    }

    onPasteAsset(clipboard.assetId, normalizeFolderPath(targetDir), clipboard.mode === "cut", actorName);

    if (clipboard.mode === "cut") {
      setClipboard(null);
    }
  };

  const beginDrag = (event: ReactDragEvent, target: ContextTarget) => {
    setDragInfo(target);

    if (event.dataTransfer) {
      // Indispensable cote WebView pour que le drag HTML5 s'initialise (sinon curseur "interdit").
      const payload = target.kind === "asset" ? `asset:${target.assetId}` : target.kind === "folder" ? `folder:${target.path}` : "";
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", payload);
      } catch {
        // Certains environnements restreignent setData ; le state dragInfo suffit alors.
      }
    }
  };

  const allowDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
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
        {role === "artist" ? null : (
          <div className="asset-header-title">
            <span className="eyebrow">Inventaire technique</span>
            <h2>Assets projet</h2>
          </div>
        )}
        <button
          className="spotlight-trigger"
          onClick={() => setIsSpotlightOpen(true)}
          title="Rechercher dans tout le projet"
          type="button"
        >
          <Search size={16} />
          <span>Rechercher un asset ou un dossier…</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      {role === "artist" ? (
        <div className="artist-asset-explorer">
          <aside className="asset-shortcuts-panel" aria-label="Acces rapides assets">
            <div className="asset-shortcuts-scroll">
              {recentFolderDetails.length > 0 ? (
                <div className="asset-shortcut-group">
                  <span className="eyebrow">Recent</span>
                  {recentFolderDetails.map((folder) => (
                    <div
                      className={`recent-folder-row ${quickFilter === "all" && currentPath === folder.path ? "active" : ""}`}
                      key={folder.path}
                    >
                      <button
                        className="recent-folder-open"
                        onClick={() => openFolder(folder.path)}
                        onDragOver={allowDrop}
                        onDrop={() => handleDropOnFolder(folder.path)}
                        title={folder.path}
                        type="button"
                      >
                        <Clock size={16} />
                        <span>{folder.name}</span>
                      </button>
                      <button
                        className="recent-folder-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeRecentFolder(folder.path);
                        }}
                        title="Retirer des recents"
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="asset-shortcut-group">
                <span className="eyebrow">General</span>
                {generalFolders.map((folder) => (
                  <button
                    className={quickFilter === "all" && currentPath === folder.path ? "active" : ""}
                    key={folder.path}
                    onClick={() => openFolder(folder.path)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropOnFolder(folder.path)}
                    title={folder.path}
                    type="button"
                  >
                    <Folder size={16} />
                    <span>{folder.name}</span>
                    <strong>{folder.assetCount}</strong>
                  </button>
                ))}
              </div>

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
                    <AssetVisual asset={asset} projectRoot={snapshot.projectRoot} small />
                    <span>{assetLabel(asset.displayName)}</span>
                  </button>
                ))}
              </div>

              {settings.showTasks && linkedTasks.length > 0 ? (
                <div className="asset-shortcut-group">
                  <span className="eyebrow">Taches</span>
                  {linkedTasks.map((task) => {
                    const firstAssetId = task.assetIds[0];
                    return (
                      <button
                        disabled={!firstAssetId}
                        key={task.id}
                        onClick={() => {
                          if (firstAssetId) {
                            setSelectedAssetId(firstAssetId);
                          }
                        }}
                        title={task.title}
                        type="button"
                      >
                        <CheckCircle2 size={16} />
                        <span>{task.title}</span>
                        <strong>{task.status}</strong>
                      </button>
                    );
                  })}
                </div>
              ) : null}

            </div>

            <button className="asset-settings-button" onClick={() => setIsSettingsOpen(true)} type="button">
              <SlidersHorizontal size={16} />
              <span>Parametres</span>
            </button>
          </aside>

          <div
            className="asset-explorer-main"
            onContextMenu={(event) => openContextMenu(event, { kind: "background" })}
          >
            <div className="asset-explorer-toolbar">
              <div className="asset-breadcrumb" aria-label="Emplacement asset">
                {breadcrumbParts(currentPath, assetRoots).map((part, index, parts) => (
                  <button
                    key={part.path || "root"}
                    className={index === parts.length - 1 ? "active" : ""}
                    onClick={() => openFolder(part.path)}
                    onDragOver={allowDrop}
                    onDrop={() => handleDropOnFolder(part.path)}
                    type="button"
                  >
                    {part.label}
                    {index < parts.length - 1 ? <ChevronRight size={14} /> : null}
                  </button>
                ))}
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
                    onDragStart={(event) => beginDrag(event, { kind: "folder", path: folder.path })}
                    onDragOver={allowDrop}
                    onDrop={() => handleDropOnFolder(folder.path)}
                    type="button"
                  >
                    <FolderPreview assets={filteredAssets} folderPath={folder.path} projectRoot={snapshot.projectRoot} />
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
                  onDragStart={(event) => beginDrag(event, { kind: "asset", assetId: asset.id })}
                  onSelect={() => setSelectedAssetId(asset.id)}
                  onToggleFavorite={() => toggleFavorite(asset.id)}
                  problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
                  projectRoot={snapshot.projectRoot}
                />
              ))}
            </section>
          </div>

          {contextMenu ? (
            <AssetContextMenu
              canPaste={Boolean(clipboard)}
              displayMode={displayMode}
              isFavorite={
                contextMenu.target.kind === "asset" && favoriteAssetIds.includes(contextMenu.target.assetId)
              }
              sortMode={sortMode}
              target={contextMenu.target}
              x={contextMenu.x}
              y={contextMenu.y}
              onCopy={() => {
                if (contextMenu.target.kind === "asset") {
                  copyAssetToClipboard(contextMenu.target.assetId, "copy");
                }
                setContextMenu(null);
              }}
              onCut={() => {
                if (contextMenu.target.kind === "asset") {
                  copyAssetToClipboard(contextMenu.target.assetId, "cut");
                }
                setContextMenu(null);
              }}
              onDuplicate={() => {
                if (contextMenu.target.kind === "asset") {
                  onDuplicateAsset(contextMenu.target.assetId, actorName);
                }
                setContextMenu(null);
              }}
              onDeleteAsset={() => {
                if (contextMenu.target.kind === "asset") {
                  onDeleteAsset(contextMenu.target.assetId, actorName);
                }
                setContextMenu(null);
              }}
              onRenameAsset={() => {
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
              onOpenFolder={() => {
                if (contextMenu.target.kind === "folder") {
                  openFolder(contextMenu.target.path);
                }
                setContextMenu(null);
              }}
              onRevealInExplorer={() => {
                if (contextMenu.target.kind === "folder") {
                  onOpenContentPath(contextMenu.target.path);
                } else if (contextMenu.target.kind === "asset") {
                  const assetId = contextMenu.target.assetId;
                  const asset = filteredAssets.find((item) => item.id === assetId);
                  if (asset) {
                    onOpenContentPath(asset.paths.assetFolder || assetDirectory(asset));
                  }
                } else {
                  onOpenContentPath(currentPath);
                }
                setContextMenu(null);
              }}
              onRenameFolder={() => {
                if (contextMenu.target.kind === "folder") {
                  setFolderRenameTarget({
                    path: contextMenu.target.path,
                    currentName: contextMenu.target.path.split("/").filter(Boolean).slice(-1)[0] ?? ""
                  });
                }
                setContextMenu(null);
              }}
              onDeleteFolder={() => {
                if (contextMenu.target.kind === "folder") {
                  setFolderDeleteTarget({
                    path: contextMenu.target.path,
                    name: contextMenu.target.path.split("/").filter(Boolean).slice(-1)[0] ?? ""
                  });
                }
                setContextMenu(null);
              }}
              onPaste={() => {
                const targetDir =
                  contextMenu.target.kind === "folder" ? contextMenu.target.path : currentPath;
                pasteClipboard(targetDir);
                setContextMenu(null);
              }}
              onCreateFolder={() => {
                setCreateMode("folder");
                setContextMenu(null);
              }}
              onCreateAsset={() => {
                setCreateMode("asset");
                setContextMenu(null);
              }}
              onSetSort={(mode) => {
                setSortMode(mode);
                setContextMenu(null);
              }}
              onSetDisplay={(mode) => {
                setDisplayMode(mode);
                setContextMenu(null);
              }}
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
              assetNamingRules={snapshot.assetNamingRules}
              assetRoots={assetRoots}
              assetTypePresets={snapshot.assetTypePresets}
              onChange={(nextSettings) => {
                setSettings(nextSettings);
                setDisplayMode(nextSettings.defaultDisplayMode);
                setSortMode(nextSettings.defaultSort);
              }}
              onClose={() => setIsSettingsOpen(false)}
              onSaveAssetConfiguration={onSaveAssetConfiguration}
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
              assetType={typeForPath(currentPath, assetRoots, snapshot.assetTypePresets)}
              currentPath={currentPath}
              onCancel={() => setCreateMode(null)}
              typePresets={snapshot.assetTypePresets}
              onSubmit={(input) => {
                onCreateAsset(input, actorName);
                setCreateMode(null);
              }}
            />
          ) : null}

          {folderRenameTarget ? (
            <RenameDialog
              current={folderRenameTarget.currentName}
              title="Renommer le dossier"
              onCancel={() => setFolderRenameTarget(null)}
              onSubmit={(value) => {
                onRenameFolder(folderRenameTarget.path, value, actorName);
                setFolderRenameTarget(null);
              }}
            />
          ) : null}

          {folderDeleteTarget ? (
            <ConfirmDialog
              title="Supprimer le dossier"
              message={`Envoyer "${folderDeleteTarget.name}" et tout son contenu a la corbeille ?`}
              confirmLabel="Supprimer"
              onCancel={() => setFolderDeleteTarget(null)}
              onConfirm={() => {
                onDeleteFolder(folderDeleteTarget.path, actorName);
                setFolderDeleteTarget(null);
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
            onSetVariants={(variants) => onSetVariants(selectedAsset.id, variants, actorName)}
            onUpdateArtistNotes={(notes) => onUpdateAssetNotes(selectedAsset.id, notes, actorName)}
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
            onOpenContentPath={onOpenContentPath}
            onRename={() => setRenameTarget({ assetId: selectedAsset.id, currentName: selectedAsset.displayName })}
            onToggleFavorite={() => toggleFavorite(selectedAsset.id)}
            problems={selectedProblems}
            activity={snapshot.activity.filter((event) => event.assetId === selectedAsset.id)}
            currentBranch={snapshot.gitStatus.branch}
            projectRoot={snapshot.projectRoot}
          />
        </div>
      ) : null}

      {isSpotlightOpen ? (
        <SpotlightSearch
          assets={filteredAssets}
          folders={
            role === "artist"
              ? allFolders
              : folders.map((folder) => ({
                  path: folder,
                  name: folder.split("/").filter(Boolean).slice(-1)[0] ?? folder,
                  count: filteredAssets.filter((asset) => assetFolder(asset) === folder).length
                }))
          }
          projectRoot={snapshot.projectRoot}
          onClose={() => setIsSpotlightOpen(false)}
          onOpenAsset={(assetId) => {
            setSelectedAssetId(assetId);
            setIsSpotlightOpen(false);
          }}
          onOpenFolder={(path) => {
            if (role === "artist") {
              openFolder(path);
            } else {
              setFolderFilter(path);
            }
            setIsSpotlightOpen(false);
          }}
        />
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
  problemCount,
  projectRoot
}: {
  asset: BlendUpAsset;
  displayMode: AssetDisplayMode;
  isFavorite: boolean;
  isSelected: boolean;
  onContextMenu: (event: ReactMouseEvent) => void;
  onDragStart: (event: ReactDragEvent) => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  problemCount: number;
  projectRoot?: string;
}) {
  const people = assetPeople(asset);
  // Empeche l'ouverture de l'asset (onSelect) quand le clic suit un drag.
  const draggedRef = useRef(false);

  return (
    <article
      className={`artist-asset-card ${displayMode} ${isSelected ? "selected" : ""}`}
      draggable
      onContextMenu={onContextMenu}
      onDragStart={(event) => {
        draggedRef.current = true;
        onDragStart(event);
      }}
      onDragEnd={() => {
        // Laisse passer le cycle d'evenement puis reactive le clic.
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 80);
      }}
    >
      <button className="asset-favorite-button" onClick={onToggleFavorite} title="Favori" type="button">
        <Star fill={isFavorite ? "currentColor" : "none"} size={16} />
      </button>
      <button
        className="artist-asset-card-main"
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          onSelect();
        }}
        type="button"
      >
        <AssetVisual asset={asset} projectRoot={projectRoot} />
        <span className="asset-folder-label">{assetDirectory(asset)}</span>
        <strong>{assetLabel(asset.displayName)}</strong>
        <small>{formatAssetType(asset.type)}</small>
        <div className="asset-card-footer">
          <StatusPill label={formatStatus(normalizeArtistStatus(asset.status))} tone="blue" />
          <AssetAvatars names={people} small />
          {asset.variants && asset.variants.length > 0 ? (
            <span className="variant-badge" title={`${asset.variants.length} variante(s)`}>
              <Layers size={12} />
              {asset.variants.length}
            </span>
          ) : null}
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
  activity,
  asset,
  capabilities,
  currentBranch,
  isFavorite,
  members,
  onAssignOwners,
  onSetVariants,
  onUpdateArtistNotes,
  onChangeStatus,
  onClose,
  onDelete,
  onOpenInBlender,
  onOpenContentPath,
  onRename,
  onToggleFavorite,
  problems,
  projectRoot
}: {
  activeMember?: TeamMember;
  activity: BlendUpActivityEvent[];
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  currentBranch?: string;
  isFavorite: boolean;
  members: TeamMember[];
  onAssignOwners: (owners: { artist: string[]; developer: string[]; reviewer: string | null }) => void;
  onSetVariants: (variants: AssetVariant[]) => void;
  onUpdateArtistNotes: (notes: string) => void;
  onChangeStatus: (status: AssetStatus) => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenInBlender: () => void;
  onOpenContentPath: (relativePath: string) => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  problems: BlendUpProblem[];
  projectRoot?: string;
}) {
  const [detailMode, setDetailMode] = useState<"info" | "history">("info");
  const [artistNotesDraft, setArtistNotesDraft] = useState(asset.notes.artist);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTypeFilter>("all");
  const [historyActorFilter, setHistoryActorFilter] = useState("all");
  const [historyBranchFilter, setHistoryBranchFilter] = useState("all");
  const exported = asset.export.lastExportStatus === "success";
  const artistOwners = ownerNames(asset.owners.artist);
  const developerOwners = ownerNames(asset.owners.developer);
  const artistStatus = normalizeArtistStatus(asset.status);
  const isArtDirector = activeMember?.roles.includes("art_director") ?? false;
  const isValidated = artistStatus === "validated";
  const canEditStatus =
    (isArtDirector || isAssociatedMember(activeMember, asset)) && (!isValidated || isArtDirector);

  const changeOwnerList = (slot: "artist" | "developer", values: string[]) => {
    onAssignOwners({
      artist: slot === "artist" ? values : artistOwners,
      developer: slot === "developer" ? values : developerOwners,
      reviewer: asset.owners.reviewer
    });
  };

  const changeReviewer = (value: string) => {
    onAssignOwners({
      artist: artistOwners,
      developer: developerOwners,
      reviewer: value ? value : null
    });
  };

  const artistMembers = members.filter(
    (member) => member.roles.includes("artist") || member.roles.includes("art_director")
  );
  const devMembers = members.filter((member) => member.roles.includes("developer"));
  const historyEntries = useMemo(
    () => buildAssetHistory(asset, activity, currentBranch),
    [activity, asset, currentBranch]
  );
  const historyActors = useMemo(
    () => Array.from(new Set(historyEntries.map((entry) => entry.actor))).sort((left, right) => left.localeCompare(right)),
    [historyEntries]
  );
  const historyBranches = useMemo(
    () => Array.from(new Set(historyEntries.map((entry) => entry.branch))).sort((left, right) => left.localeCompare(right)),
    [historyEntries]
  );
  const filteredHistoryEntries = historyEntries.filter((entry) => {
    const matchesType = historyTypeFilter === "all" || historyCategory(entry.type) === historyTypeFilter;
    const matchesActor = historyActorFilter === "all" || entry.actor === historyActorFilter;
    const matchesBranch = historyBranchFilter === "all" || entry.branch === historyBranchFilter;

    return matchesType && matchesActor && matchesBranch;
  });

  useEffect(() => {
    setArtistNotesDraft(asset.notes.artist);
    setDetailMode("info");
    setHistoryTypeFilter("all");
    setHistoryActorFilter("all");
    setHistoryBranchFilter("all");
  }, [asset.id, asset.notes.artist]);

  const saveArtistNotes = () => {
    if (artistNotesDraft !== asset.notes.artist) {
      onUpdateArtistNotes(artistNotesDraft);
    }
  };

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
          <AssetVisual asset={asset} projectRoot={projectRoot} />
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
        <label className="asset-status-select">
          <span className={`status-dot status-${artistStatus}`} />
          <select
            aria-label="Changer le statut artiste"
            disabled={!canEditStatus}
            onChange={(event) => onChangeStatus(event.target.value as AssetStatus)}
            value={artistStatus}
          >
            {artistStatuses.map((option) => (
              <option
                disabled={option.status === "validated" && !isArtDirector}
                key={option.status}
                value={option.status}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="asset-action-bar">
        <button disabled={!asset.paths.blenderSource} onClick={onOpenInBlender} type="button">
          <ExternalLink size={16} />
          Ouvrir dans Blender
        </button>
        <button
          className={detailMode === "history" ? "secondary active" : "secondary"}
          onClick={() => setDetailMode((current) => (current === "history" ? "info" : "history"))}
          type="button"
        >
          <History size={16} />
          Historique
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

      {detailMode === "history" ? (
        <section className="section-block asset-history-panel">
          <div className="section-heading-row">
            <h3>Historique complet</h3>
            <span className="soft-text">{filteredHistoryEntries.length} / {historyEntries.length} evenement(s)</span>
          </div>
          <div className="history-filter-bar" aria-label="Filtres historique">
            <label>
              <span>Type</span>
              <select value={historyTypeFilter} onChange={(event) => setHistoryTypeFilter(event.target.value as HistoryTypeFilter)}>
                <option value="all">Tous</option>
                <option value="status">Etat</option>
                <option value="team">Equipe</option>
                <option value="notes">Notes</option>
                <option value="files">Fichiers</option>
                <option value="export">Export</option>
                <option value="other">Autres</option>
              </select>
            </label>
            <label>
              <span>Personne</span>
              <select value={historyActorFilter} onChange={(event) => setHistoryActorFilter(event.target.value)}>
                <option value="all">Toutes</option>
                {historyActors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Branche</span>
              <select value={historyBranchFilter} onChange={(event) => setHistoryBranchFilter(event.target.value)}>
                <option value="all">Toutes</option>
                {historyBranches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="asset-timeline">
            {filteredHistoryEntries.length > 0 ? (
              filteredHistoryEntries.map((entry) => (
                <article className="timeline-entry" key={`${entry.time}-${entry.type}-${entry.message}`}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entry.message}</p>
                    <div className="timeline-meta">
                      <span>{entry.actor}</span>
                      <span>{formatDateTime(entry.time)}</span>
                      <span>{entry.branch}</span>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState icon={<History size={24} />} label="Aucun evenement avec ces filtres" />
            )}
          </div>
        </section>
      ) : (
        <div className="detail-sections airy artist-detail-grid">
          <section className="section-block">
            <h3>Equipe</h3>
            <div className="owner-assign-grid">
              <OwnerMultiSelect
                label="Artiste"
                members={artistMembers}
                onChange={(values) => changeOwnerList("artist", values)}
                values={artistOwners}
              />
              <OwnerMultiSelect
                label="Dev"
                members={devMembers}
                onChange={(values) => changeOwnerList("developer", values)}
                values={developerOwners}
              />
              <label>
                <span><UserRound size={14} /> Reviewer</span>
                <select
                  value={asset.owners.reviewer ?? ""}
                  onChange={(event) => changeReviewer(event.target.value)}
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
            <textarea
              className="artist-notes-editor"
              onBlur={saveArtistNotes}
              onChange={(event) => setArtistNotesDraft(event.target.value)}
              placeholder="Ajouter une note artiste"
              rows={6}
              value={artistNotesDraft}
            />
            <div className="notes-actions">
              <button
                className="secondary"
                disabled={artistNotesDraft === asset.notes.artist}
                onClick={saveArtistNotes}
                type="button"
              >
                Enregistrer
              </button>
            </div>
          </section>
          <section className="section-block">
            <h3>Contenu de l'asset</h3>
            <AssetContentLinks asset={asset} onOpenContentPath={onOpenContentPath} />
          </section>
          <section className="section-block">
            <h3>Variantes</h3>
            <AssetVariants asset={asset} onSetVariants={onSetVariants} />
          </section>
          <section className="section-block">
            <h3>Checklist asset</h3>
            <AssetChecklist asset={asset} problems={problems} />
          </section>
          <details className="detail-disclosure">
            <summary>Details fichier</summary>
            <PathLine label="Blender" value={asset.paths.blenderSource} />
            <PathLine label="FBX" value={asset.paths.fbxExport} />
          </details>
          <section className="section-block artist-problems-section">
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
      )}
    </aside>
  );
}

function AssetVariants({
  asset,
  onSetVariants
}: {
  asset: BlendUpAsset;
  onSetVariants: (variants: AssetVariant[]) => void;
}) {
  const variants = asset.variants ?? [];
  const [draft, setDraft] = useState("");

  const addVariant = () => {
    const name = draft.trim();
    if (!name) {
      return;
    }
    const variant: AssetVariant = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      createdAt: new Date().toISOString()
    };
    onSetVariants([...variants, variant]);
    setDraft("");
  };

  const removeVariant = (id: string) => {
    onSetVariants(variants.filter((variant) => variant.id !== id));
  };

  return (
    <div className="asset-variants">
      {variants.length > 0 ? (
        <ul className="variant-list">
          {variants.map((variant) => (
            <li key={variant.id}>
              <Layers size={14} />
              <span>{variant.name}</span>
              <button
                className="variant-remove"
                onClick={() => removeVariant(variant.id)}
                title="Supprimer la variante"
                type="button"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soft-text">Aucune variante pour cet asset.</p>
      )}
      <div className="variant-add">
        <input
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              addVariant();
            }
          }}
          placeholder="Nom de la variante (ex: Casse, Neige)"
          value={draft}
        />
        <button className="secondary" disabled={!draft.trim()} onClick={addVariant} type="button">
          <Plus size={14} />
          Ajouter
        </button>
      </div>
    </div>
  );
}

function AssetContentLinks({
  asset,
  onOpenContentPath
}: {
  asset: BlendUpAsset;
  onOpenContentPath: (relativePath: string) => void;
}) {
  const links = [
    { label: "Dossier", name: baseName(asset.paths.assetFolder) || assetLabel(asset.displayName), path: asset.paths.assetFolder },
    { label: "References", name: "references", path: asset.paths.referencesDir },
    { label: "Textures", name: "textures", path: asset.paths.texturesDir }
  ].filter((link): link is { label: string; name: string; path: string } => Boolean(link.path));

  if (links.length === 0) {
    return <p className="soft-text">Aucun contenu lie pour cet asset.</p>;
  }

  return (
    <div className="asset-content-links">
      {links.map((link) => (
        <button key={link.label} onClick={() => onOpenContentPath(link.path)} title={link.path} type="button">
          <FolderOpen size={16} />
          <span>{link.label}</span>
          <strong>{link.name}</strong>
        </button>
      ))}
    </div>
  );
}

function AssetChecklist({ asset, problems }: { asset: BlendUpAsset; problems: BlendUpProblem[] }) {
  const checks = [
    {
      label: "Source Blender",
      detail: asset.paths.blenderSource ?? "Aucun fichier .blend lie",
      done: Boolean(asset.paths.blenderSource)
    },
    {
      label: "Dossier asset",
      detail: asset.paths.assetFolder ?? "Dossier asset non defini",
      done: Boolean(asset.paths.assetFolder)
    },
    {
      label: "References",
      detail: asset.paths.referencesDir ?? "Dossier references non defini",
      done: Boolean(asset.paths.referencesDir)
    },
    {
      label: "Textures",
      detail: asset.paths.texturesDir ?? "Dossier textures non defini",
      done: Boolean(asset.paths.texturesDir)
    },
    {
      label: "Equipe artiste",
      detail: ownerNames(asset.owners.artist).join(", ") || "Aucun artiste",
      done: ownerNames(asset.owners.artist).length > 0
    },
    {
      label: "Export FBX",
      detail: formatExportStatus(asset.export.lastExportStatus),
      done: asset.export.lastExportStatus === "success"
    },
    {
      label: "Problemes",
      detail: problems.length === 0 ? "Aucun probleme" : `${problems.length} point(s) a verifier`,
      done: problems.length === 0
    }
  ];

  return (
    <div className="asset-checklist">
      {checks.map((check) => (
        <div className={check.done ? "done" : ""} key={check.label}>
          {check.done ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            <strong>{check.label}</strong>
            <small>{check.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function OwnerMultiSelect({
  label,
  members,
  onChange,
  values
}: {
  label: string;
  members: TeamMember[];
  onChange: (values: string[]) => void;
  values: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectedSet = new Set(values);
  const filtered = members.filter((member) =>
    member.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const toggle = (name: string) => {
    if (selectedSet.has(name)) {
      onChange(values.filter((value) => value !== name));
    } else {
      onChange([...values, name]);
    }
  };

  return (
    <div className="owner-multiselect" ref={containerRef}>
      <span className="owner-multiselect-label">
        <UserRound size={14} /> {label}
      </span>
      <div className="ms-field">
        <div
          className={`ms-control ${open ? "open" : ""}`}
          onClick={() => setOpen((current) => !current)}
          role="button"
          tabIndex={0}
        >
          <div className="ms-values">
            {values.length === 0 ? <span className="ms-placeholder">Selectionner…</span> : null}
            {values.map((name) => (
              <span className="ms-chip" key={name}>
                <span className="ms-chip-dot" style={{ background: memberColor(name) }} />
                {name}
                <button
                  className="ms-chip-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(values.filter((value) => value !== name));
                  }}
                  title="Retirer"
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <ChevronDown className="ms-arrow" size={15} />
        </div>
        {open ? (
          <div className="ms-menu">
            <input
              autoFocus
              className="ms-search"
              onChange={(event) => setSearch(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="Rechercher…"
              value={search}
            />
            <div className="ms-options">
              {filtered.length > 0 ? (
                filtered.map((member) => {
                  const checked = selectedSet.has(member.name);
                  return (
                    <button
                      className={`ms-option ${checked ? "checked" : ""}`}
                      key={member.id}
                      onClick={() => toggle(member.name)}
                      type="button"
                    >
                      <span className="ms-option-check">{checked ? <Check size={13} /> : null}</span>
                      <span className="ms-chip-dot" style={{ background: memberColor(member.name) }} />
                      {member.name}
                    </button>
                  );
                })
              ) : (
                <p className="soft-text ms-empty">Aucun membre</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface AssetHistoryEntry {
  actor: string;
  branch: string;
  message: string;
  time: string;
  title: string;
  type: string;
}

function buildAssetHistory(
  asset: BlendUpAsset,
  activity: BlendUpActivityEvent[],
  currentBranch?: string
): AssetHistoryEntry[] {
  const branch = currentBranch ?? "Branche inconnue";
  const entries = activity.map((event) => ({
    actor: event.actor || "BlendUp",
    branch: event.branch ?? branch,
    message: event.message || activityTitle(event.type),
    time: event.time,
    title: activityTitle(event.type),
    type: event.type
  }));

  entries.push({
    actor: "BlendUp",
    branch,
    message: `${assetLabel(asset.displayName)} cree`,
    time: asset.createdAt,
    title: "Creation",
    type: "asset.created"
  });

  if (asset.updatedAt !== asset.createdAt) {
    entries.push({
      actor: "BlendUp",
      branch,
      message: "Fiche asset mise a jour",
      time: asset.updatedAt,
      title: "Derniere modification",
      type: "asset.updated"
    });
  }

  if (asset.export.lastExportAt) {
    entries.push({
      actor: "Blender",
      branch,
      message: `Export FBX: ${formatExportStatus(asset.export.lastExportStatus)}`,
      time: asset.export.lastExportAt,
      title: "Export",
      type: "asset.exported"
    });
  }

  return entries.sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
}

function activityTitle(type: string) {
  const labels: Record<string, string> = {
    "asset.assignees_changed": "Assignation",
    "asset.created": "Creation",
    "asset.deleted": "Suppression",
    "asset.files_added": "Fichiers ajoutes",
    "asset.moved": "Deplacement",
    "asset.notes_changed": "Notes",
    "asset.owners_changed": "Equipe",
    "asset.renamed": "Renommage",
    "asset.status_changed": "Etat",
    "asset.thumbnail_updated": "Visuel"
  };

  return labels[type] ?? type.replaceAll(".", " ");
}

function historyCategory(type: string): HistoryTypeFilter {
  if (type.includes("status")) {
    return "status";
  }

  if (type.includes("assignees") || type.includes("owners")) {
    return "team";
  }

  if (type.includes("notes")) {
    return "notes";
  }

  if (type.includes("files") || type.includes("moved") || type.includes("renamed") || type.includes("thumbnail")) {
    return "files";
  }

  if (type.includes("export")) {
    return "export";
  }

  return "other";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function baseName(path: string | undefined) {
  return normalizeFolderPath(path).split("/").filter(Boolean).pop() ?? "";
}

function AssetContextMenu({
  canPaste,
  displayMode,
  isFavorite,
  sortMode,
  target,
  x,
  y,
  onCopy,
  onCut,
  onDuplicate,
  onDeleteAsset,
  onRenameAsset,
  onToggleFavorite,
  onOpenFolder,
  onRevealInExplorer,
  onRenameFolder,
  onDeleteFolder,
  onPaste,
  onCreateFolder,
  onCreateAsset,
  onSetSort,
  onSetDisplay
}: {
  canPaste: boolean;
  displayMode: AssetDisplayMode;
  isFavorite: boolean;
  sortMode: AssetSortMode;
  target: ContextTarget;
  x: number;
  y: number;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onDeleteAsset: () => void;
  onRenameAsset: () => void;
  onToggleFavorite: () => void;
  onOpenFolder: () => void;
  onRevealInExplorer: () => void;
  onRenameFolder: () => void;
  onDeleteFolder: () => void;
  onPaste: () => void;
  onCreateFolder: () => void;
  onCreateAsset: () => void;
  onSetSort: (mode: AssetSortMode) => void;
  onSetDisplay: (mode: AssetDisplayMode) => void;
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
          <button onClick={onRenameAsset} role="menuitem" type="button">
            <Pencil size={14} />
            Renommer
          </button>
          <button onClick={onToggleFavorite} role="menuitem" type="button">
            <Star size={14} />
            {isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          </button>
          <button onClick={onRevealInExplorer} role="menuitem" type="button">
            <ExternalLink size={14} />
            Afficher dans l'explorateur
          </button>
          <div className="context-divider" />
          <button onClick={onCopy} role="menuitem" type="button">
            <Copy size={14} />
            Copier
          </button>
          <button onClick={onCut} role="menuitem" type="button">
            <Scissors size={14} />
            Couper
          </button>
          <button onClick={onDuplicate} role="menuitem" type="button">
            <Files size={14} />
            Dupliquer
          </button>
          <div className="context-divider" />
          <button className="danger" onClick={onDeleteAsset} role="menuitem" type="button">
            <Trash2 size={14} />
            Supprimer
          </button>
        </>
      ) : target.kind === "folder" ? (
        <>
          <button onClick={onOpenFolder} role="menuitem" type="button">
            <FolderOpen size={14} />
            Ouvrir
          </button>
          <button onClick={onRevealInExplorer} role="menuitem" type="button">
            <ExternalLink size={14} />
            Afficher dans l'explorateur
          </button>
          <button onClick={onRenameFolder} role="menuitem" type="button">
            <Pencil size={14} />
            Renommer
          </button>
          {canPaste ? (
            <button onClick={onPaste} role="menuitem" type="button">
              <ClipboardPaste size={14} />
              Coller ici
            </button>
          ) : null}
          <div className="context-divider" />
          <button className="danger" onClick={onDeleteFolder} role="menuitem" type="button">
            <Trash2 size={14} />
            Supprimer
          </button>
        </>
      ) : (
        <>
          <button onClick={onCreateAsset} role="menuitem" type="button">
            <FilePlus size={14} />
            Nouvel asset
          </button>
          <button onClick={onCreateFolder} role="menuitem" type="button">
            <FolderPlus size={14} />
            Nouveau dossier
          </button>
          {canPaste ? (
            <button onClick={onPaste} role="menuitem" type="button">
              <ClipboardPaste size={14} />
              Coller
            </button>
          ) : null}
          <div className="context-divider" />
          <span className="context-label">Trier par</span>
          {([
            { value: "recent", label: "Recents" },
            { value: "name", label: "Nom" },
            { value: "status", label: "Statut" }
          ] as { value: AssetSortMode; label: string }[]).map((option) => (
            <button
              className={sortMode === option.value ? "context-option active" : "context-option"}
              key={option.value}
              onClick={() => onSetSort(option.value)}
              role="menuitemradio"
              aria-checked={sortMode === option.value}
              type="button"
            >
              <ArrowUpDown size={14} />
              {option.label}
              {sortMode === option.value ? <Check size={13} className="context-check" /> : null}
            </button>
          ))}
          <div className="context-divider" />
          <span className="context-label">Affichage</span>
          <button
            className={displayMode === "grid" ? "context-option active" : "context-option"}
            onClick={() => onSetDisplay("grid")}
            role="menuitemradio"
            aria-checked={displayMode === "grid"}
            type="button"
          >
            <Grid2X2 size={14} />
            Grille
            {displayMode === "grid" ? <Check size={13} className="context-check" /> : null}
          </button>
          <button
            className={displayMode === "list" ? "context-option active" : "context-option"}
            onClick={() => onSetDisplay("list")}
            role="menuitemradio"
            aria-checked={displayMode === "list"}
            type="button"
          >
            <List size={14} />
            Liste
            {displayMode === "list" ? <Check size={13} className="context-check" /> : null}
          </button>
        </>
      )}
    </div>
  );
}

function RenameDialog({
  current,
  title = "Renommer l'asset",
  onCancel,
  onSubmit
}: {
  current: string;
  title?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <div className="asset-modal-overlay" onClick={onCancel} role="presentation">
      <div className="asset-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
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

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="asset-modal-overlay" onClick={onCancel} role="presentation">
      <div className="asset-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <p className="soft-text">{message}</p>
        <div className="asset-modal-actions">
          <button className="secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="danger" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpotlightSearch({
  assets,
  folders,
  projectRoot,
  onClose,
  onOpenAsset,
  onOpenFolder
}: {
  assets: BlendUpAsset[];
  folders: { path: string; name: string; count: number }[];
  projectRoot?: string;
  onClose: () => void;
  onOpenAsset: (assetId: string) => void;
  onOpenFolder: (path: string) => void;
}) {
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const normalized = term.trim().toLowerCase();

  const assetResults = useMemo(() => {
    if (!normalized) {
      return assets.slice(0, 8);
    }
    return assets
      .filter((asset) => {
        const label = assetLabel(asset.displayName).toLowerCase();
        return (
          label.includes(normalized) ||
          asset.displayName.toLowerCase().includes(normalized) ||
          formatAssetType(asset.type).toLowerCase().includes(normalized)
        );
      })
      .slice(0, 12);
  }, [assets, normalized]);

  const folderResults = useMemo(() => {
    if (!normalized) {
      return folders.slice(0, 6);
    }
    return folders
      .filter((folder) => folder.name.toLowerCase().includes(normalized) || folder.path.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [folders, normalized]);

  const hasResults = assetResults.length > 0 || folderResults.length > 0;

  return (
    <div className="spotlight-overlay" onClick={onClose} role="presentation">
      <div
        className="spotlight-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Recherche projet"
      >
        <label className="spotlight-input">
          <Search size={20} />
          <input
            ref={inputRef}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Rechercher un asset ou un dossier dans tout le projet"
            type="search"
            value={term}
          />
        </label>

        <div className="spotlight-results">
          {folderResults.length > 0 ? (
            <div className="spotlight-group">
              <span className="eyebrow">Dossiers</span>
              {folderResults.map((folder) => (
                <button key={folder.path} onClick={() => onOpenFolder(folder.path)} type="button">
                  <Folder size={16} />
                  <span className="spotlight-result-main">
                    <strong>{folder.name}</strong>
                    <small>{folder.path}</small>
                  </span>
                  <span className="spotlight-result-count">{folder.count}</span>
                </button>
              ))}
            </div>
          ) : null}

          {assetResults.length > 0 ? (
            <div className="spotlight-group">
              <span className="eyebrow">Assets</span>
              {assetResults.map((asset) => (
                <button key={asset.id} onClick={() => onOpenAsset(asset.id)} type="button">
                  <AssetVisual asset={asset} projectRoot={projectRoot} small />
                  <span className="spotlight-result-main">
                    <strong>{assetLabel(asset.displayName)}</strong>
                    <small>{formatAssetType(asset.type)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {!hasResults ? <p className="soft-text spotlight-empty">Aucun resultat</p> : null}
        </div>
      </div>
    </div>
  );
}

function AssetSettingsPanel({
  assetNamingRules,
  assetRoots,
  assetTypePresets,
  onChange,
  onClose,
  onSaveAssetConfiguration,
  settings
}: {
  assetNamingRules: AssetNamingRules;
  assetRoots: string[];
  assetTypePresets: AssetTypePreset[];
  onChange: (settings: AssetSettings) => void;
  onClose: () => void;
  onSaveAssetConfiguration: (
    assetRoots: string[],
    assetTypePresets: AssetTypePreset[],
    assetNamingRules: AssetNamingRules
  ) => void;
  settings: AssetSettings;
}) {
  const [rootsDraft, setRootsDraft] = useState(assetRoots.join("\n"));
  const update = (patch: Partial<AssetSettings>) => onChange({ ...settings, ...patch });
  const roots = rootsDraft
    .split(/\r?\n/)
    .map((root) => normalizeFolderPath(root))
    .filter(Boolean);

  return (
    <div className="asset-modal-overlay" onClick={onClose} role="presentation">
      <div className="asset-settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="asset-settings-head">
          <h3>Parametres Assets</h3>
          <button className="icon-button" onClick={onClose} title="Fermer" type="button">
            <X size={16} />
          </button>
        </div>

        <label className="settings-field">
          <span>Dossiers racines</span>
          <textarea
            onChange={(event) => setRootsDraft(event.target.value)}
            placeholder="Art/Blender"
            rows={4}
            value={rootsDraft}
          />
        </label>

        <button
          disabled={roots.length === 0}
          onClick={() => onSaveAssetConfiguration(roots, assetTypePresets, assetNamingRules)}
          type="button"
        >
          Enregistrer les racines
        </button>

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
  assetType,
  currentPath,
  onCancel,
  typePresets,
  onSubmit
}: {
  assetType: AssetType;
  currentPath: string;
  onCancel: () => void;
  typePresets: AssetTypePreset[];
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
  const [notes, setNotes] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [textureImages, setTextureImages] = useState<string[]>([]);

  const technicalName = core.trim() ? buildAssetName(assetType, core, "_01", typePresets) : "";

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

        <div className="create-type-info">
          <span>Type</span>
          <strong>{labelForType(assetType, typePresets)}</strong>
          <small>defini par le dossier</small>
        </div>

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

function AssetVisual({
  asset,
  projectRoot,
  small = false
}: {
  asset: BlendUpAsset;
  projectRoot?: string;
  small?: boolean;
}) {
  const thumbnail = resolveThumbnailSrc(asset.paths.thumbnail, projectRoot, asset.updatedAt);

  if (thumbnail) {
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

function FolderPreview({
  assets,
  folderPath,
  projectRoot
}: {
  assets: BlendUpAsset[];
  folderPath: string;
  projectRoot?: string;
}) {
  const normalizedFolder = normalizeFolderPath(folderPath);
  const thumbnails = assets
    .filter((asset) => {
      const directory = assetDirectory(asset);
      return directory === normalizedFolder || directory.startsWith(`${normalizedFolder}/`);
    })
    .map((asset) => resolveThumbnailSrc(asset.paths.thumbnail, projectRoot, asset.updatedAt))
    .filter(Boolean)
    .slice(0, 4);

  if (thumbnails.length === 0) {
    return (
      <span className="folder-preview empty">
        <Folder size={22} />
      </span>
    );
  }

  return (
    <span className={`folder-preview count-${thumbnails.length}`}>
      {thumbnails.map((thumbnail, index) => (
        <img alt="" key={`${thumbnail}-${index}`} src={thumbnail} />
      ))}
    </span>
  );
}

function getAssetRoots(snapshot: ProjectSnapshot) {
  const configured = snapshot.project.assets?.roots?.map(normalizeFolderPath).filter(Boolean) ?? [];

  return configured.length > 0 ? configured : [normalizeFolderPath(snapshot.project.paths.blenderRoot)];
}

function resolveThumbnailSrc(path: string | undefined, projectRoot: string | undefined, cacheKey?: string) {
  if (!path) {
    return "";
  }

  if (isRenderableThumbnail(path)) {
    return path;
  }

  const normalizedPath = normalizeFolderPath(path);
  const absolutePath = path.match(/^[a-zA-Z]:[\\/]/)
    ? path
    : projectRoot
      ? `${projectRoot.replaceAll("\\", "/")}/${normalizedPath}`
      : "";

  if (!absolutePath) {
    return "";
  }

  try {
    const src = convertFileSrc(absolutePath);
    return cacheKey ? `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}` : src;
  } catch {
    return "";
  }
}

function breadcrumbParts(path: string, assetRoots: string[]) {
  const normalized = normalizeFolderPath(path);
  const roots = assetRoots.map(normalizeFolderPath).filter(Boolean);
  const root =
    roots
      .filter((candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`))
      .sort((left, right) => right.length - left.length)[0] ?? roots[0] ?? "";
  const rootLabel = root.split("/").filter(Boolean).pop() ?? "Assets";
  const crumbs = [{ label: rootLabel, path: root }];

  const relative =
    root && (normalized === root || normalized.startsWith(`${root}/`))
      ? normalized.slice(root.length).replace(/^\//, "")
      : "";

  let current = root;
  for (const part of relative.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  }

  return crumbs;
}

function mergeKnownFolders(assetFolders: string[], assets: BlendUpAsset[], assetRoots: string[]) {
  const folders = new Set<string>();

  for (const root of assetRoots) {
    folders.add(normalizeFolderPath(root));
  }

  for (const folder of assetFolders) {
    const normalized = normalizeFolderPath(folder);
    if (normalized) {
      folders.add(normalized);
    }
  }

  for (const asset of assets) {
    const directory = assetDirectory(asset);
    if (directory) {
      folders.add(directory);
    }

    const assetFolderPath = normalizeFolderPath(asset.paths.assetFolder);
    if (assetFolderPath) {
      folders.add(assetFolderPath);
    }
  }

  return Array.from(folders).sort((left, right) => left.localeCompare(right));
}

function foldersForPath(assets: BlendUpAsset[], folderPaths: string[], path: string) {
  const normalizedPath = normalizeFolderPath(path);
  const folders = new Map<string, { name: string; path: string; assetCount: number }>();

  for (const directory of folderPaths) {
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
    if (!folders.has(childPath)) {
      folders.set(childPath, { name: childName, path: childPath, assetCount: 0 });
    }
  }

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

  return assets.filter(
    (asset) => assetDirectory(asset) === normalizedPath || normalizeFolderPath(asset.paths.assetFolder) === normalizedPath
  );
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

  const owners = assetPeople(asset);

  if (owners.length === 0) {
    return member.roles.includes("artist") || member.roles.includes("art_director");
  }

  return owners.includes(member.name);
}

function ownerNames(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

function assetPeople(asset: BlendUpAsset): string[] {
  return Array.from(
    new Set([
      ...ownerNames(asset.owners.artist),
      ...ownerNames(asset.owners.developer),
      ...ownerNames(asset.owners.reviewer)
    ])
  );
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
