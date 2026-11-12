import { Boxes, ExternalLink, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { FolderShowcase, ShowcaseOptions } from "../../blendup/types";

const ratioPresets = [
  { id: "auto", label: "Automatique", ratio: null },
  { id: "square", label: "Carré (1:1)", ratio: 1 },
  { id: "landscape", label: "Paysage (16:9)", ratio: 16 / 9 },
  { id: "portrait", label: "Portrait (9:16)", ratio: 9 / 16 }
];

export function ShowcaseCard({ scene, busy, onOpen, onRefresh, onConfigure, onExportMissing }: {
  scene: FolderShowcase; busy: boolean;
  onOpen: (editor: "blender" | "godot") => void;
  onRefresh: () => void;
  onConfigure: (enabled: boolean, options?: ShowcaseOptions) => Promise<boolean>;
  onExportMissing: (ids: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<{
    spacing: string;
    ratioMode: string;
    customRatio: string;
    sortOrder: ShowcaseOptions["sortOrder"];
    excludedAssetIds: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const generating = busy || scene.status === "generating";
  const locked = generating || saving;
  const saved = scene.options;
  const form = draft ?? {
    spacing: String(saved.spacing),
    ratioMode: ratioPresets.find(({ ratio }) => ratio === saved.aspectRatio)?.id ?? "custom",
    customRatio: String(saved.aspectRatio ?? 1),
    sortOrder: saved.sortOrder,
    excludedAssetIds: saved.excludedAssetIds
  };
  const savedExclusions = new Set(saved.excludedAssetIds);
  const exclusions = new Set(form.excludedAssetIds);
  const assets = useMemo(() => [...scene.assets].sort((a, b) =>
    a.folder.localeCompare(b.folder, "fr") || a.name.localeCompare(b.name, "fr")), [scene.assets]);
  const selected = assets.filter((asset) => !savedExclusions.has(asset.id));
  const selectedInForm = assets.filter((asset) => !exclusions.has(asset.id)).length;
  const missing = selected.filter((asset) => !asset.godotReady).map((asset) => asset.id);
  const spacing = Number(form.spacing);
  const aspectRatio = form.ratioMode === "custom" ? Number(form.customRatio) :
    ratioPresets.find(({ id }) => id === form.ratioMode)?.ratio ?? null;
  const valid = spacing >= 0.1 && spacing <= 100 && (aspectRatio === null || (aspectRatio >= 0.1 && aspectRatio <= 10));
  const changed = spacing !== saved.spacing || aspectRatio !== saved.aspectRatio || form.sortOrder !== saved.sortOrder ||
    exclusions.size !== savedExclusions.size || form.excludedAssetIds.some((id) => !savedExclusions.has(id));

  const setIncluded = (ids: string[], included: boolean) => {
    for (const id of ids) {
      if (included) exclusions.delete(id);
      else exclusions.add(id);
    }
    setDraft({ ...form, excludedAssetIds: [...exclusions] });
  };

  return <article className="showcase-card" aria-label={`Showcase ${scene.folder}`}>
    <div className="showcase-visual"><Boxes size={48} strokeWidth={1.3} /><span>SHOWCASE</span><small>Scène d’ensemble</small></div>
    <div className="showcase-content">
      <strong>Showcase · {scene.folder.split("/").at(-1)}</strong>
      <p>{selected.length} / {assets.length} assets sélectionnés</p>
      <span className="showcase-status">{generating ? <><LoaderCircle className="spin" size={14} /> Génération…</> : scene.status === "error" ? <><TriangleAlert size={14} /> Génération partielle ou impossible</> : "Échelle réelle · sol neutre"}</span>
      {scene.godotPath && missing.length > 0 ? <>
        <p className="showcase-warning">Godot · {missing.length} à exporter ou à corriger</p>
        <button disabled={exporting || saving} className="showcase-export" onClick={() => { setExporting(true); void onExportMissing(missing).finally(() => setExporting(false)); }} type="button">{exporting ? <LoaderCircle className="spin" size={12} /> : null}{exporting ? "Export en cours…" : "Exporter les assets manquants"}</button>
      </> : null}
      <div className="showcase-actions">
        <button disabled={locked || (scene.status === "error" && scene.includedCount === 0)} onClick={() => onOpen("blender")} type="button"><ExternalLink size={14} /> Blender</button>
        {scene.godotPath ? <button disabled={locked || (scene.status === "error" && scene.godotCount === 0)} onClick={() => onOpen("godot")} type="button"><ExternalLink size={14} /> Godot</button> : null}
        <button disabled={locked} onClick={onRefresh} title="Régénérer les scènes" aria-label="Régénérer le Showcase" type="button"><RefreshCw size={14} /></button>
      </div>
      <details><summary>Options de la scène</summary>
        <form className="showcase-options" onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !changed || locked) return;
          setSaving(true);
          void onConfigure(true, { spacing, aspectRatio, sortOrder: form.sortOrder, excludedAssetIds: form.excludedAssetIds })
            .then((saved) => { if (saved) setDraft(null); })
            .finally(() => setSaving(false));
        }}>
          <label>Espacement minimum (m)<input disabled={locked} required type="number" min="0.1" max="100" step="any" value={form.spacing} onChange={(e) => setDraft({ ...form, spacing: e.target.value })} /></label>
          <label>Forme du sol<select disabled={locked} value={form.ratioMode} onChange={(e) => setDraft({ ...form, ratioMode: e.target.value })}>
            {ratioPresets.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            <option value="custom">Ratio personnalisé</option>
          </select></label>
          {form.ratioMode === "custom" ? <label>Largeur / profondeur<input disabled={locked} required type="number" min="0.1" max="10" step="any" value={form.customRatio} onChange={(e) => setDraft({ ...form, customRatio: e.target.value })} /></label> : null}
          <label>Ordre des assets<select disabled={locked} value={form.sortOrder} onChange={(e) => setDraft({ ...form, sortOrder: e.target.value as ShowcaseOptions["sortOrder"] })}>
            <option value="default">Par défaut</option>
            <option value="smallFirst">Les plus bas devant</option>
            <option value="folder">Par sous-dossier</option>
          </select></label>
          <fieldset disabled={locked}>
            <legend>Assets du Showcase ({selectedInForm} / {assets.length})</legend>
            {assets.length ? <>
              <div className="showcase-actions">
                <button disabled={selectedInForm === assets.length} onClick={() => setIncluded(assets.map(({ id }) => id), true)} type="button">Tout cocher</button>
                <button disabled={selectedInForm === 0} onClick={() => setIncluded(assets.map(({ id }) => id), false)} type="button">Tout décocher</button>
              </div>
              <ul className="showcase-assets">
                {assets.map((asset) => <li key={asset.id}>
                  <label>
                    <input type="checkbox" checked={!exclusions.has(asset.id)} onChange={(e) => setIncluded([asset.id], e.target.checked)} />
                    <span>{asset.name}{asset.folder !== scene.folder ? <small>{asset.folder.slice(scene.folder.length + 1)}</small> : null}</span>
                  </label>
                </li>)}
              </ul>
            </> : <p>Ce dossier ne contient aucun asset.</p>}
          </fieldset>
          <button disabled={locked || !valid || !changed} type="submit">Appliquer</button>
        </form>
        <p>Les scènes sont régénérées après les changements. Fais une copie pour conserver tes propres modifications.</p>
        {scene.error ? <p className="field-error">{scene.error}</p> : null}
        <button disabled={locked} onClick={() => {
          setSaving(true);
          void onConfigure(false).finally(() => setSaving(false));
        }} type="button">Désactiver le Showcase</button>
      </details>
    </div>
  </article>;
}
