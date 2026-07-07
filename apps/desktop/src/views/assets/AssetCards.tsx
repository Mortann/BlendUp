import { Layers, Star } from "lucide-react";
import { useRef } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { assetLabel } from "../../blendup/naming";
import type { BlendUpAsset } from "../../blendup/types";
import { StatusPill } from "../../app/ui";
import { formatAssetType, formatStatus } from "../../ui/format";
import type { AssetDisplayMode } from "./model";
import { assetDirectory, assetPeople, normalizeArtistStatus } from "./utils";
import { AssetAvatars, AssetVisual } from "./AssetVisuals";

export function ArtistAssetCard({
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
          {asset.lods && asset.lods.length > 0 ? (
            <span className="lod-badge" title={`${asset.lods.length} LOD(s)`}>
              LOD {asset.lods.length}
            </span>
          ) : null}
          {problemCount > 0 ? <span className="mini-warning">{problemCount}</span> : null}
        </div>
      </button>
    </article>
  );
}
