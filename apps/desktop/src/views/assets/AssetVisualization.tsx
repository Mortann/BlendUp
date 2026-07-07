import { Boxes, ChevronDown, Folder, ImageIcon, Image as ImageIconFiles, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { assetLabel } from "../../blendup/naming";
import { listProjectImages, readProjectFileDataUrl } from "../../blendup/projectLoader";
import type { ProjectImageFile } from "../../blendup/projectLoader";
import type { BlendUpAsset } from "../../blendup/types";
import { EmptyState, StatusPill } from "../../app/ui";
import { formatAssetType, formatExportStatus, formatStatus } from "../../ui/format";
import type { ViewerLightMode, VisualizationBackground, VisualizationNavItem, VisualizationSection } from "./model";
import { baseName, normalizeArtistStatus, resolveThumbnailSrc } from "./utils";

export function AssetVisualizationWindow({
  asset,
  onClose,
  projectRoot
}: {
  asset: BlendUpAsset;
  onClose: () => void;
  projectRoot?: string;
}) {
  const rendersDir = asset.paths.rendersDir ?? (asset.paths.assetFolder ? `${asset.paths.assetFolder}/renders` : undefined);
  const [renderImages, setRenderImages] = useState<ProjectImageFile[]>([]);
  const [textureImages, setTextureImages] = useState<ProjectImageFile[]>([]);
  const [section, setSection] = useState<VisualizationSection>("model");
  const [background, setBackground] = useState<VisualizationBackground>("studio");
  const [lightMode, setLightMode] = useState<ViewerLightMode>("studio");
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [renderIndex, setRenderIndex] = useState(0);
  const [textureIndex, setTextureIndex] = useState(0);

  useEffect(() => {
    setBackground("studio");
    setLightMode("studio");
    setShowGrid(true);
    setZoom(100);
    setRenderIndex(0);
    setTextureIndex(0);
  }, [asset.id]);

  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      if (!projectRoot) {
        setRenderImages([]);
        setTextureImages([]);
        return;
      }

      const [renders, textures] = await Promise.all([
        listProjectImages(projectRoot, rendersDir).catch(() => []),
        listProjectImages(projectRoot, asset.paths.texturesDir).catch(() => [])
      ]);

      if (!cancelled) {
        setRenderImages(renders);
        setTextureImages(textures);
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.paths.texturesDir, projectRoot, rendersDir]);

  const sections = useMemo(
    () => {
      const nextSections: VisualizationNavItem[] = [];

      if (asset.paths.fbxExport) {
        nextSections.push({
          id: "model",
          icon: <Boxes size={16} />,
          label: "Modele 3D",
          meta: baseName(asset.paths.fbxExport) || "FBX"
        });
      }

      if (renderImages.length > 0) {
        nextSections.push({
          id: "render",
          icon: <ImageIconFiles size={16} />,
          label: "Rendus",
          meta: `${renderImages.length} image(s)`
        });
      }

      if (textureImages.length > 0) {
        nextSections.push({
          id: "textures",
          icon: <ImageIcon size={16} />,
          label: "Textures",
          meta: `${textureImages.length} image(s)`
        });
      }

      return nextSections;
    },
    [asset.paths.fbxExport, renderImages.length, textureImages.length]
  );

  useEffect(() => {
    if (sections.length === 0) {
      return;
    }

    if (!sections.some((item) => item.id === section)) {
      setSection(sections[0].id);
    }
  }, [section, sections]);

  return (
    <div className="asset-visualization-overlay" onClick={onClose} role="presentation">
      <section
        aria-label="Visualisation asset"
        className="asset-visualization-window"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="asset-visualization-header">
          <div>
            <span className="eyebrow">Visualisation asset</span>
            <h2>{assetLabel(asset.displayName)}</h2>
            <small>{formatAssetType(asset.type)} - {asset.displayName}</small>
          </div>
          <div className="visualization-header-meta">
            <StatusPill label={formatStatus(normalizeArtistStatus(asset.status))} tone="blue" />
            <StatusPill
              label={asset.export.lastExportStatus === "success" ? "Export OK" : formatExportStatus(asset.export.lastExportStatus)}
              tone={asset.export.lastExportStatus === "success" ? "green" : "orange"}
            />
            <button className="icon-button" onClick={onClose} title="Fermer" type="button">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="asset-visualization-body">
          <nav aria-label="Sections visualisation" className="visualization-nav">
            {sections.map((item) => (
              <button
                className={section === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setSection(item.id)}
                type="button"
              >
                {item.icon}
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.meta}</small>
                </span>
              </button>
            ))}
          </nav>

          <VisualizationStage
            asset={asset}
            background={background}
            lightMode={lightMode}
            projectRoot={projectRoot}
            renderImages={renderImages}
            renderIndex={renderIndex}
            section={section}
            showGrid={showGrid}
            textureImages={textureImages}
            textureIndex={textureIndex}
            onRenderIndexChange={setRenderIndex}
            onTextureIndexChange={setTextureIndex}
            zoom={zoom}
          />

          <VisualizationSettings
            asset={asset}
            background={background}
            lightMode={lightMode}
            onBackgroundChange={setBackground}
            onLightModeChange={setLightMode}
            onReset={() => {
              setBackground("studio");
              setLightMode("studio");
              setShowGrid(true);
              setZoom(100);
            }}
            onShowGridChange={setShowGrid}
            onZoomChange={setZoom}
            renderImage={renderImages[renderIndex]}
            renderImageCount={renderImages.length}
            section={section}
            showGrid={showGrid}
            textureImage={textureImages[textureIndex]}
            textureImageCount={textureImages.length}
            zoom={zoom}
          />
        </div>
      </section>
    </div>
  );
}

