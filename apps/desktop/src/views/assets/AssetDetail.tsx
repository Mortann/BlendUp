import {
  Box,
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Plus,
  Save,
  Tag,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AssetItemStatus, AssetLod, AssetVariant, BlendUpAsset } from "../../blendup/types";
import { formatBytes, formatTimestamp, statusLabel } from "./utils";
import { AssetImageGallery, AssetViewer } from "./AssetViewer";

type DetailTab = "overview" | "preview" | "variants" | "lods" | "files";

export function AssetDetail({
  asset,
  exporting,
  onAddImages,
  onClose,
  onExport,
  onOpen,
  onOpenPath,
  onSave,
  onSetThumbnail,
  projectRoot
}: {
  asset: BlendUpAsset;
  exporting: boolean;
  onAddImages: (kind: "renders" | "textures") => void;
  onClose: () => void;
  onExport: () => void;
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onSave: (notes: string, tags: string[], variants: AssetVariant[], lods: AssetLod[]) => Promise<unknown>;
  onSetThumbnail: () => void;
  projectRoot: string;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [notes, setNotes] = useState(asset.metadata.notes);
  const [tags, setTags] = useState(asset.metadata.tags.join(", "));
  const [variants, setVariants] = useState(asset.metadata.variants);
  const [lods, setLods] = useState(asset.metadata.lods);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(asset.metadata.notes);
    setTags(asset.metadata.tags.join(", "));
    setVariants(asset.metadata.variants);
    setLods(asset.metadata.lods);
  }, [asset.id, asset.metadata]);

  const save = async () => {
    setSaving(true);
    await onSave(notes, tags.split(",").map((tag) => tag.trim()).filter(Boolean), variants, lods);
    setSaving(false);
  };

  return (
    <aside className="asset-detail" aria-label={`Détails de ${asset.name}`}>
      <header className="asset-detail-header">
        <div className="asset-detail-title"><span><Box size={20} /></span><div><strong>{asset.name}</strong><small>{asset.folder}</small></div></div>
        <button aria-label="Fermer" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
      </header>

      <div className="asset-detail-actions">
        <button onClick={onOpen} type="button"><ExternalLink size={15} /> Blender</button>
        <button className="primary" disabled={exporting} onClick={onExport} type="button"><Upload size={15} /> {asset.status === "exported" ? "Réexporter" : "Exporter"}</button>
      </div>

      <nav className="detail-tabs" aria-label="Sections de l'asset">
        {([
          ["overview", "Informations"], ["preview", "Aperçu"], ["variants", `Variantes ${variants.length || ""}`],
          ["lods", `LOD ${lods.length || ""}`], ["files", "Fichiers"]
        ] as Array<[DetailTab, string]>).map(([id, label]) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
        ))}
      </nav>

      <div className="asset-detail-body">
        {tab === "overview" ? (
          <>
            <div className="asset-overview-hero">
              <AssetViewer asset={asset} projectRoot={projectRoot} />
              <button className="small" onClick={onSetThumbnail} type="button"><ImageIcon size={14} /> Choisir la miniature</button>
            </div>
            <label className="field"><span>Notes</span><textarea onChange={(event) => setNotes(event.target.value)} placeholder="Intention, remarques ou points à vérifier…" rows={5} value={notes} /></label>
            <label className="field"><span><Tag size={13} /> Tags</span><input onChange={(event) => setTags(event.target.value)} placeholder="environment, stone, modular" value={tags} /></label>
            <div className="detail-info-grid">
              <Info label="État" value={statusLabel(asset.status)} />
              <Info label="Format" value={asset.format.toUpperCase()} />
              <Info label="Taille source" value={formatBytes(asset.sizeBytes)} />
              <Info label="Modifié" value={formatTimestamp(asset.sourceModifiedAt)} />
            </div>
          </>
        ) : null}

        {tab === "preview" ? (
          <>
            <AssetViewer asset={asset} projectRoot={projectRoot} />
            <AssetImageGallery asset={asset} kind="renders" onAdd={() => onAddImages("renders")} projectRoot={projectRoot} />
            <AssetImageGallery asset={asset} kind="textures" onAdd={() => onAddImages("textures")} projectRoot={projectRoot} />
          </>
        ) : null}

        {tab === "variants" ? (
          <ItemEditor
            empty="Aucune variante. Ajoute par exemple une couleur, une forme ou une version endommagée."
            icon={<Layers3 size={24} />}
            items={variants}
            kind="variant"
            onChange={setVariants}
          />
        ) : null}

        {tab === "lods" ? (
          <ItemEditor
            empty="Aucun niveau de détail. Les LOD restent une aide de suivi et sont enregistrés avec l'asset."
            icon={<Layers3 size={24} />}
            items={lods}
            kind="lod"
            onChange={setLods}
          />
        ) : null}

        {tab === "files" ? (
          <div className="detail-file-list">
            <FileRow label="Source Blender" onOpen={() => onOpenPath(asset.sourcePath)} path={asset.sourcePath} />
            <FileRow label={`Export ${asset.format.toUpperCase()}`} onOpen={() => onOpenPath(asset.outputPath)} path={asset.outputPath} />
            <FileRow label="Dossier de travail" onOpen={() => onOpenPath(asset.folder)} path={asset.folder} />
          </div>
        ) : null}
      </div>

      {(tab === "overview" || tab === "variants" || tab === "lods") ? (
        <footer className="asset-detail-footer"><button className="primary full" disabled={saving} onClick={() => void save()} type="button"><Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer"}</button></footer>
      ) : null}
    </aside>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function FileRow({ label, onOpen, path }: { label: string; onOpen: () => void; path: string }) {
  return <button className="detail-file-row" onClick={onOpen} type="button"><div><strong>{label}</strong><code>{path}</code></div><ExternalLink size={15} /></button>;
}

