import { Boxes, ExternalLink, GalleryHorizontal, Layers3, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectSnapshot } from "../blendup/types";
import { EmptyState } from "../app/ui";

type ReferenceItem = {
  assetId?: string;
  assetName?: string;
  path: string;
  taskId?: string;
  theme: string;
};

type ReferenceSortMode = "folder" | "asset" | "theme";

export function ReferencesView({
  onOpenAsset,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}) {
  const seedReferences = useMemo(() => {
    return snapshot.assets.flatMap((asset) =>
      asset.references.map((path) => ({
        assetId: asset.id,
        assetName: asset.displayName,
        path,
        theme: asset.tags[0] ?? "General"
      }))
    );
  }, [snapshot.assets]);
  const [references, setReferences] = useState<ReferenceItem[]>(seedReferences);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ReferenceSortMode>("folder");
  const [draftPath, setDraftPath] = useState("");
  const [draftTheme, setDraftTheme] = useState("General");
  const [draftAssetId, setDraftAssetId] = useState("");
  const folders = Array.from(
    new Set(references.map((reference) => reference.path.split(/[\\/]/).filter(Boolean).slice(0, 3).join("/")))
  ).filter(Boolean);
  const visibleReferences = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = references.filter((reference) => {
      const searchable = [reference.path, reference.assetName, reference.theme, reference.taskId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !normalizedQuery || searchable.includes(normalizedQuery);
    });

    return [...filtered].sort((left, right) => {
      if (sortMode === "asset") {
        return (left.assetName ?? "").localeCompare(right.assetName ?? "") || left.path.localeCompare(right.path);
      }

      if (sortMode === "theme") {
        return left.theme.localeCompare(right.theme) || left.path.localeCompare(right.path);
      }

      return left.path.localeCompare(right.path);
    });
  }, [query, references, sortMode]);

  const addReference = () => {
    const path = draftPath.trim();

    if (!path) {
      return;
    }

    const asset = snapshot.assets.find((item) => item.id === draftAssetId);
    setReferences((current) => [
      {
        assetId: asset?.id,
        assetName: asset?.displayName,
        path,
        theme: draftTheme.trim() || "General"
      },
      ...current
    ]);
    setDraftPath("");
  };

  return (
    <section className="references-page role-page references-page--artist" aria-label="References">
      <div className="reference-hero">
        <div>
          <span className="eyebrow">References</span>
          <h2>Direction visuelle</h2>
          <p>Dossiers, themes et liens d'assets dans une vue dediee.</p>
        </div>
        <div className="reference-count">
          <strong>{references.length}</strong>
          <span>reference(s)</span>
        </div>
      </div>

      <div className="reference-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ref" />
        </label>
        <label className="select-control">
          <Layers3 size={15} />
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as ReferenceSortMode)}>
            <option value="folder">Dossier</option>
            <option value="asset">Asset</option>
            <option value="theme">Theme</option>
          </select>
        </label>
      </div>

      <div className="reference-create-bar">
        <input value={draftPath} onChange={(event) => setDraftPath(event.target.value)} placeholder="Chemin reference" />
        <input value={draftTheme} onChange={(event) => setDraftTheme(event.target.value)} placeholder="Theme" />
        <select value={draftAssetId} onChange={(event) => setDraftAssetId(event.target.value)}>
          <option value="">Asset optionnel</option>
          {snapshot.assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.displayName}
            </option>
          ))}
        </select>
        <button onClick={addReference} type="button">
          <Plus size={16} />
          Ajouter
        </button>
      </div>

      <div className="reference-layout">
        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Dossiers</span>
              <h2>Racines connues</h2>
            </div>
          </div>
          {folders.length > 0 ? (
            <div className="reference-folder-list">
              {folders.map((folder) => (
                <div className="reference-folder" key={folder}>
                  <Layers3 size={17} />
                  <span>{folder}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Layers3 size={26} />} label="Aucun dossier reference detecte" />
          )}
        </section>

        <section className="surface-panel reference-linked-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Associations</span>
              <h2>Refs organisees</h2>
            </div>
            <button className="compact-action" type="button">
              <ExternalLink size={15} />
              PureRef
            </button>
          </div>
          {visibleReferences.length > 0 ? (
            <div className="reference-list">
              {visibleReferences.map((reference) => (
                <ReferenceRow key={`${reference.assetId ?? "global"}-${reference.path}`} onOpenAsset={onOpenAsset} reference={reference} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Boxes size={26} />} label="Aucune reference" />
          )}
        </section>
      </div>
    </section>
  );
}

function ReferenceRow({
  onOpenAsset,
  reference
}: {
  onOpenAsset: (assetId?: string) => void;
  reference: ReferenceItem;
}) {
  return (
    <button className="reference-row" disabled={!reference.assetId} onClick={() => onOpenAsset(reference.assetId)} type="button">
      <GalleryHorizontal size={17} />
      <span>{reference.path}</span>
      <strong>{reference.assetName ?? "Reference globale"}</strong>
      <small>{reference.theme}</small>
    </button>
  );
}