function VisualizationStage({
  asset,
  background,
  lightMode,
  onRenderIndexChange,
  onTextureIndexChange,
  projectRoot,
  renderImages,
  renderIndex,
  section,
  showGrid,
  textureImages,
  textureIndex,
  zoom
}: {
  asset: BlendUpAsset;
  background: VisualizationBackground;
  lightMode: ViewerLightMode;
  onRenderIndexChange: (index: number) => void;
  onTextureIndexChange: (index: number) => void;
  projectRoot?: string;
  renderImages: ProjectImageFile[];
  renderIndex: number;
  section: VisualizationSection;
  showGrid: boolean;
  textureImages: ProjectImageFile[];
  textureIndex: number;
  zoom: number;
}) {
  if (section === "model") {
    return (
      <main className="visualization-stage">
        <FbxModelViewer
          background={background}
          fbxPath={asset.paths.fbxExport}
          lightMode={lightMode}
          projectRoot={projectRoot}
          showGrid={showGrid}
        />
        <div className="viewer-path-list">
          <ViewerPath label="FBX" value={asset.paths.fbxExport} />
        </div>
      </main>
    );
  }

  if (section === "render") {
    return (
      <main className="visualization-stage">
        <ProjectImageGallery
          images={renderImages}
          index={renderIndex}
          label="Rendu"
          onIndexChange={onRenderIndexChange}
          projectRoot={projectRoot}
          zoom={zoom}
        />
        <div className="viewer-path-list">
          <ViewerPath label="Dossier rendus" value={asset.paths.rendersDir ?? (asset.paths.assetFolder ? `${asset.paths.assetFolder}/renders` : undefined)} />
        </div>
      </main>
    );
  }

  if (section === "textures") {
    return (
      <main className="visualization-stage">
        <ProjectImageGallery
          images={textureImages}
          index={textureIndex}
          label="Texture"
          onIndexChange={onTextureIndexChange}
          projectRoot={projectRoot}
          zoom={zoom}
        />
        <div className="viewer-path-list">
          <ViewerPath label="Textures" value={asset.paths.texturesDir} />
        </div>
      </main>
    );
  }

  return (
    <main className="visualization-stage">
      <EmptyState icon={<ImageIcon size={28} />} label="Aucun element visualisable pour cet asset" />
    </main>
  );
}

