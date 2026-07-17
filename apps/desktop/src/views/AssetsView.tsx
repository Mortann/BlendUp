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
import { lazy, Suspense, useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { AssetLod, AssetMutationResult, AssetVariant, BlendUpAsset, ProjectSnapshot } from "../blendup/types";
import { AssetCard, FolderCard } from "./assets/AssetVisual";
import type { AssetDialogState, AssetExplorerSettings, AssetQuickFilter, ClipboardEntry, ContextMenuState } from "./assets/model";
import {
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

const AssetDetail = lazy(() => import("./assets/AssetDetail").then((module) => ({ default: module.AssetDetail })));

type Mutation = Promise<AssetMutationResult | null>;

export function AssetsView({
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
  selectedAssetId,
  setSelectedAssetId,
  snapshot
}: {
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
  selectedAssetId: string | null;
  setSelectedAssetId: (assetId: string | null) => void;
  snapshot: ProjectSnapshot;
}) {
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
  const [recentFolders, setRecentFolders] = useState<string[]>(() => loadRecentFolders(projectId));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<AssetDialogState>(null);
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const selectedAsset = snapshot.assets.find((asset) => asset.id === selectedAssetId) ?? null;

  useEffect(() => {
    setSettings(loadExplorerSettings(projectId));
    setFavorites(loadFavorites(projectId));
    const stored = loadExplorerPath(projectId);
    setCurrentPath(stored && folders.includes(stored) ? stored : explorerRoot);
    setRecentFolders(loadRecentFolders(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!folders.includes(normalizePath(currentPath))) {
      setCurrentPath(explorerRoot);
      saveExplorerPath(projectId, explorerRoot);
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
  const navigate = (path: string) => {
    const normalized = normalizePath(path);
    setCurrentPath(normalized);
    saveExplorerPath(projectId, normalized);
    const next = [normalized, ...recentFolders.filter((folder) => folder !== normalized)].slice(0, 5);
    setRecentFolders(next);
    saveRecentFolders(projectId, next);
    setSelectedAssetId(null);
  };
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

  const pendingCount = snapshot.assets.filter((asset) => asset.status !== "exported").length;
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
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 330), target });
  };

  const deleteAsset = (asset: BlendUpAsset) => {
    if (window.confirm(`Placer « ${asset.name} » dans la corbeille ?`)) void onDeleteAsset(asset.id).then(() => setSelectedAssetId(null));
  };
  const deleteFolder = (folder: string) => {
    if (window.confirm(`Placer le dossier « ${baseName(folder)} » et son contenu dans la corbeille ?`)) void onDeleteFolder(folder);
  };
  const paste = (target = currentPath) => {
    if (!clipboard) return;
    void onCopyAsset(clipboard.assetId, target, clipboard.mode === "cut").then(() => {
      if (clipboard.mode === "cut") setClipboard(null);
    });
  };

  return (
    <div className={`assets-workspace ${selectedAsset ? "has-detail" : ""}`}>
      <div className="view-page assets-page">
        <section className="asset-explorer content-panel" onContextMenu={(event) => openMenu(event, { kind: "background" })}>
          <aside className={`asset-browser-sidebar ${sidebarOpen ? "open" : "closed"}`}>
            <button className="sidebar-collapse" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? "Réduire" : "Déplier"} type="button">{sidebarOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>Navigation</span></button>
            {sidebarOpen ? <>
              <SidebarSection label="Bibliothèque">
                <SidebarButton active={filter === "all"} icon={<FileBox size={15} />} label="Tous les assets" onClick={() => { setFilter("all"); navigate(explorerRoot); }} count={snapshot.assets.length} />
                <SidebarButton active={filter === "favorites"} icon={<Heart size={15} />} label="Favoris" onClick={() => setFilter("favorites")} count={favorites.length} />
                <SidebarButton active={filter === "pending"} icon={<Upload size={15} />} label="À exporter" onClick={() => setFilter("pending")} count={pendingCount} />
                <SidebarButton active={filter === "errors"} icon={<TriangleAlert size={15} />} label="Erreurs" onClick={() => setFilter("errors")} count={snapshot.assets.filter((asset) => asset.status === "error").length} />
              </SidebarSection>
              <SidebarSection label="Dossiers">
                {folders.map((folder) => <button className={`folder-tree-row ${currentPath === folder && filter === "all" ? "active" : ""}`} draggable={folder !== explorerRoot} key={folder} onClick={() => { setFilter("all"); navigate(folder); }} onContextMenu={(event) => folder !== explorerRoot && openMenu(event, { kind: "folder", path: folder })} onDragOver={(event) => event.preventDefault()} onDragStart={(event) => beginFolderDrag(event, folder)} onDrop={(event) => dropOnFolder(event, folder)} style={{ paddingLeft: `${10 + Math.max(0, folder.split("/").length - explorerRoot.split("/").length) * 13}px` }} type="button"><FolderOpen size={14} /><span>{baseName(folder)}</span><b>{folderAssetCount(snapshot.assets, folder)}</b></button>)}
              </SidebarSection>
              {recentFolders.some((folder) => folders.includes(folder)) ? <SidebarSection label="Récents">{recentFolders.filter((folder) => folders.includes(folder)).slice(0, 4).map((folder) => <button className="recent-folder" key={folder} onClick={() => navigate(folder)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnFolder(event, folder)} type="button"><ArchiveRestore size={13} /><span>{folder}</span></button>)}</SidebarSection> : null}
            </> : null}
          </aside>

          <div className="asset-browser-main">
            <div className="asset-browser-toolbar">
              <label className="search-field"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un asset ou un dossier…" value={query} />{query ? <button aria-label="Effacer" onClick={() => setQuery("")} type="button"><X size={14} /></button> : null}</label>
              <div className="browser-actions">
                <button onClick={() => setDialog({ kind: "createFolder", parent: currentPath })} title="Nouveau dossier" type="button"><FolderPlus size={16} /></button>
                <button className="primary" onClick={() => setDialog({ kind: "createAsset", parent: currentPath })} type="button"><Plus size={16} /> Asset</button>
              </div>
            </div>
            <div className="asset-view-options">
              <div className="breadcrumbs">
                {breadcrumbParts(currentPath).filter((part) => part.path === explorerRoot || part.path.startsWith(`${explorerRoot}/`)).map((part, index) => <span key={part.path}>{index ? <ChevronRight size={13} /> : null}<button onClick={() => { setFilter("all"); navigate(part.path); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnFolder(event, part.path)} type="button">{part.label}</button></span>)}
              </div>
              <span>{visibleFolders.length + visibleAssets.length} élément{visibleFolders.length + visibleAssets.length > 1 ? "s" : ""}</span>
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
            </div>

            {visibleFolders.length || visibleAssets.length ? (
              <div className={`asset-items ${settings.displayMode} thumb-${settings.thumbnailSize}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnFolder(event, currentPath)}>
                {visibleFolders.map((folder) => <FolderCard assetCount={folderAssetCount(snapshot.assets, folder)} displayMode={settings.displayMode} key={folder} name={baseName(folder)} onContextMenu={(event) => openMenu(event, { kind: "folder", path: folder })} onDropAsset={(assetId) => void onMoveAsset(assetId, folder)} onDropFolder={(source) => void onMoveFolder(source, folder)} onOpen={() => navigate(folder)} path={folder} previewAssets={snapshot.assets.filter((asset) => assetBrowserFolder(asset) === folder || assetBrowserFolder(asset).startsWith(`${folder}/`)).slice(0, 4)} projectRoot={snapshot.projectRoot} thumbnailSize={settings.thumbnailSize} />)}
                {visibleAssets.map((asset) => <AssetCard asset={asset} displayMode={settings.displayMode} exporting={exportingAssetIds.includes(asset.id)} favorite={favorites.includes(asset.id)} key={asset.id} onContextMenu={(event) => openMenu(event, { kind: "asset", assetId: asset.id })} onExport={() => void onExportAsset(asset.id)} onOpen={() => onOpenAsset(asset)} onSelect={() => setSelectedAssetId(asset.id)} onToggleFavorite={() => toggleFavorite(asset.id)} projectRoot={snapshot.projectRoot} selected={asset.id === selectedAssetId} thumbnailSize={settings.thumbnailSize} />)}
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
            asset={selectedAsset}
            exporting={exportingAssetIds.includes(selectedAsset.id)}
            onAddImages={(kind) => void onAddAssetImages(selectedAsset.id, kind)}
            onClose={() => setSelectedAssetId(null)}
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

      {contextMenu ? <ContextMenu menu={contextMenu} clipboard={clipboard} currentPath={currentPath} rootPath={explorerRoot} assets={snapshot.assets} onCopy={(entry) => setClipboard(entry)} onDeleteAsset={deleteAsset} onDeleteFolder={deleteFolder} onDialog={setDialog} onDuplicate={(assetId) => void onDuplicateAsset(assetId)} onExport={(assetId) => void onExportAsset(assetId)} onNavigate={navigate} onOpen={(asset) => onOpenAsset(asset)} onOrganize={(assetId) => void onOrganizeAsset(assetId)} onPaste={paste} onToggleFavorite={toggleFavorite} /> : null}
      {dialog ? <AssetDialog dialog={dialog} folders={folders} rootPath={explorerRoot} onClose={() => setDialog(null)} onCreateAsset={onCreateAsset} onCreateFolder={onCreateFolder} onMoveAsset={onMoveAsset} onMoveFolder={onMoveFolder} onRenameAsset={onRenameAsset} onRenameFolder={onRenameFolder} /> : null}
    </div>
  );
}

function SidebarSection({ children, label }: { children: ReactNode; label: string }) { return <div className="asset-sidebar-section"><strong>{label}</strong><div>{children}</div></div>; }
function SidebarButton({ active, count, icon, label, onClick }: { active: boolean; count: number; icon: ReactNode; label: string; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick} type="button">{icon}<span>{label}</span><b>{count}</b></button>; }

function ContextMenu({ menu, clipboard, currentPath, rootPath, assets, onCopy, onDeleteAsset, onDeleteFolder, onDialog, onDuplicate, onExport, onNavigate, onOpen, onOrganize, onPaste, onToggleFavorite }: {
  menu: ContextMenuState; clipboard: ClipboardEntry | null; currentPath: string; rootPath: string; assets: BlendUpAsset[];
  onCopy: (entry: ClipboardEntry) => void; onDeleteAsset: (asset: BlendUpAsset) => void; onDeleteFolder: (folder: string) => void;
  onDialog: (dialog: AssetDialogState) => void; onDuplicate: (assetId: string) => void; onExport: (assetId: string) => void;
  onNavigate: (folder: string) => void; onOpen: (asset: BlendUpAsset) => void; onOrganize: (assetId: string) => void; onPaste: (target?: string) => void; onToggleFavorite: (assetId: string) => void;
}) {
  const targetAssetId = menu.target.kind === "asset" ? menu.target.assetId : null;
  const asset = targetAssetId ? assets.find((item) => item.id === targetAssetId) : null;
  const folder = menu.target.kind === "folder" ? menu.target.path : null;
  const target = folder ?? currentPath;
  return <div className="context-menu" onClick={(event) => event.stopPropagation()} style={{ left: menu.x, top: menu.y }}>
    {asset && !isOwnedAssetFolder(asset) ? <MenuButton icon={<FolderCog size={14} />} label="Ranger dans un dossier d'asset" onClick={() => onOrganize(asset.id)} /> : null}
    {asset ? <><MenuButton icon={<ExternalLink size={14} />} label="Ouvrir dans Blender" onClick={() => onOpen(asset)} /><MenuButton icon={<Upload size={14} />} label="Exporter" onClick={() => onExport(asset.id)} /><hr /><MenuButton icon={<Heart size={14} />} label="Favori" onClick={() => onToggleFavorite(asset.id)} /><MenuButton icon={<Pencil size={14} />} label="Renommer…" onClick={() => onDialog({ kind: "renameAsset", assetId: asset.id, initialValue: asset.name })} /><MenuButton icon={<Move size={14} />} label="Déplacer…" onClick={() => onDialog({ kind: "moveAsset", assetId: asset.id })} /><MenuButton icon={<Copy size={14} />} label="Dupliquer" onClick={() => onDuplicate(asset.id)} /><MenuButton icon={<Copy size={14} />} label="Copier" onClick={() => onCopy({ assetId: asset.id, mode: "copy" })} /><MenuButton icon={<FolderInput size={14} />} label="Couper" onClick={() => onCopy({ assetId: asset.id, mode: "cut" })} /><hr /><MenuButton danger icon={<Trash2 size={14} />} label="Mettre à la corbeille" onClick={() => onDeleteAsset(asset)} /></> : null}
    {folder ? <><MenuButton icon={<FolderOpen size={14} />} label="Ouvrir" onClick={() => onNavigate(folder)} /><MenuButton icon={<Plus size={14} />} label="Nouvel asset…" onClick={() => onDialog({ kind: "createAsset", parent: folder })} /><MenuButton icon={<FolderPlus size={14} />} label="Nouveau dossier…" onClick={() => onDialog({ kind: "createFolder", parent: folder })} />{clipboard ? <MenuButton icon={<Clipboard size={14} />} label="Coller ici" onClick={() => onPaste(folder)} /> : null}<hr /><MenuButton icon={<Pencil size={14} />} label="Renommer…" onClick={() => onDialog({ kind: "renameFolder", folder, initialValue: baseName(folder) })} /><MenuButton icon={<Move size={14} />} label="Déplacer…" onClick={() => onDialog({ kind: "moveFolder", folder })} />{folder !== rootPath ? <><hr /><MenuButton danger icon={<Trash2 size={14} />} label="Mettre à la corbeille" onClick={() => onDeleteFolder(folder)} /></> : null}</> : null}
    {menu.target.kind === "background" ? <><MenuButton icon={<Plus size={14} />} label="Nouvel asset…" onClick={() => onDialog({ kind: "createAsset", parent: target })} /><MenuButton icon={<FolderPlus size={14} />} label="Nouveau dossier…" onClick={() => onDialog({ kind: "createFolder", parent: target })} />{clipboard ? <><hr /><MenuButton icon={<Clipboard size={14} />} label="Coller ici" onClick={() => onPaste(target)} /></> : null}</> : null}
  </div>;
}

function MenuButton({ danger, icon, label, onClick }: { danger?: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button className={danger ? "danger" : ""} onClick={onClick} type="button">{icon}<span>{label}</span></button>; }

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
    if (!value.trim()) return;
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
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="asset-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><div><strong>{title}</strong><span>{isMove ? "Choisis le dossier de destination." : "Le nom peut contenir des espaces, tirets et underscores."}</span></div><button aria-label="Fermer" className="icon-button" onClick={onClose} type="button"><X size={17} /></button></header>{isMove ? <label className="field"><span>Destination</span><select autoFocus onChange={(event) => setValue(event.target.value)} value={value}>{folders.filter((folder) => !(dialog.kind === "moveFolder" && (folder === dialog.folder || folder.startsWith(`${dialog.folder}/`)))).map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select></label> : <label className="field"><span>Nom</span><input autoFocus onChange={(event) => setValue(event.target.value)} placeholder={dialog.kind === "createAsset" ? "Mon nouvel asset" : "Nom"} value={value} /></label>}<footer><button onClick={onClose} type="button">Annuler</button><button className="primary" disabled={busy || !value.trim()} type="submit">{busy ? <LoaderCircle className="spin" size={15} /> : null}{dialog.kind.startsWith("create") ? "Créer" : dialog.kind.startsWith("move") ? "Déplacer" : "Renommer"}</button></footer></form></div>;
}

function filterLabel(filter: AssetQuickFilter) { return ({ all: "Tous", favorites: "Favoris", pending: "À exporter", outdated: "À réexporter", errors: "Erreurs", exported: "À jour" } as const)[filter]; }
