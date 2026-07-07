import { ArrowUpDown, Check, ClipboardPaste, Copy, ExternalLink, FilePlus, Files, Folder, FolderOpen, FolderPlus, Grid2X2, Image as ImageIconFiles, List, Pencil, Scissors, Search, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetLabel, buildAssetName, labelForType } from "../../blendup/naming";
import { selectImageFiles } from "../../blendup/projectLoader";
import type { AssetNamingRules, AssetType, AssetTypePreset, BlendUpAsset } from "../../blendup/types";
import { formatAssetType } from "../../ui/format";
import type { AssetDisplayMode, AssetSettings, AssetSortMode, AssetThumbSize, ContextTarget } from "./model";
import { AssetVisual } from "./AssetVisuals";
import { normalizeFolderPath } from "./utils";

export function AssetContextMenu({
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

export function RenameDialog({
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

export function ConfirmDialog({
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

export function SpotlightSearch({
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

export function AssetSettingsPanel({
  assetNamingRules,
  assetRoots,
  assetTypePresets,
  onChange,
  onClose,
  onSaveAssetConfiguration,
  onSetShowBlenderCommandPrompt,
  settings,
  showBlenderCommandPrompt
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
  onSetShowBlenderCommandPrompt: (show: boolean) => void;
  settings: AssetSettings;
  showBlenderCommandPrompt: boolean;
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

        <label className="settings-toggle">
          <input
            checked={showBlenderCommandPrompt}
            onChange={(event) => onSetShowBlenderCommandPrompt(event.target.checked)}
            type="checkbox"
          />
          <span>Afficher l'invite de commande quand Blender s'ouvre</span>
        </label>
      </div>
    </div>
  );
}

export function CreateFolderDialog({
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

export function CreateAssetDialog({
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