function FbxModelViewer({
  background,
  fbxPath,
  lightMode,
  projectRoot,
  showGrid
}: {
  background: VisualizationBackground;
  fbxPath?: string;
  lightMode: ViewerLightMode;
  projectRoot?: string;
  showGrid: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const source = resolveThumbnailSrc(fbxPath, projectRoot);
    if (!container || !source) {
      return;
    }

    setError("");
    setIsLoading(true);
    container.innerHTML = "";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(3, 2.2, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.7, 0);

    const ambientIntensity = lightMode === "dramatic" ? 0.55 : lightMode === "soft" ? 1.15 : 0.85;
    const keyIntensity = lightMode === "dramatic" ? 3.2 : lightMode === "soft" ? 1.4 : 2.1;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8797, ambientIntensity));
    const keyLight = new THREE.DirectionalLight(0xffffff, keyIntensity);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8fb7ff, lightMode === "dramatic" ? 0.35 : 0.75);
    fillLight.position.set(-4, 2, -3);
    scene.add(fillLight);

    if (showGrid) {
      const grid = new THREE.GridHelper(8, 16, 0x6f8096, 0xc3cedb);
      grid.position.y = -0.01;
      scene.add(grid);
    }

    const applyBackground = () => {
      if (background === "dark") {
        scene.background = new THREE.Color(0x151b24);
      } else if (background === "checker") {
        scene.background = new THREE.Color(0xf5f7fb);
      } else {
        scene.background = new THREE.Color(0xe7edf5);
      }
    };
    applyBackground();

    let frame = 0;
    let model: THREE.Object3D | null = null;
    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const loader = new FBXLoader();
    loader.load(
      source,
      (object: THREE.Group) => {
        const bounds = new THREE.Box3().setFromObject(object);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z) || 1;
        object.position.sub(center);
        object.scale.multiplyScalar(2.4 / maxAxis);
        scene.add(object);
        model = object;
        controls.target.set(0, 0, 0);
        controls.update();
        setIsLoading(false);
      },
      undefined,
      () => {
        setIsLoading(false);
        setError("Impossible de charger le FBX exporte.");
      }
    );

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (model) {
        model.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
            mesh.geometry.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) {
              material.forEach((item) => item.dispose());
            } else {
              material.dispose();
            }
          }
        });
      }
      container.innerHTML = "";
    };
  }, [background, fbxPath, lightMode, projectRoot, showGrid]);

  if (!fbxPath) {
    return <EmptyState icon={<Boxes size={28} />} label="Aucun export FBX pour cet asset" />;
  }

  return (
    <div className={`fbx-viewer-shell bg-${background}`}>
      <div className="fbx-viewer-canvas" ref={containerRef} />
      {isLoading ? <span className="viewer-loading">Chargement du FBX...</span> : null}
      {error ? <span className="viewer-error">{error}</span> : null}
      <div className="viewer-axis">
        <span>X</span>
        <span>Y</span>
        <span>Z</span>
      </div>
    </div>
  );
}

function ProjectImageGallery({
  images,
  index,
  label,
  onIndexChange,
  projectRoot,
  zoom
}: {
  images: ProjectImageFile[];
  index: number;
  label: string;
  onIndexChange: (index: number) => void;
  projectRoot?: string;
  zoom: number;
}) {
  const image = images[index];
  const [dataUrl, setDataUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!projectRoot || !image) {
        setDataUrl("");
        return;
      }

      setIsLoading(true);
      const next = await readProjectFileDataUrl(projectRoot, image.path).catch(() => "");
      if (!cancelled) {
        setDataUrl(next);
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [image, projectRoot]);

  if (!image) {
    return <EmptyState icon={<ImageIcon size={28} />} label={`Aucun ${label.toLowerCase()} disponible`} />;
  }

  const previous = () => onIndexChange((index - 1 + images.length) % images.length);
  const next = () => onIndexChange((index + 1) % images.length);

  return (
    <div className="image-gallery-viewer">
      <div className="image-gallery-stage">
        {images.length > 1 ? (
          <button className="gallery-arrow previous" onClick={previous} title="Image precedente" type="button">
            <ChevronDown size={20} />
          </button>
        ) : null}
        {dataUrl ? (
          <img alt={image.name} src={dataUrl} style={{ transform: `scale(${zoom / 100})` }} />
        ) : (
          <span className="viewer-loading">{isLoading ? "Chargement..." : "Image indisponible"}</span>
        )}
        {images.length > 1 ? (
          <button className="gallery-arrow next" onClick={next} title="Image suivante" type="button">
            <ChevronDown size={20} />
          </button>
        ) : null}
      </div>
      <div className="image-gallery-footer">
        <strong>{image.name}</strong>
        <span>{index + 1} / {images.length}</span>
      </div>
    </div>
  );
}

