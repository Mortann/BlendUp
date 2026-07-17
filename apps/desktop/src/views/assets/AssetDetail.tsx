import {
  Box,
  Copy,
  ExternalLink,
  Gauge,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AssetLod, AssetVariant, AssetVersionStatus, BlendUpAsset } from "../../blendup/types";
import { formatBytes, formatTimestamp, statusLabel } from "./utils";
import { AssetImageGallery, AssetViewer } from "./AssetViewer";

type DetailTab = "overview" | "preview" | "variants" | "lods" | "files";

export function AssetDetail({
  asset,
  exporting,
  onAddImages,
  onClose,
  onCreateVariant,
  onDeleteVersion,
  onExport,
  onExportAll,
  onExportVersion,
  onGenerateLods,
  onOpen,
  onOpenPath,
  onOpenVersion,
  onSave,
  onSetThumbnail,
  projectRoot
}: {
  asset: BlendUpAsset;
  exporting: boolean;
  onAddImages: (kind: "renders" | "textures") => void;
  onClose: () => void;
  onCreateVariant: (name: string) => Promise<unknown>;
  onDeleteVersion: (versionId: string, versionKind: "variant" | "lod") => Promise<unknown>;
  onExport: () => void;
  onExportAll: () => void;
  onExportVersion: (versionId: string, versionKind: "variant" | "lod") => void;
  onGenerateLods: () => Promise<unknown>;
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onOpenVersion: (path: string) => void;
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
  const versionsSignature = useMemo(
    () => JSON.stringify([asset.metadata.variants, asset.metadata.lods]),
    [asset.metadata.lods, asset.metadata.variants]
  );

  useEffect(() => {
    setNotes(asset.metadata.notes);
    setTags(asset.metadata.tags.join(", "));
    setTab("overview");
  }, [asset.id]);

  useEffect(() => {
    setVariants(asset.metadata.variants);
    setLods(asset.metadata.lods);
  }, [asset.id, versionsSignature]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(notes, tags.split(",").map((tag) => tag.trim()).filter(Boolean), variants, lods);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="asset-detail" aria-label={`Détails de ${asset.name}`}>
      <header className="asset-detail-header">
        <div className="asset-detail-title"><span><Box size={20} /></span><div><strong>{asset.name}</strong><small>{asset.folder}</small></div></div>
        <button aria-label="Fermer" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
      </header>

      <div className="asset-detail-actions has-export-all">
        <button onClick={onOpen} type="button"><ExternalLink size={15} /> Blender</button>
        <button className="primary" disabled={exporting} onClick={onExport} type="button"><Upload size={15} /> {asset.status === "exported" ? "Réexporter" : "Exporter"}</button>
        <button disabled={exporting} onClick={onExportAll} type="button"><Layers3 size={15} /> Tout exporter</button>
      </div>

      <nav className="detail-tabs" aria-label="Sections de l'asset">
        {([
          ["overview", "Informations"], ["preview", "Aperçu"], ["variants", `Variantes ${variants.length + 1}`],
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
          <VariantManager
            exporting={exporting}
            items={variants}
            onChange={setVariants}
            onCreate={onCreateVariant}
            onDelete={(versionId) => onDeleteVersion(versionId, "variant")}
            onExport={(versionId) => onExportVersion(versionId, "variant")}
            onExportOriginal={onExport}
            onOpen={onOpenVersion}
            onOpenOriginal={onOpen}
            originalOutputPath={asset.outputPath}
            originalSourcePath={asset.sourcePath}
            originalStatus={asset.status}
          />
        ) : null}

        {tab === "lods" ? (
          <LodManager
            exporting={exporting}
            format={asset.format}
            items={lods}
            onChange={setLods}
            onDelete={(versionId) => onDeleteVersion(versionId, "lod")}
            onExport={(versionId) => onExportVersion(versionId, "lod")}
            onGenerate={onGenerateLods}
            onOpen={onOpenVersion}
          />
        ) : null}

        {tab === "files" ? (
          <div className="detail-file-list">
            <FileRow label="Source Blender" onOpen={onOpen} path={asset.sourcePath} />
            <FileRow label={`Export ${asset.format.toUpperCase()}`} onOpen={() => onOpenPath(asset.outputPath)} path={asset.outputPath} />
            <FileRow label="Dossier de travail" onOpen={() => onOpenPath(asset.folder)} path={asset.folder} />
          </div>
        ) : null}
      </div>

      {(tab === "overview" || tab === "variants" || tab === "lods") ? (
        <footer className="asset-detail-footer"><button className="primary full" disabled={saving} onClick={() => void save()} type="button"><Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer les notes"}</button></footer>
      ) : null}
    </aside>
  );
}

function VariantManager({
  exporting,
  items,
  onChange,
  onCreate,
  onDelete,
  onExport,
  onExportOriginal,
  onOpen,
  onOpenOriginal,
  originalOutputPath,
  originalSourcePath,
  originalStatus
}: {
  exporting: boolean;
  items: AssetVariant[];
  onChange: (items: AssetVariant[]) => void;
  onCreate: (name: string) => Promise<unknown>;
  onDelete: (versionId: string) => Promise<unknown>;
  onExport: (versionId: string) => void;
  onExportOriginal: () => void;
  onOpen: (path: string) => void;
  onOpenOriginal: () => void;
  originalOutputPath: string;
  originalSourcePath: string;
  originalStatus: BlendUpAsset["status"];
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await onCreate(name.trim());
      if (result) setName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="asset-version-manager">
      <div className="version-intro"><Copy size={22} /><div><strong>Versions Blender indépendantes</strong><span>L'original compte comme première version. Chaque copie partage le dossier de textures, avec son propre fichier .blend et son propre export.</span></div></div>
      <div className="version-create-row">
        <input onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="Ex. Rouge, Endommagée…" value={name} />
        <button className="primary" disabled={creating || !name.trim()} onClick={() => void create()} type="button">{creating ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Créer la copie</button>
      </div>
      <OriginalVersionCard
        exporting={exporting}
        onExport={onExportOriginal}
        onOpen={onOpenOriginal}
        outputPath={originalOutputPath}
        sourcePath={originalSourcePath}
        status={originalStatus}
      />
      {!items.length ? <VersionEmpty icon={<Layers3 size={25} />} text="Aucune variante supplémentaire pour cet asset." /> : null}
      {items.map((variant, index) => (
        <VersionCard
          exporting={exporting}
          key={variant.id}
          label={variant.name}
          notes={variant.notes}
          onDelete={() => void onDelete(variant.id)}
          onExport={() => onExport(variant.id)}
          onNotes={(notes) => onChange(items.map((item, current) => current === index ? { ...item, notes } : item))}
          onOpen={variant.sourcePath ? () => onOpen(variant.sourcePath!) : undefined}
          outputPath={variant.outputPath}
          sourcePath={variant.sourcePath}
          status={variant.status}
        />
      ))}
    </div>
  );
}

function OriginalVersionCard({
  exporting,
  onExport,
  onOpen,
  outputPath,
  sourcePath,
  status
}: {
  exporting: boolean;
  onExport: () => void;
  onOpen: () => void;
  outputPath: string;
  sourcePath: string;
  status: BlendUpAsset["status"];
}) {
  return (
    <article className="asset-version-card original-version">
      <header><div><strong>Originale</strong><span>Asset de base</span></div><b className={`asset-status ${status}`}>{statusLabel(status)}</b></header>
      <div className="version-paths"><code title={sourcePath}>{sourcePath}</code><code title={outputPath}>{outputPath}</code></div>
      <footer>
        <button onClick={onOpen} type="button"><ExternalLink size={14} /> Blender</button>
        <button className="primary" disabled={exporting} onClick={onExport} type="button"><Upload size={14} /> Exporter</button>
      </footer>
    </article>
  );
}

function LodManager({
  exporting,
  format,
  items,
  onChange,
  onDelete,
  onExport,
  onGenerate,
  onOpen
}: {
  exporting: boolean;
  format: BlendUpAsset["format"];
  items: AssetLod[];
  onChange: (items: AssetLod[]) => void;
  onDelete: (versionId: string) => Promise<unknown>;
  onExport: (versionId: string) => void;
  onGenerate: () => Promise<unknown>;
  onOpen: (path: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const generate = async () => {
    setGenerating(true);
    try {
      await onGenerate();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="asset-version-manager">
      <div className="version-intro"><Gauge size={22} /><div><strong>LOD Blender automatiques</strong><span>BlendUp crée LOD1 à 50 %, LOD2 à 25 % et LOD3 à 12,5 % avec un modificateur Decimate encore éditable.</span></div></div>
      <button className="primary full" disabled={generating} onClick={() => void generate()} type="button">{generating ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} Générer les LOD manquants</button>
      {format === "glb" ? <div className="godot-lod-tip"><strong>Godot prêt à l'emploi</strong><span>« Tout exporter » crée aussi une scène <code>NomAsset_lod.tscn</code> qui change automatiquement de version selon la distance de la caméra.</span></div> : null}
      {!items.length ? <VersionEmpty icon={<Gauge size={25} />} text="Aucun LOD généré pour cet asset." /> : null}
      {items.map((lod, index) => (
        <VersionCard
          badge={`${lod.targetRatio ?? 100} %${lod.generated ? " · Auto" : ""}`}
          exporting={exporting}
          key={lod.id}
          label={lod.level}
          notes={lod.notes}
          onDelete={() => void onDelete(lod.id)}
          onExport={() => onExport(lod.id)}
          onNotes={(notes) => onChange(items.map((item, current) => current === index ? { ...item, notes } : item))}
          onOpen={lod.sourcePath ? () => onOpen(lod.sourcePath!) : undefined}
          outputPath={lod.outputPath}
          sourcePath={lod.sourcePath}
          status={lod.status}
        />
      ))}
    </div>
  );
}

function VersionCard({
  badge,
  exporting,
  label,
  notes,
  onDelete,
  onExport,
  onNotes,
  onOpen,
  outputPath,
  sourcePath,
  status
}: {
  badge?: string;
  exporting: boolean;
  label: string;
  notes: string;
  onDelete: () => void;
  onExport: () => void;
  onNotes: (notes: string) => void;
  onOpen?: () => void;
  outputPath?: string;
  sourcePath?: string;
  status: AssetVersionStatus;
}) {
  return (
    <article className="asset-version-card">
      <header><div><strong>{label}</strong>{badge ? <span>{badge}</span> : null}</div><b className={`asset-status ${status === "missing" ? "error" : status}`}>{versionStatusLabel(status)}</b></header>
      <div className="version-paths"><code title={sourcePath}>{sourcePath ?? "Aucun fichier Blender lié"}</code>{outputPath ? <code title={outputPath}>{outputPath}</code> : null}</div>
      <textarea onChange={(event) => onNotes(event.target.value)} placeholder="Notes sur cette version…" rows={2} value={notes} />
      <footer>
        <button disabled={!onOpen} onClick={onOpen} type="button"><ExternalLink size={14} /> Blender</button>
        <button className="primary" disabled={exporting || !sourcePath} onClick={onExport} type="button"><Upload size={14} /> Exporter</button>
        <button aria-label={`Supprimer ${label}`} className="icon-button danger" onClick={onDelete} title="Mettre cette version à la corbeille" type="button"><Trash2 size={15} /></button>
      </footer>
    </article>
  );
}

function VersionEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="detail-empty">{icon}<p>{text}</p></div>;
}

function versionStatusLabel(status: AssetVersionStatus) {
  if (status === "missing") return "Fichier absent";
  return statusLabel(status);
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function FileRow({ label, onOpen, path }: { label: string; onOpen: () => void; path: string }) {
  return <button className="detail-file-row" onClick={onOpen} type="button"><div><strong>{label}</strong><code>{path}</code></div><ExternalLink size={15} /></button>;
}
