import { Boxes, Layers3 } from "lucide-react";
import type { Role } from "../blendup/roles";
import type { ProjectSnapshot } from "../blendup/types";
import { EmptyState } from "../app/ui";

type ReferenceItem = {
  assetId: string;
  assetName: string;
  path: string;
};

export function ReferencesView({
  onOpenAsset,
  role,
  snapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  role: Role;
  snapshot: ProjectSnapshot;
}) {
  const references = snapshot.assets.flatMap((asset) =>
    asset.references.map((path) => ({
      assetId: asset.id,
      assetName: asset.displayName,
      path
    }))
  );
  const folders = Array.from(
    new Set(references.map((reference) => reference.path.split(/[\\/]/).filter(Boolean).slice(0, 3).join("/")))
  ).filter(Boolean);

  return (
    <section className={`references-page role-page references-page--${role}`} aria-label="References">
      <div className="reference-hero">
        <div>
          <span className="eyebrow">References</span>
          <h2>{role === "artist" ? "Direction visuelle" : "Refs liees aux assets"}</h2>
          <p>
            {role === "artist"
              ? "Une vue calme pour retrouver les boards, les dossiers de refs et les assets lies."
              : "Vue secondaire : utile pour verifier les liens, mais moins prioritaire que les problems et Git."}
          </p>
        </div>
        <div className="reference-count">
          <strong>{references.length}</strong>
          <span>reference(s)</span>
        </div>
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
              <span className="eyebrow">Assets</span>
              <h2>Refs liees</h2>
            </div>
          </div>
          {references.length > 0 ? (
            <div className="reference-list">
              {references.map((reference) => (
                <ReferenceRow key={`${reference.assetId}-${reference.path}`} onOpenAsset={onOpenAsset} reference={reference} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Boxes size={26} />} label="Aucune reference liee aux assets" />
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
    <button className="reference-row" onClick={() => onOpenAsset(reference.assetId)} type="button">
      <span>{reference.path}</span>
      <strong>{reference.assetName}</strong>
    </button>
  );
}
