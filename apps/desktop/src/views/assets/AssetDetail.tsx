import { AlertTriangle, Check, CheckCircle2, ChevronDown, ExternalLink, Eye, FolderOpen, History, Layers, Pencil, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetLabel } from "../../blendup/naming";
import type { RoleCapabilities } from "../../blendup/roles";
import type { AssetLod, AssetStatus, AssetVariant, BlendUpActivityEvent, BlendUpAsset, BlendUpProblem } from "../../blendup/types";
import type { TeamMember } from "../../app/people";
import { EmptyState, PathLine, StatusPill } from "../../app/ui";
import { formatAssetType, formatExportStatus, formatStatus, severityLabel } from "../../ui/format";
import { artistStatuses, type HistoryTypeFilter } from "./model";
import { assetDirectory, isAssociatedMember, normalizeArtistStatus, normalizeFolderPath, ownerNames } from "./utils";
import { AssetAvatars, AssetVisual, memberColor } from "./AssetVisuals";

function AssetProblems({
  asset,
  capabilities,
  isExporting,
  onExportAsset,
  problems,
  showActions = true
}: {
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
  showActions?: boolean;
}) {
  if (problems.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={24} />} label="Aucun probleme pour cet asset" />;
  }

  return (
    <div className="problem-list">
      {problems.map((problem) => (
        <div className={`problem-row ${problem.severity}`} key={problem.id}>
          <AlertTriangle size={16} />
          <div>
            <strong>{problem.title}</strong>
            <span>
              {severityLabel(problem.severity)} - {problem.detail}
            </span>
          </div>
          {showActions && problem.actionLabel ? (
            <ProblemActionButton
              asset={asset}
              exportAllowed={capabilities.canExport}
              isExporting={isExporting}
              onExportAsset={onExportAsset}
              problem={problem}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ArtistAssetDetail({
  activeMember,
  activity,
  asset,
  capabilities,
  currentBranch,
  isFavorite,
  members,
  onAssignOwners,
  onSetLods,
  onSetVariants,
  onUpdateArtistNotes,
  onChangeStatus,
  onClose,
  onDelete,
  onOpenInBlender,
  onOpenContentPath,
  onRename,
  onToggleFavorite,
  onVisualize,
  problems,
  projectRoot
}: {
  activeMember?: TeamMember;
  activity: BlendUpActivityEvent[];
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  currentBranch?: string;
  isFavorite: boolean;
  members: TeamMember[];
  onAssignOwners: (owners: { artist: string[]; reviewer: string | null }) => void;
  onSetLods: (lods: AssetLod[]) => void;
  onSetVariants: (variants: AssetVariant[]) => void;
  onUpdateArtistNotes: (notes: string) => void;
  onChangeStatus: (status: AssetStatus) => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenInBlender: () => void;
  onOpenContentPath: (relativePath: string) => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onVisualize: () => void;
  problems: BlendUpProblem[];
  projectRoot?: string;
}) {
  const [detailMode, setDetailMode] = useState<"info" | "history">("info");
  const [artistNotesDraft, setArtistNotesDraft] = useState(asset.notes.artist);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTypeFilter>("all");
  const [historyActorFilter, setHistoryActorFilter] = useState("all");
  const [historyBranchFilter, setHistoryBranchFilter] = useState("all");
  const exported = asset.export.lastExportStatus === "success";
  const artistOwners = ownerNames(asset.owners.artist);
  const artistStatus = normalizeArtistStatus(asset.status);
  const isArtDirector = activeMember?.roles.includes("art_director") ?? false;
  const isValidated = artistStatus === "validated";
  const canEditStatus =
    (isArtDirector || isAssociatedMember(activeMember, asset)) && (!isValidated || isArtDirector);

  const changeOwnerList = (values: string[]) => {
    onAssignOwners({
      artist: values,
      reviewer: asset.owners.reviewer
    });
  };

  const changeReviewer = (value: string) => {
    onAssignOwners({
      artist: artistOwners,
      reviewer: value ? value : null
    });
  };

  const artistMembers = members.filter(
    (member) => member.roles.includes("artist") || member.roles.includes("art_director")
  );
  const historyEntries = useMemo(
    () => buildAssetHistory(asset, activity, currentBranch),
    [activity, asset, currentBranch]
  );
  const historyActors = useMemo(
    () => Array.from(new Set(historyEntries.map((entry) => entry.actor))).sort((left, right) => left.localeCompare(right)),
    [historyEntries]
  );
  const historyBranches = useMemo(
    () => Array.from(new Set(historyEntries.map((entry) => entry.branch))).sort((left, right) => left.localeCompare(right)),
    [historyEntries]
  );
  const filteredHistoryEntries = historyEntries.filter((entry) => {
    const matchesType = historyTypeFilter === "all" || historyCategory(entry.type) === historyTypeFilter;
    const matchesActor = historyActorFilter === "all" || entry.actor === historyActorFilter;
    const matchesBranch = historyBranchFilter === "all" || entry.branch === historyBranchFilter;

    return matchesType && matchesActor && matchesBranch;
  });

  useEffect(() => {
    setArtistNotesDraft(asset.notes.artist);
    setDetailMode("info");
    setHistoryTypeFilter("all");
    setHistoryActorFilter("all");
    setHistoryBranchFilter("all");
  }, [asset.id, asset.notes.artist]);

  const saveArtistNotes = () => {
    if (artistNotesDraft !== asset.notes.artist) {
      onUpdateArtistNotes(artistNotesDraft);
    }
  };

  return (
    <aside
      className="asset-focus-panel artist-detail-panel centered"
      aria-label="Detail asset artiste"
      onClick={(event) => event.stopPropagation()}
    >
      <button className="icon-button close-button" onClick={onClose} title="Fermer" type="button">
        <X size={18} />
      </button>

      <div className="detail-header">
        <div className="detail-thumbnail large">
          <AssetVisual asset={asset} projectRoot={projectRoot} />
        </div>
        <div>
          <span className="role-badge">{capabilities.orientationLabel}</span>
          <h2>{assetLabel(asset.displayName)}</h2>
          <span className="eyebrow">{formatAssetType(asset.type)} - {asset.displayName}</span>
        </div>
      </div>

      <div className="status-strip">
        <StatusPill label={formatStatus(artistStatus)} tone="blue" />
        <StatusPill label={exported ? "Exporte" : "A exporter depuis Blender"} tone={exported ? "green" : "orange"} />
      </div>

      <section className="asset-status-panel">
        <div>
          <span className="eyebrow">Etat artiste</span>
          <p className="soft-text">
            {isArtDirector
              ? "Tu peux valider l'asset."
              : isValidated
                ? "Asset valide : seul le Directeur artistique peut le rouvrir."
                : canEditStatus
                  ? "Tu peux faire avancer l'asset jusqu'a la demande de validation."
                  : "Statut modifiable par les personnes associees a l'asset."}
          </p>
        </div>
        <label className="asset-status-select">
          <span className={`status-dot status-${artistStatus}`} />
          <select
            aria-label="Changer le statut artiste"
            disabled={!canEditStatus}
            onChange={(event) => onChangeStatus(event.target.value as AssetStatus)}
            value={artistStatus}
          >
            {artistStatuses.map((option) => (
              <option
                disabled={option.status === "validated" && !isArtDirector}
                key={option.status}
                value={option.status}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="asset-action-bar">
        <button disabled={!asset.paths.blenderSource} onClick={onOpenInBlender} type="button">
          <ExternalLink size={16} />
          Ouvrir dans Blender
        </button>
        <button className="secondary" onClick={onVisualize} type="button">
          <Eye size={16} />
          Visualiser
        </button>
        <button
          className={detailMode === "history" ? "secondary active" : "secondary"}
          onClick={() => setDetailMode((current) => (current === "history" ? "info" : "history"))}
          type="button"
        >
          <History size={16} />
          Historique
        </button>
        <button className="secondary" onClick={onToggleFavorite} type="button">
          <Star fill={isFavorite ? "currentColor" : "none"} size={16} />
          Favori
        </button>
        <button className="secondary" onClick={onRename} type="button">
          <Pencil size={16} />
          Renommer
        </button>
        <button className="secondary danger" onClick={onDelete} type="button">
          <Trash2 size={16} />
          Supprimer
        </button>
      </div>

      {detailMode === "history" ? (
        <section className="section-block asset-history-panel">
          <div className="section-heading-row">
            <h3>Historique complet</h3>
            <span className="soft-text">{filteredHistoryEntries.length} / {historyEntries.length} evenement(s)</span>
          </div>
          <div className="history-filter-bar" aria-label="Filtres historique">
            <label>
              <span>Type</span>
              <select value={historyTypeFilter} onChange={(event) => setHistoryTypeFilter(event.target.value as HistoryTypeFilter)}>
                <option value="all">Tous</option>
                <option value="status">Etat</option>
                <option value="team">Equipe</option>
                <option value="notes">Notes</option>
                <option value="files">Fichiers</option>
                <option value="export">Export</option>
                <option value="other">Autres</option>
              </select>
            </label>
            <label>
              <span>Personne</span>
              <select value={historyActorFilter} onChange={(event) => setHistoryActorFilter(event.target.value)}>
                <option value="all">Toutes</option>
                {historyActors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Branche</span>
              <select value={historyBranchFilter} onChange={(event) => setHistoryBranchFilter(event.target.value)}>
                <option value="all">Toutes</option>
                {historyBranches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="asset-timeline">
            {filteredHistoryEntries.length > 0 ? (
              filteredHistoryEntries.map((entry) => (
                <article className="timeline-entry" key={`${entry.time}-${entry.type}-${entry.message}`}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entry.message}</p>
                    <div className="timeline-meta">
                      <span>{entry.actor}</span>
                      <span>{formatDateTime(entry.time)}</span>
                      <span>{entry.branch}</span>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState icon={<History size={24} />} label="Aucun evenement avec ces filtres" />
            )}
          </div>
        </section>
      ) : (
        <div className="detail-sections airy artist-detail-grid">
          <section className="section-block">
            <h3>Equipe</h3>
            <div className="owner-assign-grid">
              <OwnerMultiSelect
                label="Artiste"
                members={artistMembers}
                onChange={changeOwnerList}
                values={artistOwners}
              />
              <label>
                <span><UserRound size={14} /> Reviewer</span>
                <select
                  value={asset.owners.reviewer ?? ""}
                  onChange={(event) => changeReviewer(event.target.value)}
                >
                  <option value="">Non assigne</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="section-block">
            <h3>Notes artiste</h3>
            <textarea
              className="artist-notes-editor"
              onBlur={saveArtistNotes}
              onChange={(event) => setArtistNotesDraft(event.target.value)}
              placeholder="Ajouter une note artiste"
              rows={6}
              value={artistNotesDraft}
            />
            <div className="notes-actions">
              <button
                className="secondary"
                disabled={artistNotesDraft === asset.notes.artist}
                onClick={saveArtistNotes}
                type="button"
              >
                Enregistrer
              </button>
            </div>
          </section>
          <section className="section-block">
            <h3>Contenu de l'asset</h3>
            <AssetContentLinks asset={asset} onOpenContentPath={onOpenContentPath} />
          </section>
          <section className="section-block">
            <h3>Variantes</h3>
            <AssetVariants asset={asset} onSetVariants={onSetVariants} />
          </section>
          <section className="section-block">
            <h3>LODs</h3>
            <AssetLods asset={asset} onSetLods={onSetLods} />
          </section>
          <section className="section-block">
            <h3>Checklist asset</h3>
            <AssetChecklist asset={asset} problems={problems} />
          </section>
          <details className="detail-disclosure">
            <summary>Details fichier</summary>
            <PathLine label="Blender" value={asset.paths.blenderSource} />
            <PathLine label="FBX" value={asset.paths.fbxExport} />
          </details>
          <section className="section-block artist-problems-section">
            <h3>A corriger</h3>
            <AssetProblems
              asset={asset}
              capabilities={capabilities}
              isExporting={false}
              onExportAsset={() => undefined}
              problems={problems}
              showActions={false}
            />
          </section>
        </div>
      )}
    </aside>
  );
}

function variantTypeLabel(type: AssetVariant["variantType"]) {
  const labels: Record<NonNullable<AssetVariant["variantType"]>, string> = {
    gameplay: "Gameplay",
    mesh: "Mesh",
    visual: "Visuelle"
  };

  return type ? labels[type] : "Visuelle";
}

function variantStatusLabel(status: AssetVariant["status"] | AssetLod["status"]) {
  const labels: Record<NonNullable<AssetVariant["status"]>, string> = {
    exported: "Exporte",
    in_blender: "Dans Blender",
    in_unity: "Dans Unity",
    planned: "A faire",
    validated: "Valide"
  };

  return status ? labels[status] : "A faire";
}

function nextLodLevel(lods: AssetLod[]) {
  const used = new Set(lods.map((lod) => lod.level.trim().toUpperCase()));
  let index = 0;

  while (used.has(`LOD${index}`)) {
    index += 1;
  }

  return `LOD${index}`;
}

function AssetVariants({
  asset,
  onSetVariants
}: {
  asset: BlendUpAsset;
  onSetVariants: (variants: AssetVariant[]) => void;
}) {
  const variants = asset.variants ?? [];
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<NonNullable<AssetVariant["variantType"]>>("visual");
  const [draftNotes, setDraftNotes] = useState("");

  const addVariant = () => {
    const name = draft.trim();
    if (!name) {
      return;
    }
    const variant: AssetVariant = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      variantType: draftType,
      status: "planned",
      notes: draftNotes.trim() || undefined,
      createdAt: new Date().toISOString()
    };
    onSetVariants([...variants, variant]);
    setDraft("");
    setDraftNotes("");
  };

  const removeVariant = (id: string) => {
    onSetVariants(variants.filter((variant) => variant.id !== id));
  };

  return (
    <div className="asset-variants">
      {variants.length > 0 ? (
        <ul className="variant-list">
          {variants.map((variant) => (
            <li key={variant.id}>
              <Layers size={14} />
              <span>
                <strong>{variant.name}</strong>
                <small>
                  {variantTypeLabel(variant.variantType)} - {variantStatusLabel(variant.status)}
                  {variant.notes ? ` - ${variant.notes}` : ""}
                </small>
              </span>
              <button
                className="variant-remove"
                onClick={() => removeVariant(variant.id)}
                title="Supprimer la variante"
                type="button"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soft-text">Aucune variante pour cet asset.</p>
      )}
      <div className="variant-add">
        <input
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              addVariant();
            }
          }}
          placeholder="Nom de la variante (ex: Casse, Neige)"
          value={draft}
        />
        <select
          aria-label="Type de variante"
          onChange={(event) => setDraftType(event.target.value as NonNullable<AssetVariant["variantType"]>)}
          value={draftType}
        >
          <option value="visual">Visuelle</option>
          <option value="mesh">Mesh</option>
          <option value="gameplay">Gameplay</option>
        </select>
        <input
          onChange={(event) => setDraftNotes(event.target.value)}
          placeholder="Note courte"
          value={draftNotes}
        />
        <button className="secondary" disabled={!draft.trim()} onClick={addVariant} type="button">
          <Plus size={14} />
          Ajouter
        </button>
      </div>
    </div>
  );
}

function AssetLods({
  asset,
  onSetLods
}: {
  asset: BlendUpAsset;
  onSetLods: (lods: AssetLod[]) => void;
}) {
  const lods = asset.lods ?? [];
  const [level, setLevel] = useState(nextLodLevel(lods));
  const [targetRatio, setTargetRatio] = useState("50");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setLevel(nextLodLevel(lods));
  }, [asset.id, lods.length]);

  const addLod = () => {
    const normalizedLevel = level.trim().toUpperCase();
    if (!normalizedLevel) {
      return;
    }

    const ratio = Number.parseInt(targetRatio, 10);
    const lod: AssetLod = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      level: normalizedLevel,
      targetRatio: Number.isFinite(ratio) ? Math.min(100, Math.max(1, ratio)) : undefined,
      status: "planned",
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    onSetLods([...lods, lod]);
    setLevel(nextLodLevel([...lods, lod]));
    setTargetRatio("50");
    setNotes("");
  };

  const removeLod = (id: string) => {
    onSetLods(lods.filter((lod) => lod.id !== id));
  };

  return (
    <div className="asset-variants asset-lods">
      {lods.length > 0 ? (
        <ul className="variant-list lod-list">
          {lods.map((lod) => (
            <li key={lod.id}>
              <Layers size={14} />
              <span>
                <strong>{lod.level}</strong>
                <small>
                  {lod.targetRatio ? `${lod.targetRatio}% du LOD0` : "Ratio libre"} - {variantStatusLabel(lod.status)}
                  {lod.notes ? ` - ${lod.notes}` : ""}
                </small>
              </span>
              <button
                className="variant-remove"
                onClick={() => removeLod(lod.id)}
                title="Supprimer le LOD"
                type="button"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soft-text">Aucun LOD pour cet asset.</p>
      )}
      <div className="variant-add lod-add">
        <input
          onChange={(event) => setLevel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              addLod();
            }
          }}
          placeholder="LOD1"
          value={level}
        />
        <input
          inputMode="numeric"
          max={100}
          min={1}
          onChange={(event) => setTargetRatio(event.target.value)}
          placeholder="Ratio %"
          type="number"
          value={targetRatio}
        />
        <input onChange={(event) => setNotes(event.target.value)} placeholder="Note courte" value={notes} />
        <button className="secondary" disabled={!level.trim()} onClick={addLod} type="button">
          <Plus size={14} />
          Ajouter
        </button>
      </div>
    </div>
  );
}

function AssetContentLinks({
  asset,
  onOpenContentPath
}: {
  asset: BlendUpAsset;
  onOpenContentPath: (relativePath: string) => void;
}) {
  const links = [
    { label: "Dossier", name: baseName(asset.paths.assetFolder) || assetLabel(asset.displayName), path: asset.paths.assetFolder },
    { label: "References", name: "references", path: asset.paths.referencesDir },
    { label: "Textures", name: "textures", path: asset.paths.texturesDir },
    { label: "Rendus", name: "renders", path: asset.paths.rendersDir ?? (asset.paths.assetFolder ? `${asset.paths.assetFolder}/renders` : undefined) }
  ].filter((link): link is { label: string; name: string; path: string } => Boolean(link.path));

  if (links.length === 0) {
    return <p className="soft-text">Aucun contenu lie pour cet asset.</p>;
  }

  return (
    <div className="asset-content-links">
      {links.map((link) => (
        <button key={link.label} onClick={() => onOpenContentPath(link.path)} title={link.path} type="button">
          <FolderOpen size={16} />
          <span>{link.label}</span>
          <strong>{link.name}</strong>
        </button>
      ))}
    </div>
  );
}


function AssetChecklist({ asset, problems }: { asset: BlendUpAsset; problems: BlendUpProblem[] }) {
  const checks = [
    {
      label: "Source Blender",
      detail: asset.paths.blenderSource ?? "Aucun fichier .blend lie",
      done: Boolean(asset.paths.blenderSource)
    },
    {
      label: "Dossier asset",
      detail: asset.paths.assetFolder ?? "Dossier asset non defini",
      done: Boolean(asset.paths.assetFolder)
    },
    {
      label: "References",
      detail: asset.paths.referencesDir ?? "Dossier references non defini",
      done: Boolean(asset.paths.referencesDir)
    },
    {
      label: "Textures",
      detail: asset.paths.texturesDir ?? "Dossier textures non defini",
      done: Boolean(asset.paths.texturesDir)
    },
    {
      label: "Equipe artiste",
      detail: ownerNames(asset.owners.artist).join(", ") || "Aucun artiste",
      done: ownerNames(asset.owners.artist).length > 0
    },
    {
      label: "Export FBX",
      detail: formatExportStatus(asset.export.lastExportStatus),
      done: asset.export.lastExportStatus === "success"
    },
    {
      label: "LODs",
      detail: `${(asset.lods ?? []).length} niveau(x)`,
      done: (asset.lods ?? []).length > 0
    },
    {
      label: "Problemes",
      detail: problems.length === 0 ? "Aucun probleme" : `${problems.length} point(s) a verifier`,
      done: problems.length === 0
    }
  ];

  return (
    <div className="asset-checklist">
      {checks.map((check) => (
        <div className={check.done ? "done" : ""} key={check.label}>
          {check.done ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            <strong>{check.label}</strong>
            <small>{check.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function OwnerMultiSelect({
  label,
  members,
  onChange,
  values
}: {
  label: string;
  members: TeamMember[];
  onChange: (values: string[]) => void;
  values: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectedSet = new Set(values);
  const filtered = members.filter((member) =>
    member.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const toggle = (name: string) => {
    if (selectedSet.has(name)) {
      onChange(values.filter((value) => value !== name));
    } else {
      onChange([...values, name]);
    }
  };

  return (
    <div className="owner-multiselect" ref={containerRef}>
      <span className="owner-multiselect-label">
        <UserRound size={14} /> {label}
      </span>
      <div className="ms-field">
        <div
          className={`ms-control ${open ? "open" : ""}`}
          onClick={() => setOpen((current) => !current)}
          role="button"
          tabIndex={0}
        >
          <div className="ms-values">
            {values.length === 0 ? <span className="ms-placeholder">Selectionner…</span> : null}
            {values.map((name) => (
              <span className="ms-chip" key={name}>
                <span className="ms-chip-dot" style={{ background: memberColor(name) }} />
                {name}
                <button
                  className="ms-chip-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(values.filter((value) => value !== name));
                  }}
                  title="Retirer"
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <ChevronDown className="ms-arrow" size={15} />
        </div>
        {open ? (
          <div className="ms-menu">
            <input
              autoFocus
              className="ms-search"
              onChange={(event) => setSearch(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="Rechercher…"
              value={search}
            />
            <div className="ms-options">
              {filtered.length > 0 ? (
                filtered.map((member) => {
                  const checked = selectedSet.has(member.name);
                  return (
                    <button
                      className={`ms-option ${checked ? "checked" : ""}`}
                      key={member.id}
                      onClick={() => toggle(member.name)}
                      type="button"
                    >
                      <span className="ms-option-check">{checked ? <Check size={13} /> : null}</span>
                      <span className="ms-chip-dot" style={{ background: memberColor(member.name) }} />
                      {member.name}
                    </button>
                  );
                })
              ) : (
                <p className="soft-text ms-empty">Aucun membre</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface AssetHistoryEntry {
  actor: string;
  branch: string;
  message: string;
  time: string;
  title: string;
  type: string;
}

function buildAssetHistory(
  asset: BlendUpAsset,
  activity: BlendUpActivityEvent[],
  currentBranch?: string
): AssetHistoryEntry[] {
  const branch = currentBranch ?? "Branche inconnue";
  const entries = activity.map((event) => ({
    actor: event.actor || "BlendUp",
    branch: event.branch ?? branch,
    message: event.message || activityTitle(event.type),
    time: event.time,
    title: activityTitle(event.type),
    type: event.type
  }));

  entries.push({
    actor: "BlendUp",
    branch,
    message: `${assetLabel(asset.displayName)} cree`,
    time: asset.createdAt,
    title: "Creation",
    type: "asset.created"
  });

  if (asset.updatedAt !== asset.createdAt) {
    entries.push({
      actor: "BlendUp",
      branch,
      message: "Fiche asset mise a jour",
      time: asset.updatedAt,
      title: "Derniere modification",
      type: "asset.updated"
    });
  }

  if (asset.export.lastExportAt) {
    entries.push({
      actor: "Blender",
      branch,
      message: `Export FBX: ${formatExportStatus(asset.export.lastExportStatus)}`,
      time: asset.export.lastExportAt,
      title: "Export",
      type: "asset.exported"
    });
  }

  return entries.sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
}

function activityTitle(type: string) {
  const labels: Record<string, string> = {
    "asset.assignees_changed": "Assignation",
    "asset.created": "Creation",
    "asset.deleted": "Suppression",
    "asset.files_added": "Fichiers ajoutes",
    "asset.lods_changed": "LODs",
    "asset.moved": "Deplacement",
    "asset.notes_changed": "Notes",
    "asset.owners_changed": "Equipe",
    "asset.renamed": "Renommage",
    "asset.status_changed": "Etat",
    "asset.thumbnail_updated": "Visuel",
    "asset.variants_changed": "Variantes"
  };

  return labels[type] ?? type.replaceAll(".", " ");
}

function historyCategory(type: string): HistoryTypeFilter {
  if (type.includes("status")) {
    return "status";
  }

  if (type.includes("assignees") || type.includes("owners")) {
    return "team";
  }

  if (type.includes("notes")) {
    return "notes";
  }

  if (type.includes("files") || type.includes("moved") || type.includes("renamed") || type.includes("thumbnail")) {
    return "files";
  }

  if (type.includes("export")) {
    return "export";
  }

  return "other";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function baseName(path: string | undefined) {
  return normalizeFolderPath(path).split("/").filter(Boolean).pop() ?? "";
}


function ProblemActionButton({
  asset,
  exportAllowed,
  isExporting,
  onExportAsset,
  problem
}: {
  asset?: BlendUpAsset;
  exportAllowed: boolean;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problem: BlendUpProblem;
}) {
  const isExportAction = problem.actionLabel === "Exporter";
  const canExport = isExportAction && Boolean(asset) && exportAllowed;

  return (
    <button
      disabled={!canExport || isExporting}
      onClick={() => {
        if (asset && canExport) {
          onExportAsset(asset.id);
        }
      }}
      title={isExportAction && !exportAllowed ? "Export disponible en vue Artiste" : "Action pas encore disponible"}
      type="button"
    >
      {isExporting && canExport ? "Export" : problem.actionLabel}
    </button>
  );
}
