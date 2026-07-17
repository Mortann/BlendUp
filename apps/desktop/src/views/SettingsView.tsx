import { ExternalLink, FolderOpen, Gamepad2, LoaderCircle, RefreshCw, Save, Search, X } from "lucide-react";
import { ToolStatus } from "../app/ui";
import type { GameEngine, ProjectSnapshot, ToolDetection } from "../blendup/types";

export function SettingsView({
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
  showBlenderCommandPrompt
}: {
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
}) {
  return (
    <div className="view-page narrow">
      <header className="view-header">
        <div>
          <span className="eyebrow">Projet et outils</span>
          <h1>Parametres</h1>
          <p>Choisis le moteur et indique a BlendUp comment lancer Blender.</p>
        </div>
      </header>

      <section className="settings-section content-panel">
        <div className="section-heading"><Gamepad2 size={20} /><div><h2>Moteur du projet</h2><p>Le changement cree la nouvelle destination sans supprimer l'ancien dossier.</p></div></div>
        <div className="engine-cards">
          <EngineCard active={project.project.engine === "godot"} format="GLB" label="Godot" onClick={() => onChangeEngine("godot")} />
          <EngineCard active={project.project.engine === "unity"} format="FBX" label="Unity" onClick={() => onChangeEngine("unity")} />
        </div>
        <div className="path-stack">
          <PathRow label="Sources" onOpen={() => onOpenPath(project.project.paths.artRoot)} value={project.project.paths.artRoot} />
          <PathRow label="Projet moteur" onOpen={() => onOpenPath(project.project.paths.engineRoot)} value={project.project.paths.engineRoot} />
          <PathRow label="Exports" onOpen={() => onOpenPath(project.project.paths.engineAssetsRoot)} value={project.project.paths.engineAssetsRoot} />
        </div>
      </section>

      <section className="settings-section content-panel">
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
      </section>

      <section className="settings-section content-panel">
        <div className="section-heading"><Search size={20} /><div><h2>Blender</h2><p>Le chemin est optionnel si Blender est installe dans un emplacement standard.</p></div></div>
        <label className="field">
          <span>Chemin vers blender.exe</span>
          <input onChange={(event) => setBlenderPathInput(event.target.value)} placeholder="Detection automatique" value={blenderPathInput} />
        </label>
        <ToolStatus status={blenderDetection} />
        <label className="check-field">
          <input checked={showBlenderCommandPrompt} onChange={(event) => void setShowBlenderCommandPrompt(event.target.checked)} type="checkbox" />
          <span>Afficher la fenetre de commande au lancement de Blender</span>
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

function EngineCard({ active, format, label, onClick }: { active: boolean; format: string; label: string; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      <strong>{label}</strong><span>Export {format}</span>{active ? <b>Actif</b> : null}
    </button>
  );
}

function PathRow({ label, onOpen, value }: { label: string; onOpen: () => void; value: string }) {
  return <div className="path-row"><span>{label}</span><code>{value}</code><button onClick={onOpen} title={`Ouvrir ${value}`} type="button"><ExternalLink size={15} /></button></div>;
}
