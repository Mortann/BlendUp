import { ExternalLink, FolderOpen, ImagePlus, LoaderCircle, Maximize2, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { listProjectImages, readProjectFileDataUrl, type ProjectImageFile } from "../../blendup/projectLoader";
import type { BlendUpAsset } from "../../blendup/types";
import { formatBytes } from "./utils";
import { isTextureBackup, textureLabels, textureUsage, type TextureUsage } from "./textures";

export function TextureWorkspace({ asset, projectRoot, onAdd, onOpen, onOpenBlender }: {
  asset: BlendUpAsset; projectRoot: string; onAdd: () => Promise<void>; onOpen: (path: string) => void; onOpenBlender: () => void;
}) {
  const [files, setFiles] = useState<ProjectImageFile[]>([]);
  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState<TextureUsage | "all">("all");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBackups, setShowBackups] = useState(false);
  const [selected, setSelected] = useState<ProjectImageFile | null>(null);
  const directory = `${asset.folder}/textures`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void listProjectImages(projectRoot, directory).then((images) => { if (!cancelled) setFiles(images); })
      .catch((reason) => { if (!cancelled) { setError(String(reason)); setFiles([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [directory, projectRoot, revision, asset.sourceModifiedAt]);

  const available = useMemo(() => files.filter((file) => showBackups || !isTextureBackup(file.path)), [files, showBackups]);
  const filtered = available.filter((file) => (usage === "all" || textureUsage(file.name) === usage) && file.path.toLowerCase().includes(query.toLowerCase()));
  return <div className="texture-workspace">
    <div className="texture-bake-intro"><strong>Bake HIGH → LOW</strong><p>Dans Blender, ouvre la barre latérale <b>BlendUp → Textures · Bake</b>. Les normales 2K sont proposées par défaut. Le bake crée les PNG et branche le matériau du LOW.</p>
      <button className="primary" onClick={onOpenBlender} type="button"><ExternalLink size={14} /> Ouvrir les outils dans Blender</button>
      <details><summary>Organiser un asset</summary><p>Sélectionne ton LOW et clique sur <b>Créer le HIGH</b> dans <b>Assets de bake</b>. Le maillage est dupliqué et la paire organisée sous un objet <b>· Asset</b> dépliable dans l’Outliner. Pour deux versions déjà créées, sélectionne les HIGH puis le LOW en dernier et clique sur <b>Organiser la paire</b>. Les boutons LOW / HIGH ajoutent ou retirent chaque version de la sélection ; <b>Tous</b> sélectionne la paire et les yeux contrôlent la visibilité. Le LOW doit avoir ses UV.</p><p>Pour partager un matériau entre plusieurs pièces, choisis leur <b>Matériau source</b> dans <b>Textures · Bake</b>. Le bake prépare un atlas et un matériau commun « Nom Bake ». <b>Regrouper les bakes existants</b> réutilise les cartes déjà calculées. Les UV d’origine et les matériaux HIGH sont conservés.</p><p>Les cartes sont enregistrées dans <code>textures/bakes/NomDuFichier/</code>. Les textures remplacées sont sauvegardées ; les HIGH, CAGE et objets de regroupement sont ignorés à l’export.</p></details>
    </div>
    <div className="detail-section-heading"><div><strong>Bibliothèque de textures</strong><span>{available.length} image{available.length > 1 ? "s" : ""}</span></div>
      <div className="texture-actions"><button className="small" title="Actualiser les textures" aria-label="Actualiser les textures" onClick={() => setRevision((v) => v + 1)} type="button"><RefreshCw size={14} /></button><button className="small" onClick={() => void onAdd().then(() => setRevision((v) => v + 1))} type="button"><ImagePlus size={14} /> Importer</button><button className="small" onClick={() => onOpen(asset.folder)} title="Ouvrir le dossier de l’asset" type="button"><FolderOpen size={14} /></button></div>
    </div>
    <label className="texture-search"><Search size={14} /><input aria-label="Rechercher une texture" placeholder="Rechercher une texture…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <div className="texture-filters"><button className={usage === "all" ? "active" : ""} onClick={() => setUsage("all")} type="button">Toutes</button>{(Object.keys(textureLabels) as TextureUsage[]).filter((key) => available.some((file) => textureUsage(file.name) === key)).map((key) => <button key={key} className={usage === key ? "active" : ""} onClick={() => setUsage(key)} type="button">{textureLabels[key]}</button>)}</div>
    <label className="texture-backups"><input type="checkbox" checked={showBackups} onChange={(e) => setShowBackups(e.target.checked)} /> Afficher les sauvegardes des bakes</label>
    {loading ? <p className="muted-copy"><LoaderCircle className="spin" size={16} /> Chargement…</p> : error ? <p role="alert" className="muted-copy">{error}</p> : !filtered.length ? <p className="muted-copy">{available.length ? "Aucune texture ne correspond aux filtres." : "Importe tes textures ou lance un bake dans Blender, puis actualise cette liste."}</p> : null}
    <div className="texture-grid">{filtered.map((file) => <TextureCard key={`${file.path}:${file.modifiedAt}:${revision}`} file={file} projectRoot={projectRoot} onSelect={() => setSelected(file)} />)}</div>
    {selected ? <TextureInspector file={selected} projectRoot={projectRoot} onClose={() => setSelected(null)} onOpen={() => onOpen(selected.path)} /> : null}
  </div>;
}

function TextureCard({ file, projectRoot, onSelect }: { file: ProjectImageFile; projectRoot: string; onSelect: () => void }) {
  const host = useRef<HTMLButtonElement>(null);
  const [source, setSource] = useState("");
  const [size, setSize] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void readProjectFileDataUrl(projectRoot, file.path).then((url) => { if (!cancelled) setSource(url); }).catch(() => { if (!cancelled) setError(true); });
    }, { rootMargin: "150px" });
    if (host.current) observer.observe(host.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [file.path, projectRoot]);
  const usage = textureUsage(file.name);
  return <button ref={host} className="texture-card" onClick={onSelect} type="button" title={file.path}>
    <div className="texture-thumbnail">{source && !error ? <img src={source} alt={file.name} onLoad={(e) => setSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} onError={() => setError(true)} /> : <span>{error ? "Aperçu indisponible" : "Chargement…"}</span>}<Maximize2 size={15} /></div>
    <strong>{file.name}</strong><span>{textureLabels[usage]} · {size || "Image"}</span><small>{usage === "color" || usage === "emission" ? "sRGB" : usage === "other" ? "Usage à préciser" : "Non-Color"}{file.sizeBytes !== undefined ? ` · ${formatBytes(file.sizeBytes)}` : ""}</small>
  </button>;
}

function TextureInspector({ file, projectRoot, onClose, onOpen }: { file: ProjectImageFile; projectRoot: string; onClose: () => void; onOpen: () => void }) {
  const [source, setSource] = useState("");
  const [error, setError] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [dimensions, setDimensions] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let cancelled = false;
    void readProjectFileDataUrl(projectRoot, file.path).then((url) => { if (!cancelled) setSource(url); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [file.path, projectRoot]);
  return <dialog ref={dialog} className="texture-inspector" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <header><div><strong>{file.name}</strong><span>{textureLabels[textureUsage(file.name)]}{dimensions ? ` · ${dimensions}` : ""}</span></div><button className="icon-button" aria-label="Fermer l’aperçu" onClick={onClose} type="button"><X size={18} /></button></header>
    <div className={`texture-inspector-image ${actualSize ? "actual-size" : ""}`}>{error ? <p>Aperçu non pris en charge. Ouvre le fichier dans ton éditeur d’images.</p> : source ? <img src={source} alt={file.name} onError={() => setError(true)} onLoad={(e) => setDimensions(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} /> : <LoaderCircle className="spin" size={28} />}</div>
    <footer><code title={file.path}>{file.path}</code><button onClick={() => setActualSize((v) => !v)} type="button">{actualSize ? "Ajuster" : "100 %"}</button><button onClick={onOpen} type="button"><ExternalLink size={14} /> Ouvrir</button></footer>
  </dialog>;
}
