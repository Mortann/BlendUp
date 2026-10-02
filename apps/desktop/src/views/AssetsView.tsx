import {
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  FileBox,
  FolderCog,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Heart,
  LayoutList,
  List,
  LoaderCircle,
  Move,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Upload,
  X
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { AssetLod, AssetMutationResult, AssetVariant, BlendUpAsset, ProjectSnapshot } from "../blendup/types";
import { AssetCard, FolderCard } from "./assets/AssetVisual";
import { ShowcaseCard } from "./assets/ShowcaseCard";
import type { AssetDialogState, AssetExplorerSettings, AssetQuickFilter, ClipboardEntry, ContextMenuState, ContextTarget } from "./assets/model";
import {
  loadCollapsedFolders,
  saveCollapsedFolders,
  loadExplorerPath,
  loadExplorerSettings,
  loadFavorites,
  loadRecentFolders,
  saveExplorerPath,
  saveExplorerSettings,
  saveFavorites,
  saveRecentFolders
} from "./assets/preferences";
import {
  assetHasError,
  assetMatchesFilter,
  assetBrowserFolder,
  baseName,
  breadcrumbParts,
  directChildFolders,
  explorerFolders,
  folderAssetCount,
  isOwnedAssetFolder,
  normalizePath,
  parentPath,
  sortAssets
} from "./assets/utils";

import { explorerShortcut, shortcutLabels, visibleNavigationFolders } from "./assets/shortcuts";
import { folderHistoryPath, recordFolderNavigation } from "./assets/history";

const AssetDetail = lazy(() => import("./assets/AssetDetail").then((module) => ({ default: module.AssetDetail })));

type Mutation = Promise<AssetMutationResult | null>;

export function AssetsView({
  onConfigureShowcase, onRebuildShowcase, onOpenShowcase, showcaseBusyIds,
  checkingUvAssetIds,
  onCheckUv,
  exportingAssetIds,
  onAddAssetImages,
  onCopyAsset,
  onCreateAsset,
  onCreateAssetVariant,
  onCreateFolder,
  onDeleteAsset,
  onDeleteAssetVersion,
  onDeleteFolder,
  onDuplicateAsset,
  onExportAsset,
  onExportAssetVersion,
  onExportAssetVersions,
  onGenerateAssetLods,
  onMoveAsset,
  onMoveFolder,
  onOpenAsset,
  onOpenAssetPath,
  onOpenPath,
  onOrganizeAsset,
  onRenameAsset,
  onRenameFolder,
  onSetAssetThumbnail,
  onUpdateAssetMetadata,
  onSetAssetUvIgnored,
  revealAssetRequest,
  onAssetRevealed,
  openingAsset,
  selectedAssetId,
  setSelectedAssetId,
  snapshot
}: {
  onConfigureShowcase: (folder: string, enabled: boolean, spacing?: number) => Promise<void>;
  onRebuildShowcase: (id: string) => Promise<boolean>;
  onOpenShowcase: (id: string, editor: "blender" | "godot") => Promise<void>;
  showcaseBusyIds: string[];
  checkingUvAssetIds: string[];
  onCheckUv: (assetId: string) => Promise<boolean>;
  exportingAssetIds: string[];
  onAddAssetImages: (assetId: string, kind: "renders" | "textures") => Promise<void>;
  onCopyAsset: (assetId: string, targetDir: string, move: boolean) => Mutation;
  onCreateAsset: (parentDir: string, name: string) => Mutation;
  onCreateAssetVariant: (assetId: string, name: string) => Mutation;
  onCreateFolder: (parentDir: string, name: string) => Mutation;
  onDeleteAsset: (assetId: string) => Mutation;
  onDeleteAssetVersion: (assetId: string, versionId: string, versionKind: "variant" | "lod") => Mutation;
  onDeleteFolder: (folder: string) => Mutation;
  onDuplicateAsset: (assetId: string) => Mutation;
  onExportAsset: (assetId: string) => Promise<boolean>;
  onExportAssetVersion: (assetId: string, versionId: string, versionKind: "variant" | "lod") => Promise<boolean>;
  onExportAssetVersions: (assetId: string) => Promise<boolean>;
  onGenerateAssetLods: (assetId: string) => Mutation;
  onMoveAsset: (assetId: string, targetDir: string) => Mutation;
  onMoveFolder: (folder: string, targetDir: string) => Mutation;
  onOpenAsset: (asset: BlendUpAsset) => void;
  onOpenAssetPath: (relativePath: string) => void;
  onOpenPath: (path: string) => void;
  onOrganizeAsset: (assetId: string) => Mutation;
  onRenameAsset: (assetId: string, newName: string) => Mutation;
  onRenameFolder: (folder: string, newName: string) => Mutation;
  onSetAssetThumbnail: (assetId: string) => Promise<void>;
  onUpdateAssetMetadata: (assetId: string, notes: string, tags: string[], variants: AssetVariant[], lods: AssetLod[]) => Mutation;
  onSetAssetUvIgnored: (assetId: string, ignored: boolean) => Mutation;
  revealAssetRequest: { assetId: string; serial: number } | null;
  onAssetRevealed: () => void;
  openingAsset: boolean;
  selectedAssetId: string | null;
  setSelectedAssetId: (assetId: string | null) => void;
  snapshot: ProjectSnapshot;
}) {
  const standalone = snapshot.project.engine === "none";
  const projectId = snapshot.project.projectId;
  const allFolderPaths = useMemo(
    () => Array.from(new Set([snapshot.project.paths.artRoot, ...snapshot.assetFolders].map(normalizePath))),
    [snapshot.assetFolders, snapshot.project.paths.artRoot]
  );
  const folderModel = useMemo(
    () => explorerFolders(allFolderPaths, snapshot.assets, snapshot.project.paths.artRoot),
    [allFolderPaths, snapshot.assets, snapshot.project.paths.artRoot]
  );
  const folders = folderModel.folders;
  const explorerRoot = folderModel.root;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetQuickFilter>("all");
  const [settings, setSettings] = useState<AssetExplorerSettings>(() => loadExplorerSettings(projectId));
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites(projectId));
  const [currentPath, setCurrentPath] = useState(() => loadExplorerPath(projectId) || explorerRoot);
  const currentShowcase = snapshot.showcases?.find((scene) => normalizePath(scene.folder) === currentPath);
  const showShowcase = !!currentShowcase && !query && filter === "all";
  const [recentFolders, setRecentFolders] = useState<string[]>(() => loadRecentFolders(projectId));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<AssetDialogState>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const duplicating = useRef(false);
  const [collapsedFolders, setCollapsedFolders] = useState(() => loadCollapsedFolders(projectId));
  const [activeTarget, setActiveTarget] = useState<ContextTarget>({ kind: "folder", path: currentPath });
  const navigationFolders = visibleNavigationFolders(folders, collapsedFolders);
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);
  const selectedAsset = snapshot.assets.find((asset) => asset.id === selectedAssetId) ?? null;

  useEffect(() => {
    setCollapsedFolders(loadCollapsedFolders(projectId));
    setActiveTarget({ kind: "background" });
    setSettings(loadExplorerSettings(projectId));
    setFavorites(loadFavorites(projectId));
    const stored = loadExplorerPath(projectId);
    const initial = stored && folders.includes(stored) ? stored : explorerRoot;
    setCurrentPath(initial);
    recordFolderNavigation(window.history, projectId, initial, true);
    setRecentFolders(loadRecentFolders(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!folders.includes(normalizePath(currentPath))) {
      setCurrentPath(explorerRoot);
      setActiveTarget({ kind: "background" });
      saveExplorerPath(projectId, explorerRoot);
      recordFolderNavigation(window.history, projectId, explorerRoot, true);
    }
  }, [currentPath, explorerRoot, folders, projectId]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("blur", close); };
  }, []);

  const updateSettings = (patch: Partial<AssetExplorerSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveExplorerSettings(projectId, next);
  };
  const updateCollapsedFolders = (next: string[]) => {
    setCollapsedFolders(next);
    saveCollapsedFolders(projectId, next);
  };
  const navigate = (path: string, fromHistory = false, selectAssetId: string | null = null) => {
    const normalized = normalizePath(path);
    if (!fromHistory) recordFolderNavigation(window.history, projectId, normalized);
    setCurrentPath(normalized);
    setQuery("");
    setFilter("all");
    setContextMenu(null);
    setActiveTarget({ kind: "folder", path: normalized });
    updateCollapsedFolders(collapsedFolders.filter((folder) => !normalized.startsWith(`${folder}/`)));
    saveExplorerPath(projectId, normalized);
    const next = [normalized, ...recentFolders.filter((folder) => folder !== normalized)].slice(0, 5);
    setRecentFolders(next);
    saveRecentFolders(projectId, next);
    setSelectedAssetId(selectAssetId);
  };

  useEffect(() => {
    if (!revealAssetRequest) return;
    const asset = snapshot.assets.find((item) => item.id === revealAssetRequest.assetId);
    if (asset) navigate(assetBrowserFolder(asset), false, asset.id);
    onAssetRevealed();
  }, [revealAssetRequest]);

  useEffect(() => {
    if (!selectedAssetId) return;
    const frame = window.requestAnimationFrame(() => document.querySelector(".explorer-asset.selected")?.scrollIntoView({ block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [currentPath, selectedAssetId]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const path = folderHistoryPath(event.state, projectId);
      if (path !== null) {
        const target = folders.includes(path) ? path : explorerRoot;
        if (target !== path) recordFolderNavigation(window.history, projectId, target, true);
        navigate(target, true);
      }
    };
    const preventMouseNavigation = (event: globalThis.MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    const onMouseUp = (event: globalThis.MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      if (!dialog && !openingAsset) window.history.go(event.button === 3 ? -1 : 1);
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("mousedown", preventMouseNavigation, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("auxclick", preventMouseNavigation, true);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("mousedown", preventMouseNavigation, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("auxclick", preventMouseNavigation, true);
    };
  });
  const toggleFavorite = (assetId: string) => {
    const next = favorites.includes(assetId) ? favorites.filter((id) => id !== assetId) : [...favorites, assetId];
    setFavorites(next);
    saveFavorites(projectId, next);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleFolders = useMemo(() => {
    if (normalizedQuery || filter !== "all" && filter !== "favorites") return [];
    return directChildFolders(folders, currentPath).filter((folder) => !settings.hideEmptyFolders || folderAssetCount(snapshot.assets, folder) > 0);
  }, [currentPath, filter, folders, normalizedQuery, settings.hideEmptyFolders, snapshot.assets]);
  const visibleAssets = useMemo(() => sortAssets(snapshot.assets.filter((asset) => {
    const inFolder = normalizedQuery || filter !== "all"
      ? true
      : assetBrowserFolder(asset) === normalizePath(currentPath);
    const matchesQuery = !normalizedQuery || `${asset.name} ${asset.folder} ${asset.sourcePath} ${asset.metadata.tags.join(" ")}`.toLowerCase().includes(normalizedQuery);
    return inFolder && matchesQuery && assetMatchesFilter(asset, filter, favorites);
  }), settings.sortMode), [currentPath, favorites, filter, normalizedQuery, settings.sortMode, snapshot.assets]);

  const pendingCount = snapshot.assets.filter((asset) => asset.status !== "exported" && asset.status !== "local").length;
  useEffect(() => { setFilter("all"); }, [snapshot.project.engine]);
  const dropOnFolder = (event: DragEvent, target: string) => {
    event.preventDefault();
    event.stopPropagation();
    const assetId = event.dataTransfer.getData("application/x-blendup-asset");
    const folder = event.dataTransfer.getData("application/x-blendup-folder");
    if (assetId) void onMoveAsset(assetId, target);
    else if (folder && folder !== target) void onMoveFolder(folder, target);
  };
  const beginFolderDrag = (event: DragEvent, folder: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-blendup-folder", folder);
  };
  const openMenu = (event: MouseEvent, target: ContextMenuState["target"]) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveTarget(target);
    setSelectedAssetId(target.kind === "asset" ? target.assetId : null);
    setContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 298)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 490)), target });
  };

  const deleteAsset = (asset: BlendUpAsset) => {
    if (window.confirm(`Placer « ${asset.name} » dans la corbeille ?`)) void onDeleteAsset(asset.id).then((result) => { if (result) setSelectedAssetId(null); });
  };
  const deleteFolder = (folder: string) => {
    if (window.confirm(`Placer le dossier « ${baseName(folder)} » et son contenu dans la corbeille ?`)) void onDeleteFolder(folder);
  };
  const offerRename = (result: AssetMutationResult | null) => {
    if (result?.asset) setDialog({ kind: "renameAsset", assetId: result.asset.id, initialValue: result.asset.name });
  };
  const duplicate = async (assetId: string) => {
    if (duplicating.current) return;
    duplicating.current = true;
    try { offerRename(await onDuplicateAsset(assetId)); }
    finally { duplicating.current = false; }
  };
  const paste = async (target = currentPath) => {
    if (!clipboard || duplicating.current) return;
    duplicating.current = true;
    try {
      const result = await onCopyAsset(clipboard.assetId, target, clipboard.mode === "cut");
      if (!result) return;
      if (clipboard.mode === "cut") setClipboard(null);
      else offerRename(result);
    } finally { duplicating.current = false; }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (event.defaultPrevented || dialog || openingAsset || element?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], .modal-backdrop")) return;
      const action = explorerShortcut(event);
      if (!action) return;
      if (action === "open" && element?.closest("button, a, summary") && (!contextMenu || element.closest("[role='menuitem']"))) return;
      const target = contextMenu?.target ?? (selectedAsset ? { kind: "asset" as const, assetId: selectedAsset.id } : activeTarget);
      const asset = target.kind === "asset" ? snapshot.assets.find((item) => item.id === target.assetId) : null;
      const folder = target.kind === "folder" ? target.path : currentPath;
      if (["rename", "delete"].includes(action) && !asset && (target.kind !== "folder" || folder === explorerRoot)) return;
      if (["duplicate", "copy", "cut"].includes(action) && !asset) return;
      if (action === "paste" && !clipboard) return;
      event.preventDefault();
      setContextMenu(null);
      switch (action) {
        case "rename": setDialog(asset ? { kind: "renameAsset", assetId: asset.id, initialValue: asset.name } : { kind: "renameFolder", folder, initialValue: baseName(folder) }); break;
        case "duplicate": if (asset) void duplicate(asset.id); break;
        case "copy": case "cut": if (asset) setClipboard({ assetId: asset.id, mode: action }); break;
        case "paste": paste(folder); break;
        case "delete": if (asset) deleteAsset(asset); else deleteFolder(folder); break;
        case "open": if (asset) onOpenAsset(asset); else { setFilter("all"); navigate(folder); } break;
        case "reveal": onOpenPath(asset?.sourcePath ?? folder); break;
        case "search": searchInput.current?.focus(); searchInput.current?.select(); break;
        case "createAsset": setDialog({ kind: "createAsset", parent: folder }); break;
        case "createFolder": setDialog({ kind: "createFolder", parent: folder }); break;
        case "parent": if (currentPath !== explorerRoot) { setFilter("all"); navigate(parentPath(currentPath)); } break;
        case "back": window.history.back(); break;
        case "forward": window.history.forward(); break;
        case "close": if (!contextMenu) { setSelectedAssetId(null); setActiveTarget({ kind: "background" }); } break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className={`assets-workspace ${selectedAsset ? "has-detail" : ""}`}>
      <div className="view-page assets-page">
        <section className="asset-explorer content-panel" onContextMenu={(event) => openMenu(event, { kind: "background" })}>
          <aside className="asset-browser-sidebar">
            <div className="asset-sidebar-title">Navigation</div>
              <SidebarSection label="Bibliothèque">
                <SidebarButton active={filter === "all"} icon={<FileBox size={15} />} label="Tous les assets" onClick={() => { setFilter("all"); navigate(explorerRoot); }} count={snapshot.assets.length} />
                <SidebarButton active={filter === "favorites"} icon={<Heart size={15} />} label="Favoris" onClick={() => setFilter("favorites")} count={favorites.length} />
                {!standalone ? <SidebarButton active={filter === "pending"} icon={<Upload size={15} />} label="À exporter" onClick={() => setFilter("pending")} count={pendingCount} /> : null}
                <SidebarButton active={filter === "errors"} icon={<TriangleAlert size={15} />} label="Erreurs" onClick={() => setFilter("errors")} count={snapshot.assets.filter(assetHasError).length} />
              </SidebarSection>
              <SidebarSection label="Dossiers">
                {navigationFolders.map((folder) => {
                  const hasChildren = folders.some((child) => parentPath(child) === folder);
                  const collapsed = collapsedFolders.includes(folder);
                  return <div className="folder-tree-item" key={folder} style={{ paddingLeft: `${Math.max(0, folder.split("/").length - explorerRoot.split("/").length) * 13}px` }}>
                    {hasChildren ? <button className="folder-toggle" aria-label={`${collapsed ? "Déplier" : "Replier"} ${baseName(folder)}`} aria-expanded={!collapsed} onClick={() => updateCollapsedFolders(collapsed ? collapsedFolders.filter((path) => path !== folder) : [...collapsedFolders, folder])} type="button">{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="folder-toggle-placeholder" />}
                    <button className={`folder-tree-row ${currentPath === folder && filter === "all" ? "active" : ""}`} draggable={folder !== explorerRoot} onClick={() => { setFilter("all"); navigate(folder); }} onContextMenu={(event) => openMenu(event, { kind: "folder", path: folder })} onDragOver={(event) => event.preventDefault()} onDragStart={(event) => beginFolderDrag(event, folder)} onDrop={(event) => dropOnFolder(event, folder)} type="button"><FolderOpen size={14} /><span>{baseName(folder)}</span><b>{folderAssetCount(snapshot.assets, folder)}</b></button>
                  </div>;
                })}
              </SidebarSection>
              {recentFolders.some((folder) => folders.includes(folder)) ? <SidebarSection label="Récents">{recentFolders.filter((folder) => folders.includes(folder)).slice(0, 4).map((folder) => <button className="recent-folder" key={folder} onClick={() => navigate(folder)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnFolder(event, folder)} type="button"><ArchiveRestore size={13} /><span>{folder}</span></button>)}</SidebarSection> : null}
          </aside>

          <div className="asset-browser-main">
            <div className="asset-browser-toolbar">
              <label className="search-field"><Search size={16} /><input ref={searchInput} onChange={(event) => setQuery(event.target.value)} title={`Rechercher (${shortcutLabels.search})`} placeholder="Rechercher un asset ou un dossier…" value={query} />{query ? <button aria-label="Effacer" onClick={() => setQuery("")} type="button"><X size={14} /></button> : null}</label>
              <div className="browser-actions">
                <button className="showcase-toggle" disabled={currentShowcase?.status === "generating"} title={currentShowcase ? "Désactiver le Showcase de ce dossier" : "Créer un Showcase de ce dossier et de ses sous-dossiers"} aria-pressed={!!currentShowcase} onClick={() => void onConfigureShowcase(currentPath, !currentShowcase)} type="button"><FileBox size={18} /><span className="showcase-toggle-label">Showcase</span></button>
              <button onClick={() => setDialog({ kind: "createFolder", parent: currentPath })} title={`Nouveau dossier (${shortcutLabels.createFolder})`} type="button"><FolderPlus size={16} /></button>
                <button className="primary" onClick={() => setDialog({ kind: "createAsset", parent: currentPath })} title={`Nouvel asset (${shortcutLabels.createAsset})`} type="button"><Plus size={16} /> Asset</button>
              </div>
            </div>
            <div className="asset-view-options">
              <div className="breadcrumbs" title={currentPath}>
                <details className="breadcrumb-ancestors"><summary aria-label="Dossiers parents">…</summary><div>{breadcrumbParts(currentPath).filter((part) => part.path === explorerRoot || part.path.startsWith(`${explorerRoot}/`)).map((part) => <button key={part.path} onClick={(event) => { setFilter("all"); navigate(part.path); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">{part.label}</button>)}</div></details>
                {breadcrumbParts(currentPath).filter((part) => part.path === explorerRoot || part.path.startsWith(`${explorerRoot}/`)).map((part, index) => <span key={part.path}>{index ? <ChevronRight size={13} /> : null}<button onClick={() => { setFilter("all"); navigate(part.path); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnFolder(event, part.path)} type="button">{part.label}</button></span>)}
              </div>
              <span>{visibleFolders.length + visibleAssets.length + (showShowcase ? 1 : 0)} élément{visibleFolders.length + visibleAssets.length + (showShowcase ? 1 : 0) > 1 ? "s" : ""}</span>
              {filter !== "all" ? <button className="active-filter" onClick={() => setFilter("all")} type="button">{filterLabel(filter)} <X size={13} /></button> : null}
              {clipboard ? <button className="active-filter" onClick={() => paste()} type="button"><Clipboard size={13} /> Coller {clipboard.mode === "cut" ? "ici" : "une copie"}</button> : null}
              <div className="view-option-group">
                <select aria-label="Trier les assets" onChange={(event) => updateSettings({ sortMode: event.target.value as AssetExplorerSettings["sortMode"] })} value={settings.sortMode}><option value="recent">Plus récents</option><option value="name">Nom</option><option value="status">État</option><option value="size">Taille</option></select>
                <select aria-label="Taille des miniatures" onChange={(event) => updateSettings({ thumbnailSize: event.target.value as AssetExplorerSettings["thumbnailSize"] })} value={settings.thumbnailSize}><option value="small">Petites</option><option value="medium">Moyennes</option><option value="large">Grandes</option></select>
                <button className={settings.hideEmptyFolders ? "active" : ""} onClick={() => updateSettings({ hideEmptyFolders: !settings.hideEmptyFolders })} title="Masquer les dossiers vides" type="button"><SlidersHorizontal size={15} /></button>
                <button className={settings.displayMode === "grid" ? "active" : ""} onClick={() => updateSettings({ displayMode: "grid" })} title="Grille" type="button"><Grid2X2 size={15} /></button>
                <button className={settings.displayMode === "list" ? "active" : ""} onClick={() => updateSettings({ displayMode: "list" })} title="Liste" type="button"><LayoutList size={15} /></button>
                <button className={settings.displayMode === "compact" ? "active" : ""} onClick={() => updateSettings({ displayMode: "compact" })} title="Compact" type="button"><List size={15} /></button>
              </div>
              <details className="compact-view-options"><summary title="Filtres et affichage"><SlidersHorizontal size={16} /><span>Affichage</span></summary>
              <div className="view-option-group">
                <select aria-label="Trier les assets" onChange={(event) => updateSettings({ sortMode: event.target.value as AssetExplorerSettings["sortMode"] })} value={settings.sortMode}><option value="recent">Plus récents</option><option value="name">Nom</option><option value="status">État</option><option value="size">Taille</option></select>
                <select aria-label="Taille des miniatures" onChange={(event) => updateSettings({ thumbnailSize: event.target.value as AssetExplorerSettings["thumbnailSize"] })} value={settings.thumbnailSize}><option value="small">Petites</option><option value="medium">Moyennes</option><option value="large">Grandes</option></select>
                <button className={settings.hideEmptyFolders ? "active" : ""} onClick={() => updateSettings({ hideEmptyFolders: !settings.hideEmptyFolders })} title="Masquer les dossiers vides" type="button"><SlidersHorizontal size={15} /></button>
                <button className={settings.displayMode === "grid" ? "active" : ""} onClick={() => updateSettings({ displayMode: "grid" })} title="Grille" type="button"><Grid2X2 size={15} /></button>
                <button className={settings.displayMode === "list" ? "active" : ""} onClick={() => updateSettings({ displayMode: "list" })} title="Liste" type="button"><LayoutList size={15} /></button>
                <button className={settings.displayMode === "compact" ? "active" : ""} onClick={() => updateSettings({ displayMode: "compact" })} title="Compact" type="button"><List size={15} /></button>
              </div>
              </details>
            </div>

            {visibleFolders.length || visibleAssets.length || showShowcase ? (
              <div className={`asset-items ${settings.displayMode} thumb-${settings.thumbnailSize}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnFolder(event, currentPath)}>
                {visibleFolders.map((folder) => <FolderCard assetCount={folderAssetCount(snapshot.assets, folder)} displayMode={settings.displayMode} key={folder} name={baseName(folder)} onContextMenu={(event) => openMenu(event, { kind: "folder", path: folder })} onDropAsset={(assetId) => void onMoveAsset(assetId, folder)} onDropFolder={(source) => void onMoveFolder(source, folder)} onOpen={() => navigate(folder)} onSelect={() => { setSelectedAssetId(null); setActiveTarget({ kind: "folder", path: folder }); }} path={folder} previewAssets={snapshot.assets.filter((asset) => assetBrowserFolder(asset) === folder || assetBrowserFolder(asset).startsWith(`${folder}/`)).slice(0, 4)} projectRoot={snapshot.projectRoot} thumbnailSize={settings.thumbnailSize} />)}
                {visibleAssets.map((asset) => <AssetCard asset={asset} displayMode={settings.displayMode} exporting={exportingAssetIds.includes(asset.id)} favorite={favorites.includes(asset.id)} key={asset.id} onContextMenu={(event) => openMenu(event, { kind: "asset", assetId: asset.id })} onExport={() => void (standalone ? onExportAsset(asset.id) : onExportAssetVersions(asset.id))} onOpen={() => onOpenAsset(asset)} onSelect={() => setSelectedAssetId(asset.id)} onToggleFavorite={() => toggleFavorite(asset.id)} projectRoot={snapshot.projectRoot} selected={asset.id === selectedAssetId} thumbnailSize={settings.thumbnailSize} />)}
                {showShowcase && currentShowcase ? <ShowcaseCard key={currentShowcase.id} scene={currentShowcase} busy={showcaseBusyIds.includes(currentShowcase.id)} onOpen={(editor) => void onOpenShowcase(currentShowcase.id, editor)} onRefresh={() => void onRebuildShowcase(currentShowcase.id)} onConfigure={(enabled, spacing) => void onConfigureShowcase(currentPath, enabled, spacing)} onExportMissing={async () => { for (const asset of snapshot.assets.filter((asset) => (assetBrowserFolder(asset) === currentPath || assetBrowserFolder(asset).startsWith(`${currentPath}/`)) && asset.status !== "exported")) await onExportAsset(asset.id); }} /> : null}
              </div>
            ) : (
              <div className="empty-state"><FileBox size={35} /><h2>{query || filter !== "all" ? "Aucun résultat" : "Ce dossier est vide"}</h2><p>{query ? "Essaie une recherche plus large." : "Crée un asset Blender ou un dossier pour commencer."}</p>{!query && filter === "all" ? <div className="button-row"><button onClick={() => setDialog({ kind: "createFolder", parent: currentPath })} type="button"><FolderPlus size={15} /> Dossier</button><button className="primary" onClick={() => setDialog({ kind: "createAsset", parent: currentPath })} type="button"><Plus size={15} /> Asset</button></div> : null}</div>
            )}
          </div>
        </section>
      </div>

      {selectedAsset ? (
        <Suspense fallback={<aside className="asset-detail asset-detail-loading"><LoaderCircle className="spin" size={22} /><span>Chargement de l'aperçu…</span></aside>}>
          <AssetDetail
            checkingUv={checkingUvAssetIds.includes(selectedAsset.id)}
            onCheckUv={() => void onCheckUv(selectedAsset.id)}
            onSetUvIgnored={(ignored) => onSetAssetUvIgnored(selectedAsset.id, ignored)}
            asset={selectedAsset}
            exporting={exportingAssetIds.includes(selectedAsset.id)}
            onAddImages={(kind) => void onAddAssetImages(selectedAsset.id, kind)}
            onClose={() => { setSelectedAssetId(null); setActiveTarget({ kind: "background" }); }}
            onCreateVariant={(name) => onCreateAssetVariant(selectedAsset.id, name)}
            onDeleteVersion={(versionId, versionKind) => onDeleteAssetVersion(selectedAsset.id, versionId, versionKind)}
            onExport={() => void onExportAsset(selectedAsset.id)}
            onExportAll={() => void onExportAssetVersions(selectedAsset.id)}
            onExportVersion={(versionId, versionKind) => void onExportAssetVersion(selectedAsset.id, versionId, versionKind)}
            onGenerateLods={() => onGenerateAssetLods(selectedAsset.id)}
            onOpen={() => onOpenAsset(selectedAsset)}
            onOpenPath={onOpenPath}
            onOpenVersion={onOpenAssetPath}
            onSave={(notes, tags, variants, lods) => onUpdateAssetMetadata(selectedAsset.id, notes, tags, variants, lods)}
            onSetThumbnail={() => void onSetAssetThumbnail(selectedAsset.id)}
            projectRoot={snapshot.projectRoot}
          />
        </Suspense>
      ) : null}

      {contextMenu ? <ContextMenu showcaseFolders={(snapshot.showcases ?? []).map((s) => s.folder)} onShowcase={(folder) => void onConfigureShowcase(folder, !snapshot.showcases?.some((s) => s.folder === folder))} onClose={() => setContextMenu(null)} onOpenPath={onOpenPath} standalone={standalone} menu={contextMenu} clipboard={clipboard} currentPath={currentPath} rootPath={explorerRoot} assets={snapshot.assets} onCopy={(entry) => setClipboard(entry)} onDeleteAsset={deleteAsset} onDeleteFolder={deleteFolder} onDialog={setDialog} onDuplicate={(assetId) => void duplicate(assetId)} onExport={(assetId) => void onExportAsset(assetId)} onNavigate={navigate} onOpen={(asset) => onOpenAsset(asset)} onOrganize={(assetId) => void onOrganizeAsset(assetId)} onPaste={paste} onToggleFavorite={toggleFavorite} /> : null}
      {dialog ? <AssetDialog key={JSON.stringify(dialog)} dialog={dialog} folders={folders} rootPath={explorerRoot} onClose={() => setDialog(null)} onCreateAsset={onCreateAsset} onCreateFolder={onCreateFolder} onMoveAsset={onMoveAsset} onMoveFolder={onMoveFolder} onRenameAsset={onRenameAsset} onRenameFolder={onRenameFolder} /> : null}
    </div>
  );
}

function SidebarSection({ children, label }: { children: ReactNode; label: string }) { return <div className="asset-sidebar-section"><strong>{label}</strong><div>{children}</div></div>; }
function SidebarButton({ active, count, icon, label, onClick }: { active: boolean; count: number; icon: ReactNode; label: string; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick} type="button">{icon}<span>{label}</span><b>{count}</b></button>; }

function ContextMenu({ showcaseFolders, onShowcase, onClose, onOpenPath, standalone, menu, clipboard, currentPath, rootPath, assets, onCopy, onDeleteAsset, onDeleteFolder, onDialog, onDuplicate, onExport, onNavigate, onOpen, onOrganize, onPaste, onToggleFavorite }: {
  showcaseFolders: string[]; onShowcase: (folder: string) => void; onClose: () => void; onOpenPath: (path: string) => void;
  standalone: boolean; menu: ContextMenuState; clipboard: ClipboardEntry | null; currentPath: string; rootPath: string; assets: BlendUpAsset[];
  onCopy: (entry: ClipboardEntry) => void; onDeleteAsset: (asset: BlendUpAsset) => void; onDeleteFolder: (folder: string) => void;
  onDialog: (dialog: AssetDialogState) => void; onDuplicate: (assetId: string) => void; onExport: (assetId: string) => void;
  onNavigate: (folder: string) => void; onOpen: (asset: BlendUpAsset) => void; onOrganize: (assetId: string) => void; onPaste: (target?: string) => void; onToggleFavorite: (assetId: string) => void;
}) {
  const targetAssetId = menu.target.kind === "asset" ? menu.target.assetId : null;
  const asset = targetAssetId ? assets.find((item) => item.id === targetAssetId) : null;
  const folder = menu.target.kind === "folder" ? menu.target.path : null;
  const target = folder ?? currentPath;
  return <div className="context-menu" onClick={(event) => { event.stopPropagation(); onClose(); }} role="menu" aria-label="Actions" style={{ left: menu.x, top: menu.y }}>
    {asset && !isOwnedAssetFolder(asset) ? <MenuButton icon={<FolderCog size={14} />} label="Ranger dans un dossier d'asset" onClick={() => onOrganize(asset.id)} /> : null}
    {!asset ? <MenuButton icon={<FileBox size={14} />} label={showcaseFolders.includes(target) ? "Désactiver le Showcase" : "Activer le Showcase"} onClick={() => onShowcase(target)} /> : null}
    {asset ? <><MenuButton icon={<ExternalLink size={14} />} shortcut={shortcutLabels.open} label="Ouvrir dans Blender" onClick={() => onOpen(asset)} /><MenuButton icon={<FolderOpen size={14} />} label="Afficher dans les fichiers" shortcut={shortcutLabels.reveal} onClick={() => onOpenPath(asset.sourcePath)} /><MenuButton icon={<Upload size={14} />} label={standalone ? "Générer l’aperçu" : "Exporter"} onClick={() => onExport(asset.id)} /><hr /><MenuButton icon={<Heart size={14} />} label="Favori" onClick={() => onToggleFavorite(asset.id)} /><MenuButton icon={<Pencil size={14} />} shortcut={shortcutLabels.rename} label="Renommer…" onClick={() => onDialog({ kind: "renameAsset", assetId: asset.id, initialValue: asset.name })} /><MenuButton icon={<Move size={14} />} label="Déplacer…" onClick={() => onDialog({ kind: "moveAsset", assetId: asset.id })} /><MenuButton icon={<Copy size={14} />} shortcut={shortcutLabels.duplicate} label="Dupliquer" onClick={() => onDuplicate(asset.id)} /><MenuButton icon={<Copy size={14} />} shortcut={shortcutLabels.copy} label="Copier" onClick={() => onCopy({ assetId: asset.id, mode: "copy" })} /><MenuButton icon={<FolderInput size={14} />} shortcut={shortcutLabels.cut} label="Couper" onClick={() => onCopy({ assetId: asset.id, mode: "cut" })} /><hr /><MenuButton danger icon={<Trash2 size={14} />} shortcut={shortcutLabels.delete} label="Mettre à la corbeille" onClick={() => onDeleteAsset(asset)} /></> : null}
    {folder ? <><MenuButton icon={<FolderOpen size={14} />} shortcut={shortcutLabels.open} label="Ouvrir" onClick={() => onNavigate(folder)} /><MenuButton icon={<FolderOpen size={14} />} label="Ouvrir dans les fichiers" shortcut={shortcutLabels.reveal} onClick={() => onOpenPath(folder)} /><MenuButton icon={<Plus size={14} />} shortcut={shortcutLabels.createAsset} label="Nouvel asset…" onClick={() => onDialog({ kind: "createAsset", parent: folder })} /><MenuButton icon={<FolderPlus size={14} />} shortcut={shortcutLabels.createFolder} label="Nouveau dossier…" onClick={() => onDialog({ kind: "createFolder", parent: folder })} />{clipboard ? <MenuButton icon={<Clipboard size={14} />} shortcut={shortcutLabels.paste} label="Coller ici" onClick={() => onPaste(folder)} /> : null}<hr />{folder !== rootPath ? <><MenuButton icon={<Pencil size={14} />} shortcut={shortcutLabels.rename} label="Renommer…" onClick={() => onDialog({ kind: "renameFolder", folder, initialValue: baseName(folder) })} /><MenuButton icon={<Move size={14} />} label="Déplacer…" onClick={() => onDialog({ kind: "moveFolder", folder })} /></> : null}{folder !== rootPath ? <><hr /><MenuButton danger icon={<Trash2 size={14} />} shortcut={shortcutLabels.delete} label="Mettre à la corbeille" onClick={() => onDeleteFolder(folder)} /></> : null}</> : null}
    {menu.target.kind === "background" ? <><MenuButton icon={<FolderOpen size={14} />} label="Ouvrir ce dossier dans les fichiers" shortcut={shortcutLabels.reveal} onClick={() => onOpenPath(target)} /><hr /><MenuButton icon={<Plus size={14} />} shortcut={shortcutLabels.createAsset} label="Nouvel asset…" onClick={() => onDialog({ kind: "createAsset", parent: target })} /><MenuButton icon={<FolderPlus size={14} />} shortcut={shortcutLabels.createFolder} label="Nouveau dossier…" onClick={() => onDialog({ kind: "createFolder", parent: target })} />{clipboard ? <><hr /><MenuButton icon={<Clipboard size={14} />} shortcut={shortcutLabels.paste} label="Coller ici" onClick={() => onPaste(target)} /></> : null}</> : null}
  </div>;
}

function MenuButton({ danger, icon, label, onClick, shortcut }: { danger?: boolean; icon: ReactNode; label: string; onClick: () => void; shortcut?: string }) { return <button role="menuitem" className={danger ? "danger" : ""} onClick={onClick} type="button">{icon}<span>{label}</span>{shortcut ? <kbd>{shortcut}</kbd> : null}</button>; }

function AssetDialog({ dialog, folders, rootPath, onClose, onCreateAsset, onCreateFolder, onMoveAsset, onMoveFolder, onRenameAsset, onRenameFolder }: {
  dialog: NonNullable<AssetDialogState>; folders: string[]; rootPath: string; onClose: () => void;
  onCreateAsset: (parent: string, name: string) => Mutation; onCreateFolder: (parent: string, name: string) => Mutation;
  onMoveAsset: (assetId: string, target: string) => Mutation; onMoveFolder: (folder: string, target: string) => Mutation;
  onRenameAsset: (assetId: string, name: string) => Mutation; onRenameFolder: (folder: string, name: string) => Mutation;
}) {
  const isMove = dialog.kind === "moveAsset" || dialog.kind === "moveFolder";
  const initial = "initialValue" in dialog ? dialog.initialValue : "";
  const [value, setValue] = useState(isMove ? rootPath : initial);
  const [busy, setBusy] = useState(false);
  const title = ({ createAsset: "Créer un asset Blender", createFolder: "Créer un dossier", renameAsset: "Renommer l'asset", renameFolder: "Renommer le dossier", moveAsset: "Déplacer l'asset", moveFolder: "Déplacer le dossier" } as const)[dialog.kind];
  const submit = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    let result: AssetMutationResult | null;
    if (dialog.kind === "createAsset") result = await onCreateAsset(dialog.parent, value);
    else if (dialog.kind === "createFolder") result = await onCreateFolder(dialog.parent, value);
    else if (dialog.kind === "renameAsset") result = await onRenameAsset(dialog.assetId, value);
    else if (dialog.kind === "renameFolder") result = await onRenameFolder(dialog.folder, value);
    else if (dialog.kind === "moveAsset") result = await onMoveAsset(dialog.assetId, value);
    else result = await onMoveFolder(dialog.folder, value);
    setBusy(false);
    if (result) onClose();
  };
  return <div className="modal-backdrop" onMouseDown={() => { if (!busy) onClose(); }}><form role="dialog" aria-modal="true" aria-label={title} className="asset-dialog" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); } }} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><div><strong>{title}</strong><span>{isMove ? "Choisis le dossier de destination." : "Le nom peut contenir des espaces, tirets et underscores."}</span></div><button aria-label="Fermer" className="icon-button" disabled={busy} onClick={onClose} type="button"><X size={17} /></button></header>{isMove ? <label className="field"><span>Destination</span><select autoFocus onChange={(event) => setValue(event.target.value)} value={value}>{folders.filter((folder) => !(dialog.kind === "moveFolder" && (folder === dialog.folder || folder.startsWith(`${dialog.folder}/`)))).map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select></label> : <label className="field"><span>Nom</span><input autoFocus onFocus={(event) => event.target.select()} onChange={(event) => setValue(event.target.value)} placeholder={dialog.kind === "createAsset" ? "Mon nouvel asset" : "Nom"} value={value} /></label>}<footer><button disabled={busy} onClick={onClose} type="button">Annuler</button><button className="primary" disabled={busy || !value.trim()} type="submit">{busy ? <LoaderCircle className="spin" size={15} /> : null}{dialog.kind.startsWith("create") ? "Créer" : dialog.kind.startsWith("move") ? "Déplacer" : "Renommer"}</button></footer></form></div>;
}

function filterLabel(filter: AssetQuickFilter) { return ({ all: "Tous", favorites: "Favoris", pending: "À exporter", outdated: "À réexporter", errors: "Erreurs", exported: "À jour" } as const)[filter]; }
