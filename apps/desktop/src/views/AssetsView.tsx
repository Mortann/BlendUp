import { CheckCircle2, ChevronRight, Clock, Folder, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { assetLabel, renameCore } from "../blendup/naming";
import { useShortcuts, type ShortcutBindings } from "../app/shortcuts";
import { loadTeamMembers } from "../app/people";
import type { RoleCapabilities } from "../blendup/roles";
import type {
  AssetStatus,
  AssetLod,
  AssetNamingRules,
  AssetTypePreset,
  AssetVariant,
  BlendUpAsset,
  BlendUpProblem,
  ProjectSnapshot
} from "../blendup/types";
import {
  AssetContextMenu,
  AssetSettingsPanel,
  ConfirmDialog,
  CreateAssetDialog,
  CreateFolderDialog,
  RenameDialog,
  SpotlightSearch
} from "./assets/AssetControls";
import { ArtistAssetCard } from "./assets/AssetCards";
import { ArtistAssetDetail } from "./assets/AssetDetail";
import { AssetVisualizationWindow } from "./assets/AssetVisualization";
import { AssetVisual, FolderPreview } from "./assets/AssetVisuals";
import {
  artistStatuses,
  type AssetDisplayMode,
  type AssetQuickFilter,
  type AssetSettings,
  type AssetSortMode,
  type ClipboardEntry,
  type ContextMenuState,
  type ContextTarget
} from "./assets/model";
import {
  loadAssetExplorerPath,
  loadAssetFavorites,
  loadAssetSettings,
  loadRecentFolders,
  saveAssetExplorerPath,
  saveAssetFavorites,
  saveAssetSettings,
  saveRecentFolders
} from "./assets/preferences";
import {
  assetDirectory,
  breadcrumbParts,
  filterArtistAssets,
  foldersForPath,
  getActiveMember,
  getAssetRoots,
  mergeKnownFolders,
  normalizeArtistStatus,
  normalizeFolderPath,
  typeForPath
} from "./assets/utils";

export function AssetsView({
  capabilities,
  filteredAssets,
  onChangeAssetStatus,
  onRenameAsset,
  onMoveAsset,
  onMoveFolder,
  onDeleteAsset,
  onSetAssetOwners,
  onUpdateAssetNotes,
  onCreateAsset,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onDuplicateAsset,
  onPasteAsset,
  onSetLods,
  onSaveAssetConfiguration,
  onSetVariants,
  shortcutBindings,
  onOpenInBlender,
  onOpenContentPath,
  problems,
  selectedAsset,
  selectedProblems,
  setShowBlenderCommandPrompt,
  setSelectedAssetId,
  showBlenderCommandPrompt,
  snapshot
}: {
  capabilities: RoleCapabilities;
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
    owners: { artist: string[]; reviewer: string | null },
    actor: string
  ) => void;
  onUpdateAssetNotes: (assetId: string, artistNotes: string, actor: string) => void;
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
  onSetLods: (assetId: string, lods: AssetLod[], actor: string) => void;
  onSaveAssetConfiguration: (
    assetRoots: string[],
    assetTypePresets: AssetTypePreset[],
    assetNamingRules: AssetNamingRules
  ) => void;
  onSetVariants: (assetId: string, variants: AssetVariant[], actor: string) => void;
  shortcutBindings: ShortcutBindings;
  onOpenInBlender: (assetId: string) => void;
  onOpenContentPath: (relativePath: string) => void;
  problems: BlendUpProblem[];
  selectedAsset?: BlendUpAsset;
  selectedProblems: BlendUpProblem[];
  setShowBlenderCommandPrompt: (show: boolean) => void;
  setSelectedAssetId: (assetId: string) => void;
  showBlenderCommandPrompt: boolean;
  snapshot: ProjectSnapshot;
}) {
  const projectId = snapshot.project.projectId;
  const [settings, setSettings] = useState<AssetSettings>(() => loadAssetSettings(projectId));
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
  const [visualizationAssetId, setVisualizationAssetId] = useState<string | null>(null);
  const activeMember = useMemo(() => getActiveMember(projectId), [projectId]);
  const members = useMemo(() => loadTeamMembers(projectId), [projectId]);
  const actorName = activeMember?.name ?? "BlendUp";
  const visualizationAsset = visualizationAssetId
    ? snapshot.assets.find((asset) => asset.id === visualizationAssetId)
    : undefined;

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
    if (visualizationAssetId && !snapshot.assets.some((asset) => asset.id === visualizationAssetId)) {
      setVisualizationAssetId(null);
    }
  }, [snapshot.assets, visualizationAssetId]);

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

  const visibleAssets = useMemo(() => {
    const assets = filterArtistAssets(filteredAssets, currentPath, quickFilter, favoriteAssetIds);

    return [...assets].sort((left, right) => {
      if (sortMode === "recent") {
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      }

      if (sortMode === "status") {
        return left.status.localeCompare(right.status) || left.displayName.localeCompare(right.displayName);
      }

      return left.displayName.localeCompare(right.displayName);
    });
  }, [currentPath, favoriteAssetIds, filteredAssets, quickFilter, sortMode]);
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
    <section className="assets-page role-page assets-page--artist" aria-label="Assets">
      <div className="asset-library-header">
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
              onSetShowBlenderCommandPrompt={setShowBlenderCommandPrompt}
              settings={settings}
              showBlenderCommandPrompt={showBlenderCommandPrompt}
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

      {selectedAsset ? (
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
            onSetLods={(lods) => onSetLods(selectedAsset.id, lods, actorName)}
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
            onVisualize={() => setVisualizationAssetId(selectedAsset.id)}
            problems={selectedProblems}
            activity={snapshot.activity.filter((event) => event.assetId === selectedAsset.id)}
            currentBranch={snapshot.gitStatus.branch}
            projectRoot={snapshot.projectRoot}
          />
        </div>
      ) : null}

      {visualizationAsset ? (
        <AssetVisualizationWindow
          asset={visualizationAsset}
          onClose={() => setVisualizationAssetId(null)}
          projectRoot={snapshot.projectRoot}
        />
      ) : null}

      {isSpotlightOpen ? (
        <SpotlightSearch
          assets={filteredAssets}
          folders={allFolders}
          projectRoot={snapshot.projectRoot}
          onClose={() => setIsSpotlightOpen(false)}
          onOpenAsset={(assetId) => {
            setSelectedAssetId(assetId);
            setIsSpotlightOpen(false);
          }}
          onOpenFolder={(path) => {
            openFolder(path);
            setIsSpotlightOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}


