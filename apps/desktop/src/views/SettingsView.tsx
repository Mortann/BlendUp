import { ExternalLink, FolderOpen, Gamepad2, Gauge, LoaderCircle, RefreshCw, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolStatus } from "../app/ui";
import type { BlenderProjectSettings, BlendUpProject, GameEngine, ProjectSnapshot, ToolDetection } from "../blendup/types";

export function SettingsView({
  onSetupIntegration, integrationBusy,
  blenderDetection,
  blenderPathInput,
  exportBusy,
  isDetectingBlender,
  isReexporting,
  onChangeEngine,
  onCloseProject,
  onDetectBlender,
  onOpenPath,
  onReexportAll,
  onSaveSettings,
  project,
  setBlenderPathInput,
  setShowBlenderCommandPrompt,
  showBlenderCommandPrompt,
  openAssetAfterCreation,
  setOpenAssetAfterCreation,
  checkingUvs,
  onCheckAllUvs,
  onSaveProjectBlenderSettings,
  onSaveProjectPaths
}: {
  onSetupIntegration: (editor: "blender" | "godot") => Promise<void>;
  integrationBusy: boolean;
  blenderDetection: ToolDetection | null;
  blenderPathInput: string;
  exportBusy: boolean;
  isDetectingBlender: boolean;
  isReexporting: boolean;
  onChangeEngine: (engine: GameEngine) => void;
  onCloseProject: () => void;
  onDetectBlender: () => void;
  onOpenPath: (path: string) => void;
  onReexportAll: () => Promise<void>;
  onSaveSettings: () => void;
  project: ProjectSnapshot;
  setBlenderPathInput: (value: string) => void;
  setShowBlenderCommandPrompt: (show: boolean) => void;
  showBlenderCommandPrompt: boolean;
  openAssetAfterCreation: boolean;
  setOpenAssetAfterCreation: (open: boolean) => void;
  checkingUvs: boolean;
  onCheckAllUvs: () => Promise<void>;
  onSaveProjectBlenderSettings: (settings: BlenderProjectSettings) => Promise<boolean>;
  onSaveProjectPaths: (paths: BlendUpProject["paths"]) => Promise<boolean>;
}) {
  const [blenderSettings, setBlenderSettings] = useState(project.project.blender);
  const [savingProject, setSavingProject] = useState(false);
  const [paths, setPaths] = useState(project.project.paths);
  const [savingPaths, setSavingPaths] = useState(false);
  const pathsSignature = JSON.stringify(project.project.paths);
  useEffect(() => { setPaths(project.project.paths); }, [project.project.projectId, pathsSignature]);
  const pathsChanged = JSON.stringify(paths) !== pathsSignature;
  const updateEnginePath = (engineRoot: string) => setPaths((current) => ({ ...current, engineRoot, engineAssetsRoot: current.engineAssetsRoot?.startsWith(`${current.engineRoot}/`) ? engineRoot + current.engineAssetsRoot.slice(current.engineRoot!.length) : current.engineAssetsRoot }));
  const savePaths = async () => {
    setSavingPaths(true);
    try { await onSaveProjectPaths(paths); } finally { setSavingPaths(false); }
  };
  const settingsSignature = JSON.stringify(project.project.blender);
  useEffect(() => { setBlenderSettings(project.project.blender); }, [project.project.projectId, settingsSignature]);
  const validThreshold = Number.isFinite(blenderSettings.minimumUvScore) && blenderSettings.minimumUvScore >= 1 && blenderSettings.minimumUvScore <= 100;
  const unsaved = JSON.stringify(blenderSettings) !== settingsSignature;
  const saveBlenderSettings = async () => {
    if (!validThreshold || savingProject) return;
    setSavingProject(true);
    try { await onSaveProjectBlenderSettings(blenderSettings); }
    finally { setSavingProject(false); }
  };
  const updateBlenderSettings = (patch: Partial<BlenderProjectSettings>) => setBlenderSettings((current) => ({ ...current, ...patch }));
  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <span className="eyebrow">Projet et outils</span>
          <h1>Paramètres</h1>
          <p>Configure le projet, la préparation des assets et le lancement de Blender.</p>
        </div>
      </header>

      <section className="settings-section content-panel">
        <div className="section-heading"><Gamepad2 size={20} /><div><h2>Type de projet</h2><p>Gère tes assets en 3D ou relie un moteur. Les fichiers existants sont conservés.</p></div></div>
        <div className="engine-cards">
          <EngineCard active={project.project.engine === "none"} disabled={exportBusy || isReexporting} format="Sans moteur" label="3D" onClick={() => onChangeEngine("none")} />
          <EngineCard active={project.project.engine === "godot"} disabled={exportBusy || isReexporting} format="Export GLB" label="Godot" onClick={() => onChangeEngine("godot")} />
          <EngineCard active={project.project.engine === "unity"} disabled={exportBusy || isReexporting} format="Export FBX" label="Unity" onClick={() => onChangeEngine("unity")} />
        </div>
        <div className="path-stack">
          <PathRow label="Sources" disabled={savingPaths} onChange={(artRoot) => setPaths((current) => ({ ...current, artRoot }))} onOpen={() => onOpenPath(project.project.paths.artRoot)} value={paths.artRoot} />
          {project.project.engine !== "none" ? <>
            <PathRow label="Projet moteur" disabled={savingPaths} onChange={updateEnginePath} onOpen={() => onOpenPath(project.project.paths.engineRoot!)} value={paths.engineRoot ?? ""} />
            <PathRow label="Exports" disabled={savingPaths} onChange={(engineAssetsRoot) => setPaths((current) => ({ ...current, engineAssetsRoot }))} onOpen={() => onOpenPath(project.project.paths.engineAssetsRoot!)} value={paths.engineAssetsRoot ?? ""} />
          </> : null}
        </div>
        <p>Chemins relatifs au projet. Enregistrer renomme les dossiers existants et conserve leurs fichiers. Ferme Blender et le moteur avant de les déplacer.{project.project.engine === "unity" ? " Unity nécessite un dossier d’exports dans Assets." : ""}</p>
        <div className="button-row"><button className="primary" disabled={!pathsChanged || !paths.artRoot.trim() || savingPaths || exportBusy || isReexporting} onClick={() => void savePaths()} type="button">{savingPaths ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Enregistrer les dossiers</button>{pathsChanged ? <button disabled={savingPaths} onClick={() => setPaths(project.project.paths)} type="button">Annuler</button> : null}</div>
      </section>

      <section className="settings-section content-panel">
        <div className="section-heading"><Gauge size={20} /><div><h2>Préparation et qualité dans Blender</h2><p>Options de ce projet, partagées avec l’add-on BlendUp 0.5.1 ou plus récent.</p></div></div>
        <div className="uv-settings-grid">
          <div className="settings-option-group">
            <h3>À chaque sauvegarde du .blend</h3>
            <label className="check-field"><input checked={blenderSettings.applyTransformsOnSave} disabled={savingProject} onChange={(event) => updateBlenderSettings({ applyTransformsOnSave: event.target.checked })} type="checkbox" /><span>Appliquer position, rotation et échelle des maillages</span></label>
            <label className="check-field"><input checked={blenderSettings.unwrapOnSave} disabled={savingProject} onChange={(event) => updateBlenderSettings({ unwrapOnSave: event.target.checked })} type="checkbox" /><span>Refaire automatiquement l’unwrap Angle Based</span></label>
            <p>Ces actions modifient tous les maillages locaux de la scène. L’unwrap remplace les UV de rendu en utilisant les coutures existantes.</p>
          </div>
          <div className="settings-option-group">
            <h3>Contrôle des UV</h3>
            <label className="check-field"><input checked={blenderSettings.validateUvs} disabled={savingProject} onChange={(event) => updateBlenderSettings({ validateUvs: event.target.checked })} type="checkbox" /><span>Vérifier automatiquement les UV et bloquer les exports insuffisants</span></label>
            <label className="field uv-threshold"><span>Score minimum autorisé (sur 100)</span><input disabled={savingProject || !blenderSettings.validateUvs} min={1} max={100} step={1} type="number" value={blenderSettings.minimumUvScore} onChange={(event) => updateBlenderSettings({ minimumUvScore: Number(event.target.value) })} /></label>
            {!validThreshold ? <p className="field-error" role="alert">Choisis un score minimum compris entre 1 et 100.</p> : null}
            <label className="check-field"><input checked={blenderSettings.allowUvOverlap} disabled={savingProject} onChange={(event) => updateBlenderSettings({ allowUvOverlap: event.target.checked })} type="checkbox" /><span>Tolérer les chevauchements UV intentionnels</span></label>
            <p>Score de 0 à 100 selon les UV valides, l’étirement, la densité et les chevauchements. Les UV sur plusieurs tuiles sont acceptées. Les coutures sont analysées séparément.</p>
          </div>
        </div>
        <p>Le contrôle s’effectue à la sauvegarde et avant tout export moteur, y compris pour les variantes et LOD. Un score ancien est marqué à revérifier. L’aperçu 3D reste disponible.</p>
        <div className="button-row">
          <button className="primary" disabled={savingProject || exportBusy || !validThreshold || !unsaved} onClick={() => void saveBlenderSettings()} type="button">{savingProject ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Enregistrer les options du projet</button>
          <button disabled={savingProject || exportBusy || unsaved || !project.assets.length} onClick={() => void onCheckAllUvs()} type="button">{checkingUvs ? <LoaderCircle className="spin" size={16} /> : <Gauge size={16} />}{checkingUvs ? "Vérification…" : "Vérifier tous les assets"}</button>
          {unsaved ? <span className="settings-unsaved">Modifications à enregistrer</span> : null}
        </div>
      </section>

      <section className="settings-section content-panel">
        <div className="section-heading"><ExternalLink size={20} /><div><h2>Bibliothèque dans les éditeurs</h2><p>Retrouve les assets du projet associé dans Blender et Godot, puis glisse-les dans ta scène.</p></div></div>
        <div className="editor-integrations">
          <div><h3>Blender</h3><p>Installe l’add-on BlendUp 0.6.0, puis ouvre un asset ou un Showcase. Dans la barre latérale BlendUp, la bibliothèque permet de placer un asset au curseur 3D ou d’ouvrir le navigateur avec glisser-déposer. Les instances sont liées par défaut.</p>
            <button disabled={integrationBusy || project.integrations?.libraryStatus === "generating"} onClick={() => void onSetupIntegration("blender")} type="button"><RefreshCw size={16} />{project.integrations?.libraryStatus === "generating" ? "Synchronisation…" : "Synchroniser la bibliothèque Blender"}</button>
            {project.integrations?.blender ? <p>{project.integrations.libraryCount} assets prêts · synchronisation automatique lorsque BlendUp est ouvert.</p> : null}
            {project.integrations?.libraryErrors.map((error, i) => <p className="field-error" key={i}>{error.name} : {error.error}</p>)}
          </div>
          {project.project.engine === "godot" ? <div><h3>Godot 4</h3><p>Le panneau comprend recherche, filtres par dossier, aperçus et glisser-déposer dans la vue 3D. Seuls les exports à jour sont utilisables. La scène reste liée à son export.</p>
            <button disabled={integrationBusy} onClick={() => void onSetupIntegration("godot")} type="button"><ExternalLink size={16} />{project.integrations?.godot ? "Mettre à jour le panneau Godot" : "Installer et activer le panneau Godot"}</button>
            <p>Si Godot est déjà ouvert, rouvre le projet après l’installation.</p>
          </div> : null}
        </div>
      </section>

      {project.project.engine !== "none" ? <section className="settings-section content-panel">
        <div className="section-heading"><RefreshCw size={20} /><div><h2>Reconstruire les exports</h2><p>Place les exports générés dans la corbeille, puis réexporte chaque asset, ses variantes et ses LOD.</p></div></div>
        <div className="button-row">
          <button
            className="danger"
            disabled={exportBusy || isReexporting || !project.assets.length}
            onClick={() => {
              if (window.confirm("Placer tous les exports gérés par BlendUp dans la corbeille, puis tout réexporter ?")) void onReexportAll();
            }}
            type="button"
          >{isReexporting ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} {isReexporting ? "Réexportation…" : "Tout réexporter"}</button>
        </div>
      </section> : null}

      <section className="settings-section content-panel">
        <div className="section-heading"><Search size={20} /><div><h2>Application et lancement de Blender</h2><p>Préférences locales à cet ordinateur. Le chemin est optionnel si Blender est installé dans un emplacement standard.</p></div></div>
        <label className="field">
          <span>Chemin vers blender.exe</span>
          <input onChange={(event) => setBlenderPathInput(event.target.value)} placeholder="Detection automatique" value={blenderPathInput} />
        </label>
        <ToolStatus status={blenderDetection} />
        <label className="check-field">
          <input checked={showBlenderCommandPrompt} onChange={(event) => void setShowBlenderCommandPrompt(event.target.checked)} type="checkbox" />
          <span>Afficher la fenetre de commande au lancement de Blender</span>
        </label>
        <label className="check-field">
          <input checked={openAssetAfterCreation} onChange={(event) => setOpenAssetAfterCreation(event.target.checked)} type="checkbox" />
          <span>Ouvrir automatiquement les nouveaux assets dans Blender</span>
        </label>
        <div className="button-row">
          <button className="ghost" disabled={isDetectingBlender} onClick={onDetectBlender} type="button"><Search size={16} /> {isDetectingBlender ? "Detection…" : "Detecter"}</button>
          <button className="primary" onClick={onSaveSettings} type="button"><Save size={16} /> Enregistrer</button>
        </div>
      </section>

      <section className="settings-section content-panel">
        <div className="section-heading"><FolderOpen size={20} /><div><h2>Projet BlendUp</h2><p>{project.projectRoot}</p></div></div>
        <div className="button-row">
          <button className="ghost" onClick={() => onOpenPath(".")} type="button"><ExternalLink size={16} /> Ouvrir le dossier</button>
          <button className="danger" onClick={onCloseProject} type="button"><X size={16} /> Fermer le projet</button>
        </div>
      </section>
    </div>
  );
}

function EngineCard({ active, disabled, format, label, onClick }: { active: boolean; disabled: boolean; format: string; label: string; onClick: () => void }) {
  return (
    <button aria-pressed={active} className={active ? "active" : ""} disabled={disabled} onClick={onClick} type="button">
      <strong>{label}</strong><span>{format}</span>{active ? <b>Actif</b> : null}
    </button>
  );
}

function PathRow({ label, disabled, onChange, onOpen, value }: { label: string; disabled: boolean; onChange: (value: string) => void; onOpen: () => void; value: string }) {
  return <div className="path-row"><label className="path-field"><span>{label}</span><input disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value} /></label><button disabled={disabled} onClick={onOpen} title={`Ouvrir le dossier ${label.toLowerCase()}`} type="button"><ExternalLink size={15} /></button></div>;
}
