import {
  Box,
  Copy,
  Eye,
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
import type { AssetLod, AssetVariant, AssetVersionStatus, BlendUpAsset, UvQualitySummary } from "../../blendup/types";
import { formatBytes, formatTimestamp, statusLabel } from "./utils";
import { AssetImageGallery, AssetViewer } from "./AssetViewer";

import { UvQualityPanel, UvScoreBadge } from "./UvQuality";
import { assetPreviewVersion, originalVariantId, savedPreviewVariant, savePreviewVariant } from "./variants";

type DetailTab = "overview" | "preview" | "variants" | "lods" | "files";

export function AssetDetail({
  asset,
  checkingUv,
  onCheckUv,
  onSetUvIgnored,
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
  checkingUv: boolean;
  onCheckUv: () => void;
  onSetUvIgnored: (ignored: boolean) => Promise<unknown>;
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
  const standalone = asset.status === "local";
  const [tab, setTab] = useState<DetailTab>("overview");
  const [notes, setNotes] = useState(asset.metadata.notes);
  const [tags, setTags] = useState(asset.metadata.tags.join(", "));
  const [variants, setVariants] = useState(asset.metadata.variants);
  const [lods, setLods] = useState(asset.metadata.lods);
  const [saving, setSaving] = useState(false);
  const [savingUv, setSavingUv] = useState(false);
  const [previewId, setPreviewId] = useState(() => savedPreviewVariant(projectRoot, asset));
  const previewVariant = asset.metadata.variants.find((item) => item.id === previewId);
  const preview = assetPreviewVersion(asset, previewId);
  const openPreview = () => previewVariant ? preview.sourcePath && onOpenVersion(preview.sourcePath) : onOpen();
  const exportPreview = () => previewVariant ? onExportVersion(previewVariant.id, "variant") : onExport();
  const choosePreview = (id: string) => {
    setPreviewId(id);
    savePreviewVariant(projectRoot, asset.id, id);
  };
  const setUvIgnored = async (ignored: boolean) => {
    setSavingUv(true);
    try { await onSetUvIgnored(ignored); }
    finally { setSavingUv(false); }
  };
  const versionsSignature = useMemo(
    () => JSON.stringify([asset.metadata.variants, asset.metadata.lods]),
    [asset.metadata.lods, asset.metadata.variants]
  );

  useEffect(() => {
    setNotes(asset.metadata.notes);
    setTags(asset.metadata.tags.join(", "));
    setTab("overview");
    setPreviewId(savedPreviewVariant(projectRoot, asset));
  }, [asset.id, projectRoot]);

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

      <div className={`asset-detail-actions ${standalone ? "" : "has-export-all"}`}>
        <button disabled={!preview.sourcePath} onClick={openPreview} title={`Ouvrir ${previewVariant?.name ?? "l’original"} dans Blender`} type="button"><ExternalLink size={15} /> Blender</button>
        <button className="primary" disabled={exporting || !preview.sourcePath} onClick={exportPreview} title={`Version : ${previewVariant?.name ?? "Originale"}`} type="button">{standalone ? <Eye size={15} /> : <Upload size={15} />} {standalone ? (preview.outputModifiedAt ? "Actualiser l’aperçu" : "Générer l’aperçu") : preview.status === "exported" ? "Réexporter" : "Exporter"}</button>
        {!standalone ? <button disabled={exporting} onClick={onExportAll} type="button"><Layers3 size={15} /> Tout exporter</button> : null}
      </div>

      <nav className="detail-tabs" aria-label="Sections de l'asset">
        {([
          ["overview", "Informations"], ["preview", "3D / Animations"], ["variants", `Variantes ${variants.length + 1}`],
          ["lods", `LOD ${lods.length || ""}`], ["files", "Fichiers"]
        ] as Array<[DetailTab, string]>).map(([id, label]) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
        ))}
      </nav>

      <div className="asset-detail-body">
        {tab === "overview" ? (
          <>
            <div className="asset-overview-hero">
              <AssetViewer asset={preview} projectRoot={projectRoot} />
              <PreviewVariantChoice asset={asset} onChange={choosePreview} value={previewVariant?.id ?? originalVariantId} />
            </div>
            <UvQualityPanel quality={preview.uvQuality} versionLabel={previewVariant?.name ?? "Originale"} checking={checkingUv || exporting} onCheck={onCheckUv} ignored={!!asset.metadata.ignoreUvValidation} saving={savingUv} onSetIgnored={(ignored) => void setUvIgnored(ignored)} />
            <label className="field"><span>Notes</span><textarea onChange={(event) => setNotes(event.target.value)} placeholder="Intention, remarques ou points à vérifier…" rows={5} value={notes} /></label>
            <label className="field"><span><Tag size={13} /> Tags</span><input onChange={(event) => setTags(event.target.value)} placeholder="environment, stone, modular" value={tags} /></label>
            <div className="detail-info-grid">
              <Info label="État de la version" value={previewVariant ? versionStatusLabel(previewVariant.status) : statusLabel(asset.status)} />
              <Info label="Format" value={standalone ? "BLEND" : asset.format.toUpperCase()} />
              {previewVariant ? <Info label="Version affichée" value={previewVariant.name} /> : <Info label="Taille source" value={formatBytes(asset.sizeBytes)} />}
              <Info label="Modifié" value={formatTimestamp(preview.sourceModifiedAt)} />
            </div>
          </>
        ) : null}

        {tab === "preview" ? (
          <>
            <div className="asset-overview-hero">
              <AssetViewer asset={preview} projectRoot={projectRoot} />
              <PreviewVariantChoice asset={asset} onChange={choosePreview} value={previewVariant?.id ?? originalVariantId} />
            </div>
            <button className="small" onClick={onSetThumbnail} type="button"><ImageIcon size={14} /> Choisir la miniature de l’asset</button>
            <AssetImageGallery asset={asset} kind="renders" onAdd={() => onAddImages("renders")} projectRoot={projectRoot} />
            <AssetImageGallery asset={asset} kind="textures" onAdd={() => onAddImages("textures")} projectRoot={projectRoot} />
          </>
        ) : null}

        {tab === "variants" ? (
          <VariantManager
            standalone={standalone}
            exporting={exporting}
            items={variants}
            onChange={setVariants}
            onCreate={onCreateVariant}
            onDelete={(versionId) => onDeleteVersion(versionId, "variant")}
            onExport={(versionId) => onExportVersion(versionId, "variant")}
            onExportOriginal={onExport}
            onOpen={onOpenVersion}
            onOpenOriginal={onOpen}
            onPreview={(id) => { choosePreview(id); setTab("overview"); }}
            originalOutputPath={asset.outputPath}
            originalSourcePath={asset.sourcePath}
            originalStatus={asset.status}
          />
        ) : null}

        {tab === "lods" ? (
          <LodManager
            standalone={standalone}
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
            <FileRow label={`Source Blender · ${previewVariant?.name ?? "Originale"}`} onOpen={openPreview} path={preview.sourcePath} />
            {!standalone && preview.outputPath ? <FileRow label={`Export ${asset.format.toUpperCase()}`} onOpen={() => onOpenPath(preview.outputPath)} path={preview.outputPath} /> : null}
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
  standalone,
  exporting,
  items,
  onChange,
  onCreate,
  onDelete,
  onExport,
  onExportOriginal,
  onOpen,
  onOpenOriginal,
  onPreview,
  originalOutputPath,
  originalSourcePath,
  originalStatus
}: {
  standalone?: boolean;
  exporting: boolean;
  items: AssetVariant[];
  onChange: (items: AssetVariant[]) => void;
  onCreate: (name: string) => Promise<unknown>;
  onDelete: (versionId: string) => Promise<unknown>;
  onExport: (versionId: string) => void;
  onExportOriginal: () => void;
  onOpen: (path: string) => void;
  onOpenOriginal: () => void;
  onPreview: (versionId: string) => void;
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
      <div className="version-intro"><Copy size={22} /><div><strong>Versions Blender indépendantes</strong><span>L'original compte comme première version. Chaque copie partage le dossier de textures et possède son propre fichier .blend.</span></div></div>
      <div className="version-create-row">
        <input onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="Ex. Rouge, Endommagée…" value={name} />
        <button className="primary" disabled={creating || !name.trim()} onClick={() => void create()} type="button">{creating ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Créer la copie</button>
      </div>
      <OriginalVersionCard
        standalone={standalone}
        exporting={exporting}
        onExport={onExportOriginal}
        onOpen={onOpenOriginal}
        onPreview={() => onPreview(originalVariantId)}
        outputPath={originalOutputPath}
        sourcePath={originalSourcePath}
        status={originalStatus}
      />
      {!items.length ? <VersionEmpty icon={<Layers3 size={25} />} text="Aucune variante supplémentaire pour cet asset." /> : null}
      {items.map((variant, index) => (
        <VersionCard
          standalone={standalone}
          exporting={exporting}
          key={variant.id}
          label={variant.name}
          quality={variant.uvQuality}
          notes={variant.notes}
          onDelete={() => void onDelete(variant.id)}
          onExport={() => onExport(variant.id)}
          onNotes={(notes) => onChange(items.map((item, current) => current === index ? { ...item, notes } : item))}
          onOpen={variant.sourcePath ? () => onOpen(variant.sourcePath!) : undefined}
          onPreview={() => onPreview(variant.id)}
          outputPath={variant.outputPath}
          sourcePath={variant.sourcePath}
          status={variant.status}
        />
      ))}
    </div>
  );
}

function OriginalVersionCard({
  standalone,
  exporting,
  onExport,
  onOpen,
  onPreview,
  outputPath,
  sourcePath,
  status
}: {
  standalone?: boolean;
  exporting: boolean;
  onExport: () => void;
  onOpen: () => void;
  onPreview: () => void;
  outputPath: string;
  sourcePath: string;
  status: BlendUpAsset["status"];
}) {
  return (
    <article className="asset-version-card original-version">
      <header><div><strong>Originale</strong><span>Asset de base</span></div><b className={`asset-status ${status}`}>{statusLabel(status)}</b></header>
      <div className="version-paths"><code title={sourcePath}>{sourcePath}</code>{!standalone ? <code title={outputPath}>{outputPath}</code> : null}</div>
      <footer>
        <button onClick={onOpen} type="button"><ExternalLink size={14} /> Blender</button>
        <button onClick={onPreview} type="button"><Eye size={14} /> Aperçu</button>
        <button className="primary" disabled={exporting} onClick={onExport} type="button">{standalone ? <Eye size={14} /> : <Upload size={14} />} {standalone ? "Générer l’aperçu" : "Exporter"}</button>
      </footer>
    </article>
  );
}

function LodManager({
  standalone,
  exporting,
  format,
  items,
  onChange,
  onDelete,
  onExport,
  onGenerate,
  onOpen
}: {
  standalone?: boolean;
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
      {!standalone && format === "glb" ? <div className="godot-lod-tip"><strong>Godot prêt à l'emploi</strong><span>« Tout exporter » crée aussi une scène <code>NomAsset_lod.tscn</code> qui change automatiquement de version selon la distance de la caméra.</span></div> : null}
      {!items.length ? <VersionEmpty icon={<Gauge size={25} />} text="Aucun LOD généré pour cet asset." /> : null}
      {items.map((lod, index) => (
        <VersionCard
          standalone={standalone}
          badge={`${lod.targetRatio ?? 100} %${lod.generated ? " · Auto" : ""}`}
          exporting={exporting}
          key={lod.id}
          label={lod.level}
          quality={lod.uvQuality}
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
  standalone,
  badge,
  exporting,
  label,
  quality,
  notes,
  onDelete,
  onExport,
  onNotes,
  onOpen,
  onPreview,
  outputPath,
  sourcePath,
  status
}: {
  badge?: string;
  standalone?: boolean;
  exporting: boolean;
  label: string;
  quality?: UvQualitySummary;
  notes: string;
  onDelete: () => void;
  onExport: () => void;
  onNotes: (notes: string) => void;
  onOpen?: () => void;
  onPreview?: () => void;
  outputPath?: string;
  sourcePath?: string;
  status: AssetVersionStatus;
}) {
  return (
    <article className="asset-version-card">
      <header><div><strong>{label}</strong>{badge ? <span>{badge}</span> : null}<UvScoreBadge quality={quality} /></div><b className={`asset-status ${status === "missing" ? "error" : status}`}>{versionStatusLabel(status)}</b></header>
      <div className="version-paths"><code title={sourcePath}>{sourcePath ?? "Aucun fichier Blender lié"}</code>{!standalone && outputPath ? <code title={outputPath}>{outputPath}</code> : null}</div>
      <textarea onChange={(event) => onNotes(event.target.value)} placeholder="Notes sur cette version…" rows={2} value={notes} />
      <footer>
        <button disabled={!onOpen} onClick={onOpen} type="button"><ExternalLink size={14} /> Blender</button>
        {onPreview ? <button onClick={onPreview} type="button"><Eye size={14} /> Aperçu</button> : null}
        <button className="primary" disabled={exporting || !sourcePath} onClick={onExport} type="button">{standalone ? <Eye size={14} /> : <Upload size={14} />} {standalone ? "Générer l’aperçu" : "Exporter"}</button>
        <button aria-label={`Supprimer ${label}`} className="icon-button danger" onClick={onDelete} title="Mettre cette version à la corbeille" type="button"><Trash2 size={15} /></button>
      </footer>
    </article>
  );
}

function VersionEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="detail-empty">{icon}<p>{text}</p></div>;
}

function PreviewVariantChoice({ asset, onChange, value }: { asset: BlendUpAsset; onChange: (id: string) => void; value: string }) {
  return <label className="preview-variant-choice"><Layers3 size={14} /><span>Variante</span>
    <select aria-label="Variante affichée dans l’aperçu" onChange={(event) => onChange(event.target.value)} value={value}>
      <option value={originalVariantId}>Originale</option>
      {asset.metadata.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}{variant.status === "missing" ? " · fichier absent" : variant.status === "ready" ? " · à exporter" : variant.status === "outdated" ? " · à actualiser" : variant.status === "error" ? " · erreur" : ""}</option>)}
    </select>
  </label>;
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
