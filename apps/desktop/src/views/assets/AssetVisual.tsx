import { Box, Folder, Heart, Image as ImageIcon, MoreHorizontal, Upload } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { readProjectFileDataUrl } from "../../blendup/projectLoader";
import type { BlendUpAsset } from "../../blendup/types";
import type { AssetDisplayMode, AssetThumbSize } from "./model";
import { formatBytes, formatTimestamp, statusLabel } from "./utils";

export function AssetThumbnail({ asset, projectRoot }: { asset: BlendUpAsset; projectRoot: string }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSource("");
    if (!asset.metadata.thumbnailPath) return;
    void readProjectFileDataUrl(projectRoot, asset.metadata.thumbnailPath)
      .then((value) => { if (!cancelled) setSource(value); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [asset.metadata.thumbnailPath, projectRoot]);

  return source ? <img alt={`Miniature de ${asset.name}`} src={source} /> : <Box aria-hidden="true" size={34} />;
}

export function AssetCard({
  asset,
  displayMode,
  exporting,
  favorite,
  onContextMenu,
  onExport,
  onOpen,
  onSelect,
  onToggleFavorite,
  projectRoot,
  selected,
  thumbnailSize
}: {
  asset: BlendUpAsset;
  displayMode: AssetDisplayMode;
  exporting: boolean;
  favorite: boolean;
  onContextMenu: (event: MouseEvent) => void;
  onExport: () => void;
  onOpen: () => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  projectRoot: string;
  selected: boolean;
  thumbnailSize: AssetThumbSize;
}) {
  return (
    <article
      className={`explorer-asset ${displayMode} thumb-${thumbnailSize} ${selected ? "selected" : ""}`}
      draggable
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-blendup-asset", asset.id);
      }}
      tabIndex={0}
    >
      <div className="asset-visual"><AssetThumbnail asset={asset} projectRoot={projectRoot} /></div>
      <div className="asset-card-main">
        <strong title={asset.name}>{asset.name}</strong>
        <span>{displayMode === "compact" ? asset.format.toUpperCase() : asset.folder}</span>
        {displayMode === "list" ? <small>{formatBytes(asset.sizeBytes)} · {formatTimestamp(asset.sourceModifiedAt)}</small> : null}
      </div>
      <span className={`asset-status ${asset.status}`}>{statusLabel(asset.status)}</span>
      <div className="asset-card-actions">
        <button
          aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          className={`icon-button ${favorite ? "active" : ""}`}
          onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}
          title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          type="button"
        ><Heart fill={favorite ? "currentColor" : "none"} size={15} /></button>
        <button
          aria-label="Exporter"
          className="icon-button"
          disabled={exporting}
          onClick={(event) => { event.stopPropagation(); onExport(); }}
          title="Exporter"
          type="button"
        ><Upload size={15} /></button>
        <button
          aria-label="Plus d'actions"
          className="icon-button"
          onClick={(event) => { event.stopPropagation(); onContextMenu(event); }}
          title="Plus d'actions"
          type="button"
        ><MoreHorizontal size={16} /></button>
      </div>
    </article>
  );
}

export function FolderCard({
  assetCount,
  displayMode,
  name,
  onContextMenu,
  onDropAsset,
  onOpen,
  path,
  thumbnailSize
}: {
  assetCount: number;
  displayMode: AssetDisplayMode;
  name: string;
  onContextMenu: (event: MouseEvent) => void;
  onDropAsset: (assetId: string) => void;
  onOpen: () => void;
  path: string;
  thumbnailSize: AssetThumbSize;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <article
      className={`explorer-folder ${displayMode} thumb-${thumbnailSize} ${dragOver ? "drag-over" : ""}`}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const assetId = event.dataTransfer.getData("application/x-blendup-asset");
        if (assetId) onDropAsset(assetId);
      }}
      tabIndex={0}
      title={path}
    >
      <div className="folder-visual"><Folder aria-hidden="true" fill="currentColor" size={38} /></div>
      <div className="asset-card-main"><strong>{name}</strong><span>{assetCount} asset{assetCount > 1 ? "s" : ""}</span></div>
      <ImageIcon className="folder-corner" size={14} />
    </article>
  );
}
