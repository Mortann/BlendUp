import { Image as ImageIcon, LoaderCircle, PackageOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { listProjectImages, readProjectFileDataUrl, type ProjectImageFile } from "../../blendup/projectLoader";
import type { BlendUpAsset } from "../../blendup/types";

export function AssetViewer({ asset, projectRoot }: { asset: BlendUpAsset; projectRoot: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    const element = host.current;
    if (!element || asset.status === "ready" || asset.status === "error") {
      setState("missing");
      return;
    }
    let disposed = false;
    let animationFrame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121715);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
    camera.position.set(3, 2.2, 3);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.replaceChildren(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x24332d, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(4, 7, 5);
    scene.add(key, new THREE.GridHelper(12, 24, 0x38534a, 0x26332e));

    const resize = () => {
      if (!element.clientWidth || !element.clientHeight) return;
      camera.aspect = element.clientWidth / element.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const render = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    const fit = (object: THREE.Object3D) => {
      scene.add(object);
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z, 0.1);
      object.position.sub(center);
      camera.position.set(max * 1.65, max * 1.1, max * 1.65);
      camera.near = Math.max(max / 1000, 0.001);
      camera.far = max * 100;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
      setState("ready");
    };

    setState("loading");
    void readProjectFileDataUrl(projectRoot, asset.outputPath)
      .then((url) => {
        if (disposed || !url) return setState("missing");
        if (asset.format === "glb") {
          new GLTFLoader().load(url, (result) => fit(result.scene), undefined, () => setState("error"));
        } else {
          new FBXLoader().load(url, fit, undefined, () => setState("error"));
        }
      })
      .catch(() => setState("missing"));

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      controls.dispose();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      renderer.dispose();
      element.replaceChildren();
    };
  }, [asset.format, asset.outputPath, asset.status, projectRoot]);

  return (
    <div className="asset-viewer-wrap">
      <div className="asset-viewer" ref={host} />
      {state !== "ready" ? (
        <div className="asset-viewer-state">
          {state === "loading" ? <LoaderCircle className="spin" size={28} /> : <PackageOpen size={30} />}
          <strong>{state === "loading" ? "Chargement de l'aperçu…" : state === "error" ? "Aperçu indisponible" : "Exporte l'asset pour l'afficher"}</strong>
          <span>Le fichier {asset.format.toUpperCase()} est utilisé directement.</span>
        </div>
      ) : null}
    </div>
  );
}

export function AssetImageGallery({
  asset,
  kind,
  onAdd,
  projectRoot
}: {
  asset: BlendUpAsset;
  kind: "renders" | "textures";
  onAdd: () => void;
  projectRoot: string;
}) {
  const [images, setImages] = useState<Array<ProjectImageFile & { source?: string }>>([]);
  const directory = `${asset.folder}/${kind}`;

  useEffect(() => {
    let cancelled = false;
    void listProjectImages(projectRoot, directory).then(async (files) => {
      const loaded = await Promise.all(files.map(async (file) => ({
        ...file,
        source: await readProjectFileDataUrl(projectRoot, file.path).catch(() => "")
      })));
      if (!cancelled) setImages(loaded);
    }).catch(() => { if (!cancelled) setImages([]); });
    return () => { cancelled = true; };
  }, [directory, projectRoot, asset.metadata.thumbnailPath]);

  return (
    <div className="asset-gallery-section">
      <div className="detail-section-heading">
        <div><strong>{kind === "renders" ? "Rendus" : "Textures"}</strong><span>{images.length} image{images.length > 1 ? "s" : ""}</span></div>
        <button className="small" onClick={onAdd} type="button"><ImageIcon size={14} /> Ajouter</button>
      </div>
      {images.length ? <div className="asset-gallery">{images.map((file) => <img alt={file.name} key={file.path} src={file.source} title={file.name} />)}</div> : <p className="muted-copy">Aucune image dans ce dossier.</p>}
    </div>
  );
}
