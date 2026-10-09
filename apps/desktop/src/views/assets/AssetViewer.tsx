import { Focus, Image as ImageIcon, LoaderCircle, PackageOpen, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { listProjectImages, readProjectFileDataUrl, type ProjectImageFile } from "../../blendup/projectLoader";
import type { BlendUpAsset } from "../../blendup/types";
import { AnimationPlayback } from "./animationPlayback";

export function AssetViewer({ asset, projectRoot }: { asset: BlendUpAsset; projectRoot: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const playback = useRef<AnimationPlayback | null>(null);
  const skeleton = useRef<THREE.SkeletonHelper | null>(null);
  const refit = useRef<(() => void) | null>(null);
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);
  const [clipIndex, setClipIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);

  const chooseClip = (index: number) => {
    playback.current?.select(index);
    setClipIndex(index);
    setTime(0);
    setPlaying(false);
  };
  const duration = clips[clipIndex]?.duration ?? 0;

  useEffect(() => {
    const element = host.current;
    setClips([]);
    setClipIndex(-1);
    setPlaying(false);
    setTime(0);
    setSpeed(1);
    setLoop(true);
    setShowSkeleton(false);
    if (!element || asset.status === "ready" || asset.status === "error") {
      setState("missing");
      return;
    }
    let disposed = false;
    let animationFrame = 0;
    let lastFrame = performance.now();
    let lastUiUpdate = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121715);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
    camera.position.set(3, 2.2, 3);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setState("error");
      return;
    }
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
      const now = performance.now();
      playback.current?.update(Math.min((now - lastFrame) / 1000, 0.1));
      lastFrame = now;
      if (now - lastUiUpdate > 100 && playback.current) {
        setTime(playback.current.time);
        setPlaying(playback.current.playing);
        lastUiUpdate = now;
      }
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    const disposeObject = (object: THREE.Object3D) => {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) value.dispose(); });
            material.dispose();
          });
          if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
        }
      });
    };
    const fit = (object: THREE.Object3D, animations: THREE.AnimationClip[]) => {
      if (disposed) { disposeObject(object); return; }
      object.updateMatrixWorld(true);
      const modelBounds = () => {
        const bounds = new THREE.Box3();
        object.traverse((child) => {
          if (child instanceof THREE.SkinnedMesh) {
            child.computeBoundingBox();
            bounds.union(new THREE.Box3().setFromObject(child));
          }
        });
        // A character's ground plane must not shrink the character to a tiny dot.
        return bounds.isEmpty() ? bounds.setFromObject(object) : bounds;
      };
      const bounds = modelBounds();
      if (bounds.isEmpty()) { disposeObject(object); setState("error"); return; }
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z, 0.1);
      // Center a wrapper: animation tracks may target the model's own root position.
      const wrapper = new THREE.Group();
      wrapper.position.set(-center.x, -bounds.min.y, -center.z);
      wrapper.add(object);
      scene.add(wrapper);
      camera.position.set(max * 1.65, max * 1.1 + size.y / 2, max * 1.65);
      camera.near = Math.max(max / 1000, 0.001);
      camera.far = max * 100;
      camera.updateProjectionMatrix();
      controls.target.set(0, size.y / 2, 0);
      controls.update();
      refit.current = () => {
        object.updateMatrixWorld(true);
        const current = modelBounds();
        const target = current.getCenter(new THREE.Vector3());
        const size = current.getSize(new THREE.Vector3());
        const max = Math.max(size.x, size.y, size.z, 0.1);
        controls.target.copy(target);
        camera.position.copy(target).add(new THREE.Vector3(max * 1.65, max * 1.1, max * 1.65));
        controls.update();
      };
      const animated = animations.filter((clip) => clip.duration > 0 && clip.tracks.length > 0);
      playback.current = new AnimationPlayback(object, animated);
      setClips(animated);
      const initial = animated.findIndex((clip) => clip.name.toLowerCase() === "idle");
      const index = animated.length ? Math.max(initial, 0) : -1;
      playback.current.select(index);
      setClipIndex(index);
      const helper = new THREE.SkeletonHelper(object);
      helper.visible = false;
      scene.add(helper);
      skeleton.current = helper;
      setState("ready");
    };

    setState("loading");
    void readProjectFileDataUrl(projectRoot, asset.outputPath)
      .then((url) => {
        if (disposed) return;
        if (!url) return setState("missing");
        const failed = () => { if (!disposed) setState("error"); };
        if (asset.format === "glb") {
          new GLTFLoader().load(url, (result) => fit(result.scene, result.animations), undefined, failed);
        } else {
          new FBXLoader().load(url, (object) => fit(object, object.animations), undefined, failed);
        }
      })
      .catch(() => { if (!disposed) setState("missing"); });

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      playback.current?.dispose();
      playback.current = null;
      skeleton.current?.dispose();
      skeleton.current = null;
      refit.current = null;
      controls.dispose();
      disposeObject(scene);
      scene.traverse((child) => { if (child instanceof THREE.GridHelper) child.dispose(); });
      renderer.dispose();
      element.replaceChildren();
    };
  }, [asset.format, asset.outputModifiedAt, asset.outputPath, asset.status, projectRoot]);

  return (
    <div className="asset-preview">
      <div className="asset-viewer-wrap">
      <div className="asset-viewer" ref={host} />
      {state !== "ready" ? (
        <div className="asset-viewer-state">
          {state === "loading" ? <LoaderCircle className="spin" size={28} /> : <PackageOpen size={30} />}
          <strong>{state === "loading" ? "Chargement de l'aperçu…" : state === "error" ? "Aperçu indisponible" : asset.status === "local" ? "Génère l’aperçu pour afficher cet asset" : "Exporte l’asset pour l’afficher"}</strong>
          <span>{asset.status === "local" ? "L’aperçu reste dans le cache local du projet." : `Le fichier ${asset.format.toUpperCase()} est utilisé directement.`}</span>
        </div>
      ) : null}
      </div>
      {state === "ready" ? <div className="animation-controls">
        <div className="animation-heading"><strong>Animations <span>· {clips.length} clip{clips.length > 1 ? "s" : ""}</span></strong><button className="small" type="button" onClick={() => refit.current?.()}><Focus size={13} /> Recentrer</button></div>
        {asset.status === "outdated" ? <p className="animation-notice">Cet aperçu utilise le dernier export. Réexporte pour voir tes modifications.</p> : null}
        {clips.length ? <>
          <select aria-label="Animation" value={clipIndex} onChange={(event) => chooseClip(Number(event.target.value))}>
            <option value={-1}>Pose de repos</option>
            {clips.map((clip, index) => <option key={index} value={index}>{clip.name} · {clip.duration.toFixed(2)} s</option>)}
          </select>
          <div className="animation-transport">
            <button aria-label={playing ? "Mettre en pause" : "Lire l’animation"} disabled={clipIndex < 0} type="button" onClick={() => { playback.current?.setPlaying(!playing); setPlaying(playback.current?.playing ?? false); }}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button aria-label="Revenir au début" disabled={clipIndex < 0} type="button" onClick={() => { playback.current?.seek(0); setTime(0); }}><RotateCcw size={15} /></button>
            <input aria-label="Position dans l’animation" type="range" min={0} max={duration || 1} step={0.001} value={time} disabled={clipIndex < 0} onChange={(event) => { const value = Number(event.target.value); playback.current?.seek(value); setTime(value); }} />
            <output>{time.toFixed(2)} / {duration.toFixed(2)} s</output>
          </div>
          <div className="animation-options">
            <label>Vitesse <select aria-label="Vitesse de lecture" value={speed} onChange={(event) => { const value = Number(event.target.value); setSpeed(value); if (playback.current) playback.current.speed = value; }}>
              {[0.25, 0.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
            </select></label>
            <label><input type="checkbox" checked={loop} onChange={(event) => { setLoop(event.target.checked); playback.current?.setLoop(event.target.checked); }} /> Boucle</label>
            <label><input type="checkbox" checked={showSkeleton} onChange={(event) => { setShowSkeleton(event.target.checked); if (skeleton.current) skeleton.current.visible = event.target.checked; }} /> Squelette</label>
          </div>
        </> : <p className="animation-notice">Aucune animation dans ce fichier. Si le personnage est animé dans Blender, réexporte l’asset.</p>}
      </div> : null}
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
  }, [directory, projectRoot, asset.metadata.thumbnailPath, asset.sourceModifiedAt]);

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
