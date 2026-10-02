import { Boxes, ExternalLink, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { FolderShowcase } from "../../blendup/types";

export function ShowcaseCard({ scene, busy, onOpen, onRefresh, onConfigure, onExportMissing }: {
  scene: FolderShowcase; busy: boolean;
  onOpen: (editor: "blender" | "godot") => void;
  onRefresh: () => void;
  onConfigure: (enabled: boolean, spacing?: number) => void;
  onExportMissing: () => Promise<void>;
}) {
  const [spacing, setSpacing] = useState(scene.spacing);
  const [exporting, setExporting] = useState(false);
  const generating = busy || scene.status === "generating";
  const missing = scene.assetCount - scene.godotCount;
  return <article className="showcase-card" aria-label={`Showcase ${scene.folder}`}>
    <div className="showcase-visual"><Boxes size={48} strokeWidth={1.3} /><span>SHOWCASE</span><small>Scène d’ensemble</small></div>
    <div className="showcase-content">
      <strong>Showcase · {scene.folder.split("/").at(-1)}</strong>
      <p>{scene.assetCount} asset{scene.assetCount > 1 ? "s" : ""} · sous-dossiers inclus</p>
      <span className="showcase-status">{generating ? <><LoaderCircle className="spin" size={14} /> Génération…</> : scene.status === "error" ? <><TriangleAlert size={14} /> Génération partielle ou impossible</> : "Échelle réelle · sol neutre"}</span>
      {scene.godotPath && missing > 0 ? <p className="showcase-warning">Godot : {missing} asset{missing > 1 ? "s" : ""} à exporter ou à corriger.</p> : null}
      {scene.godotPath && missing > 0 ? <button disabled={exporting} className="showcase-export" onClick={() => { setExporting(true); void onExportMissing().finally(() => setExporting(false)); }} type="button">{exporting ? <LoaderCircle className="spin" size={12} /> : null}{exporting ? "Export en cours…" : "Exporter les assets manquants"}</button> : null}
      <div className="showcase-actions">
        <button disabled={generating || (scene.status === "error" && scene.includedCount === 0)} onClick={() => onOpen("blender")} type="button"><ExternalLink size={14} /> Blender</button>
        {scene.godotPath ? <button disabled={generating} onClick={() => onOpen("godot")} type="button"><ExternalLink size={14} /> Godot</button> : null}
        <button disabled={generating} onClick={onRefresh} title="Régénérer les scènes" aria-label="Régénérer le Showcase" type="button"><RefreshCw size={14} /></button>
      </div>
      <details><summary>Options de la scène</summary>
        <label>Espacement minimum (m)<input aria-label="Espacement du Showcase" disabled={generating} type="number" min="0.1" max="100" step="0.1" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} /></label>
        <button disabled={generating || spacing === scene.spacing || !Number.isFinite(spacing) || spacing < 0.1 || spacing > 100} onClick={() => onConfigure(true, spacing)} type="button">Appliquer</button>
        <p>Les scènes sont régénérées après les changements. Fais une copie pour conserver tes propres modifications.</p>
        {scene.error ? <p className="field-error">{scene.error}</p> : null}
        <button disabled={generating} onClick={() => onConfigure(false)} type="button">Désactiver le Showcase</button>
      </details>
    </div>
  </article>;
}