function VisualizationSettings({
  asset,
  background,
  lightMode,
  onBackgroundChange,
  onLightModeChange,
  onReset,
  onShowGridChange,
  onZoomChange,
  renderImage,
  renderImageCount,
  section,
  showGrid,
  textureImage,
  textureImageCount,
  zoom
}: {
  asset: BlendUpAsset;
  background: VisualizationBackground;
  lightMode: ViewerLightMode;
  onBackgroundChange: (background: VisualizationBackground) => void;
  onLightModeChange: (mode: ViewerLightMode) => void;
  onReset: () => void;
  onShowGridChange: (show: boolean) => void;
  onZoomChange: (zoom: number) => void;
  renderImage?: ProjectImageFile;
  renderImageCount: number;
  section: VisualizationSection;
  showGrid: boolean;
  textureImage?: ProjectImageFile;
  textureImageCount: number;
  zoom: number;
}) {
  const changeZoom = (value: number) => onZoomChange(Math.max(50, Math.min(180, value)));
  const isImageSection = section === "render" || section === "textures";
  const currentImage = section === "render" ? renderImage : textureImage;
  const imageCount = section === "render" ? renderImageCount : textureImageCount;

  return (
    <aside className="visualization-settings">
      <div className="settings-title-row">
        <div>
          <span className="eyebrow">Affichage</span>
          <h3>Parametres</h3>
        </div>
        <button className="icon-button" onClick={onReset} title="Reinitialiser" type="button">
          <RotateCcw size={16} />
        </button>
      </div>

      {section === "model" ? (
        <>
          <label className="viewer-setting">
            <span>Fond</span>
            <select
              onChange={(event) => onBackgroundChange(event.target.value as VisualizationBackground)}
              value={background}
            >
              <option value="studio">Studio</option>
              <option value="checker">Damier</option>
              <option value="dark">Sombre</option>
            </select>
          </label>
          <label className="viewer-setting">
            <span>Lumieres</span>
            <select onChange={(event) => onLightModeChange(event.target.value as ViewerLightMode)} value={lightMode}>
              <option value="studio">Studio</option>
              <option value="soft">Douces</option>
              <option value="dramatic">Contrastees</option>
            </select>
          </label>
          <div className="viewer-toggle-list">
            <label>
              <input checked={showGrid} onChange={(event) => onShowGridChange(event.target.checked)} type="checkbox" />
              <span>Grille sol</span>
            </label>
          </div>
        </>
      ) : null}

      {isImageSection ? (
        <div className="viewer-setting">
          <span>Zoom image</span>
          <div className="zoom-control">
            <button onClick={() => changeZoom(zoom - 10)} title="Dezoomer" type="button">
              <ZoomOut size={15} />
            </button>
            <input
              max={180}
              min={50}
              onChange={(event) => changeZoom(Number(event.target.value))}
              type="range"
              value={zoom}
            />
            <button onClick={() => changeZoom(zoom + 10)} title="Zoomer" type="button">
              <ZoomIn size={15} />
            </button>
            <strong>{zoom}%</strong>
          </div>
        </div>
      ) : null}

      <div className="viewer-setting-summary">
        <ViewerInfoCard
          detail={section === "model" ? asset.paths.fbxExport ?? "Aucun FBX" : currentImage?.path ?? "Aucune image"}
          icon={section === "model" ? <Boxes size={16} /> : <ImageIcon size={16} />}
          label={section === "model" ? "Fichier visualise" : "Image active"}
          value={section === "model" ? "FBX exporte" : `${imageCount} image(s)`}
        />
        <ViewerInfoCard
          detail={asset.paths.assetFolder ?? "Dossier non defini"}
          icon={<Folder size={16} />}
          label="Asset"
          value={assetLabel(asset.displayName)}
        />
      </div>
    </aside>
  );
}

function ViewerInfoCard({
  detail,
  icon,
  label,
  value
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="viewer-info-card">
      <span className="viewer-info-icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{value}</small>
      </span>
      <em>{detail}</em>
    </div>
  );
}

function ViewerPath({ label, value }: { label: string; value?: string }) {
  return (
    <div className={value ? "viewer-path" : "viewer-path missing"}>
      <span>{label}</span>
      <code>{value ?? "Manquant"}</code>
    </div>
  );
}
