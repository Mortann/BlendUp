import { Box, Eye, Folder, Heart, Image as ImageIcon, MoreHorizontal, Upload } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
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

  if (source) return <img alt={`Miniature de ${asset.name}`} src={source} />;
  if (asset.outputModifiedAt) return <ModelThumbnail asset={asset} projectRoot={projectRoot} />;
  return <Box aria-hidden="true" size={34} />;
}

function ModelThumbnail({ asset, projectRoot }: { asset: BlendUpAsset; projectRoot: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    let three: typeof import("three") | undefined;
    let scene: import("three").Scene | undefined;
    let renderer: import("three").WebGLRenderer | undefined;
    setFailed(false);
    void (async () => {
      const [loadedThree, url] = await Promise.all([
        import("three"),
        readProjectFileDataUrl(projectRoot, asset.outputPath)
      ]);
      if (disposed || !url) return;
      three = loadedThree;
      scene = new loadedThree.Scene();
      scene.background = new loadedThree.Color(0x202322);
      const camera = new loadedThree.PerspectiveCamera(38, 16 / 10, 0.01, 10_000);
      renderer = new loadedThree.WebGLRenderer({ antialias: true, canvas: element });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(320, 200, false);
      renderer.outputColorSpace = loadedThree.SRGBColorSpace;
      scene.add(new loadedThree.HemisphereLight(0xffffff, 0x1b2430, 2.8));
      const key = new loadedThree.DirectionalLight(0xffffff, 3.4);
      key.position.set(4, 7, 5);
      scene.add(key);

      const fitAndRender = (object: import("three").Object3D) => {
        if (disposed || !three || !scene || !renderer) {
          disposeObject(object, loadedThree);
          return;
        }
        scene.add(object);
        const bounds = new loadedThree.Box3().setFromObject(object);
        if (bounds.isEmpty()) {
          setFailed(true);
          return;
        }
        const size = bounds.getSize(new loadedThree.Vector3());
        const center = bounds.getCenter(new loadedThree.Vector3());
        const max = Math.max(size.x, size.y, size.z, 0.1);
        object.position.sub(center);
        camera.position.set(max * 1.55, max * 1.05, max * 1.55);
        camera.lookAt(0, 0, 0);
        camera.near = Math.max(max / 1_000, 0.001);
        camera.far = max * 100;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };

      if (asset.format === "glb") {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        if (!disposed) new GLTFLoader().load(url, (result) => fitAndRender(result.scene), undefined, () => { if (!disposed) setFailed(true); });
      } else {
        const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
        if (!disposed) new FBXLoader().load(url, fitAndRender, undefined, () => { if (!disposed) setFailed(true); });
      }
    })().catch(() => { if (!disposed) setFailed(true); });

    return () => {
      disposed = true;
      if (scene && three) disposeObject(scene, three);
      renderer?.dispose();
    };
  }, [asset.format, asset.outputModifiedAt, asset.outputPath, projectRoot]);

  return failed ? <Box aria-hidden="true" size={34} /> : <canvas aria-label={`Aperçu 3D de ${asset.name}`} ref={canvas} />;
}

function disposeObject(object: import("three").Object3D, three: typeof import("three")) {
  object.traverse((child) => {
    if (!(child instanceof three.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof three.Texture) value.dispose();
      });
      material.dispose();
    });
  });
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
        <span>{displayMode === "compact" ? (asset.status === "local" ? "BLEND" : asset.format.toUpperCase()) : asset.folder}</span>
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
          aria-label={asset.status === "local" ? "Générer l’aperçu" : "Exporter toutes les versions"}
          className="icon-button"
          disabled={exporting}
          onClick={(event) => { event.stopPropagation(); onExport(); }}
          title={asset.status === "local" ? "Générer un aperçu 3D local" : "Exporter l’original, les variantes et les LOD"}
          type="button"
        >{asset.status === "local" ? <Eye size={15} /> : <Upload size={15} />}</button>
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
  onDropFolder,
  onOpen,
  path,
  previewAssets,
  projectRoot,
  thumbnailSize
}: {
  assetCount: number;
  displayMode: AssetDisplayMode;
  name: string;
  onContextMenu: (event: MouseEvent) => void;
  onDropAsset: (assetId: string) => void;
  onDropFolder: (folder: string) => void;
  onOpen: () => void;
  path: string;
  previewAssets: BlendUpAsset[];
  projectRoot: string;
  thumbnailSize: AssetThumbSize;
}) {
  const [dragOver, setDragOver] = useState(false);
  const previews = previewAssets.slice(0, displayMode === "grid" ? 4 : 1);
  return (
    <article
      className={`explorer-folder ${displayMode} thumb-${thumbnailSize} ${dragOver ? "drag-over" : ""}`}
      draggable
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-blendup-folder", path);
      }}
      onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
        const assetId = event.dataTransfer.getData("application/x-blendup-asset");
        const folder = event.dataTransfer.getData("application/x-blendup-folder");
        if (assetId) onDropAsset(assetId);
        else if (folder && folder !== path) onDropFolder(folder);
      }}
      tabIndex={0}
      title={path}
    >
      <div className={`folder-visual ${previews.length ? "has-previews" : ""}`}>
        {previews.length ? <div className={`folder-preview-grid count-${previews.length}`}>{previews.map((asset) => <AssetThumbnail asset={asset} key={asset.id} projectRoot={projectRoot} />)}</div> : <Folder aria-hidden="true" fill="currentColor" size={38} />}
        {previews.length ? <span className="folder-preview-badge"><Folder aria-hidden="true" fill="currentColor" size={17} /></span> : null}
      </div>
      <div className="asset-card-main"><strong>{name}</strong><span>{assetCount} asset{assetCount > 1 ? "s" : ""}</span></div>
      <ImageIcon className="folder-corner" size={14} />
    </article>
  );
}
