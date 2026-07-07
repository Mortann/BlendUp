import { BadgeCheck, ListTree, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { AssetNamingRules, AssetTypePreset, ProjectSnapshot } from "../blendup/types";

const blenderSuffixesFallback = ["_MESH", "_COL", "_LOD0", "_LOD1", "_ARM", "_RIG", "_SOCKET"];
const forbiddenFragmentsFallback = ["final", "new", "copy", "test"];
export function NomenclatureView({
  onSaveAssetConfiguration,
  snapshot
}: {
  onSaveAssetConfiguration: (
    assetRoots: string[],
    assetTypePresets: AssetTypePreset[],
    assetNamingRules: AssetNamingRules
  ) => void;
  snapshot: ProjectSnapshot;
}) {
  const [typesDraft, setTypesDraft] = useState<AssetTypePreset[]>(snapshot.assetTypePresets);
  const [suffixesDraft, setSuffixesDraft] = useState(
    (snapshot.assetNamingRules.blenderSuffixes.length > 0
      ? snapshot.assetNamingRules.blenderSuffixes
      : blenderSuffixesFallback
    ).join(", ")
  );
  const [forbiddenDraft, setForbiddenDraft] = useState(
    (snapshot.assetNamingRules.forbiddenNameFragments.length > 0
      ? snapshot.assetNamingRules.forbiddenNameFragments
      : forbiddenFragmentsFallback
    ).join(", ")
  );
  const assetRoots = useMemo(
    () => snapshot.project.assets?.roots?.filter(Boolean) ?? [snapshot.project.paths.blenderRoot],
    [snapshot]
  );
  const prefixes = Array.from(new Set(typesDraft.map((type) => type.prefix.trim().toUpperCase()).filter(Boolean)));
  const namingRules: AssetNamingRules = {
    ...snapshot.assetNamingRules,
    prefixes,
    blenderSuffixes: splitCsv(suffixesDraft),
    forbiddenNameFragments: splitCsv(forbiddenDraft)
  };

  const updateType = (index: number, patch: Partial<AssetTypePreset>) => {
    setTypesDraft((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  };

  const addType = () => {
    setTypesDraft((current) => [
      ...current,
      {
        id: "new_type",
        displayName: "New Type",
        prefix: "NEW",
        categoryNames: ["New Type"],
        influence: ""
      }
    ]);
  };

  const removeType = (index: number) => {
    setTypesDraft((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="nomenclature-page role-page nomenclature-page--artist" aria-label="Nomenclature">
      <div className="nomenclature-hero surface-panel">
        <div>
          <span className="eyebrow">Nomenclature</span>
          <h2>Nommer sans se tromper</h2>
          <p className="soft-text">
            Les types ci-dessous pilotent le prefixe, le libelle et le type d'un asset selon son dossier.
          </p>
        </div>
        <Sparkles size={28} />
      </div>

      <div className="nomenclature-grid">
        <section className="surface-panel wide">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Types assets</span>
              <h2>{`{prefix}_{name}_{index}`}</h2>
            </div>
            <ListTree size={20} />
          </div>

          <div className="nomenclature-type-list">
            {typesDraft.map((type, index) => (
              <div className="nomenclature-type-row" key={`${type.id}-${index}`}>
                <label>
                  <span>Type</span>
                  <input onChange={(event) => updateType(index, { displayName: event.target.value })} value={type.displayName} />
                </label>
                <label>
                  <span>ID</span>
                  <input onChange={(event) => updateType(index, { id: event.target.value })} value={type.id} />
                </label>
                <label>
                  <span>Prefixe</span>
                  <input
                    maxLength={6}
                    onChange={(event) => updateType(index, { prefix: event.target.value.toUpperCase() })}
                    value={type.prefix}
                  />
                </label>
                <label>
                  <span>Dossiers</span>
                  <input
                    onChange={(event) => updateType(index, { categoryNames: splitCsv(event.target.value) })}
                    value={(type.categoryNames ?? []).join(", ")}
                  />
                </label>
                <label className="wide">
                  <span>Influence</span>
                  <input
                    onChange={(event) => updateType(index, { influence: event.target.value })}
                    value={type.influence ?? ""}
                  />
                </label>
                <button className="icon-button danger" onClick={() => removeType(index)} title="Supprimer" type="button">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="settings-actions">
            <button className="secondary" onClick={addType} type="button">
              <Plus size={16} />
              Ajouter un type
            </button>
            <button onClick={() => onSaveAssetConfiguration(assetRoots, typesDraft, namingRules)} type="button">
              <Save size={16} />
              Enregistrer
            </button>
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Blender</span>
              <h2>Suffixes d'objets</h2>
            </div>
            <BadgeCheck size={20} />
          </div>
          <textarea className="nomenclature-textarea" onChange={(event) => setSuffixesDraft(event.target.value)} rows={4} value={suffixesDraft} />
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">A eviter</span>
              <h2>Fragments interdits</h2>
            </div>
          </div>
          <textarea className="nomenclature-textarea" onChange={(event) => setForbiddenDraft(event.target.value)} rows={4} value={forbiddenDraft} />
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Chemins</span>
              <h2>Racines projet</h2>
            </div>
          </div>
          <div className="path-rule-list">
            {assetRoots.map((root) => (
              <code key={root}>{root}</code>
            ))}
            <code>{snapshot.project.paths.referencesRoot}</code>
            <code>{snapshot.project.paths.unityModelsRoot ?? "Unity/Assets/Models"}</code>
          </div>
        </section>

      </div>
    </section>
  );
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
