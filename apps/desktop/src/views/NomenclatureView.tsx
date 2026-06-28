import { BadgeCheck, Code2, ListTree, Sparkles } from "lucide-react";
import type { Role } from "../blendup/roles";
import type { ProjectSnapshot } from "../blendup/types";

const assetPrefixes = ["PROP", "ENV", "CHR", "MAT", "TEX", "UI", "FX"];
const blenderSuffixes = ["_MESH", "_COL", "_LOD0", "_LOD1", "_ARM", "_RIG", "_SOCKET"];
const forbiddenFragments = ["final", "new", "copy", "test"];
const branchExamples = [
  "asset/PROP_Barrel_01-modeling",
  "task/BU-124-door-interactable",
  "fix/PROP_CubeCrate_01-unity-import",
  "review/ENV_Rock_01-validation"
];

export function NomenclatureView({ role, snapshot }: { role: Role; snapshot: ProjectSnapshot }) {
  return (
    <section className={`nomenclature-page role-page nomenclature-page--${role}`} aria-label="Nomenclature">
      <div className="nomenclature-hero surface-panel">
        <div>
          <span className="eyebrow">Nomenclature</span>
          <h2>{role === "artist" ? "Nommer sans se tromper" : "Regles projet"}</h2>
          <p className="soft-text">
            {role === "artist"
              ? "Les conventions utiles au quotidien : asset, objet Blender, export et references."
              : "Vue plus technique des conventions, chemins et branches."}
          </p>
        </div>
        {role === "artist" ? <Sparkles size={28} /> : <Code2 size={28} />}
      </div>

      <div className="nomenclature-grid">
        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Assets</span>
              <h2>{`{prefix}_{name}_{index}`}</h2>
            </div>
            <ListTree size={20} />
          </div>
          <div className="token-list">
            {assetPrefixes.map((prefix) => (
              <span key={prefix}>{prefix}</span>
            ))}
          </div>
          <div className="naming-examples">
            <strong>PROP_CubeCrate_01</strong>
            <strong>ENV_Rock_01</strong>
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
          <div className="token-list">
            {blenderSuffixes.map((suffix) => (
              <span key={suffix}>{suffix}</span>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">A eviter</span>
              <h2>Fragments interdits</h2>
            </div>
          </div>
          <div className="token-list danger">
            {forbiddenFragments.map((fragment) => (
              <span key={fragment}>{fragment}</span>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Chemins</span>
              <h2>Racines projet</h2>
            </div>
          </div>
          <div className="path-rule-list">
            <code>{snapshot.project.paths.blenderRoot}</code>
            <code>{snapshot.project.paths.referencesRoot}</code>
            <code>{snapshot.project.paths.unityPrefabsRoot ?? "Unity/Assets/Prefabs"}</code>
            <code>{snapshot.project.paths.unityModelsRoot ?? "Unity/Assets/Models"}</code>
          </div>
        </section>

        {role === "developer" ? (
          <section className="surface-panel wide">
            <div className="section-heading-row">
              <div>
                <span className="eyebrow">Git</span>
                <h2>Branches recommandees</h2>
              </div>
            </div>
            <div className="branch-rule-list">
              {branchExamples.map((example) => (
                <code key={example}>{example}</code>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