function ItemEditor({
  empty,
  icon,
  items,
  kind,
  onChange
}: {
  empty: string;
  icon: ReactNode;
  items: AssetVariant[] | AssetLod[];
  kind: "variant" | "lod";
  onChange: (items: never) => void;
}) {
  const add = () => {
    const id = `${kind}_${Date.now().toString(36)}`;
    const item = kind === "variant"
      ? { id, name: `Variante ${items.length + 1}`, notes: "", status: "planned" as const }
      : { id, level: `LOD ${items.length}`, notes: "", status: "planned" as const, targetRatio: 50 };
    onChange([...items, item] as never);
  };
  const update = (index: number, patch: Record<string, unknown>) => {
    onChange(items.map((item, current) => current === index ? { ...item, ...patch } : item) as never);
  };
  const remove = (index: number) => onChange(items.filter((_, current) => current !== index) as never);

  return (
    <div className="asset-item-editor">
      <div className="detail-section-heading"><div><strong>{kind === "variant" ? "Variantes" : "Niveaux de détail"}</strong><span>{items.length} élément{items.length > 1 ? "s" : ""}</span></div><button className="small" onClick={add} type="button"><Plus size={14} /> Ajouter</button></div>
      {!items.length ? <div className="detail-empty">{icon}<p>{empty}</p><button onClick={add} type="button"><Plus size={14} /> Ajouter</button></div> : null}
      {items.map((item, index) => (
        <div className="asset-subitem" key={item.id}>
          <div className="subitem-heading">
            <input
              aria-label={kind === "variant" ? "Nom de la variante" : "Nom du LOD"}
              onChange={(event) => update(index, kind === "variant" ? { name: event.target.value } : { level: event.target.value })}
              value={kind === "variant" ? (item as AssetVariant).name : (item as AssetLod).level}
            />
            <select onChange={(event) => update(index, { status: event.target.value as AssetItemStatus })} value={item.status}>
              <option value="planned">Prévu</option><option value="working">En cours</option><option value="ready">Prêt</option>
            </select>
            <button aria-label="Supprimer" className="icon-button danger" onClick={() => remove(index)} type="button"><Trash2 size={15} /></button>
          </div>
          {kind === "lod" ? <label className="inline-field"><span>Ratio cible</span><input max="100" min="1" onChange={(event) => update(index, { targetRatio: Number(event.target.value) })} type="number" value={(item as AssetLod).targetRatio ?? 50} /><b>%</b></label> : null}
          <textarea onChange={(event) => update(index, { notes: event.target.value })} placeholder="Notes…" rows={2} value={item.notes} />
        </div>
      ))}
    </div>
  );
}
