import { FolderOpen, Gamepad2, Plus, RotateCcw } from "lucide-react";
import { BrandLogo } from "../app/BrandLogo";
import type { GameEngine } from "../blendup/types";

export function WelcomePage({
  createEngine,
  createProjectName,
  createProjectRoot,
  isCreatingProject,
  isLoadingProject,
  onCreateProject,
  onOpenDefaultProject,
  onOpenProject,
  onSelectCreateProjectDirectory,
  onSelectProjectDirectory,
  projectPathInput,
  recentProjects,
  setCreateEngine,
  setCreateProjectName,
  setCreateProjectRoot,
  setProjectPathInput
}: {
  createEngine: GameEngine;
  createProjectName: string;
  createProjectRoot: string;
  isCreatingProject: boolean;
  isLoadingProject: boolean;
  onCreateProject: () => void;
  onOpenDefaultProject: () => void;
  onOpenProject: (projectRoot: string) => Promise<boolean>;
  onSelectCreateProjectDirectory: () => void;
  onSelectProjectDirectory: () => void;
  projectPathInput: string;
  recentProjects: string[];
  setCreateEngine: (engine: GameEngine) => void;
  setCreateProjectName: (value: string) => void;
  setCreateProjectRoot: (value: string) => void;
  setProjectPathInput: (value: string) => void;
}) {
  return (
    <section className="welcome-page">
      <header className="welcome-brand">
        <BrandLogo large />
        <div>
          <span className="eyebrow">Blender vers le moteur</span>
          <h1>BlendUp</h1>
          <p>Un flux simple pour exporter tes assets vers Godot ou Unity.</p>
        </div>
      </header>

      <div className="welcome-grid">
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            void onOpenProject(projectPathInput);
          }}
        >
          <div className="panel-heading">
            <FolderOpen size={20} />
            <div><h2>Ouvrir un projet</h2><p>Choisis un dossier contenant `.blendup/project.json`.</p></div>
          </div>
          <label className="field">
            <span>Dossier du projet</span>
            <input onChange={(event) => setProjectPathInput(event.target.value)} value={projectPathInput} />
          </label>
          <div className="button-row">
            <button disabled={isLoadingProject} onClick={onSelectProjectDirectory} type="button">
              <FolderOpen size={16} /> Choisir
            </button>
            <button className="primary" disabled={isLoadingProject || !projectPathInput.trim()} type="submit">
              Ouvrir
            </button>
            <button className="ghost" onClick={onOpenDefaultProject} type="button">
              <RotateCcw size={16} /> Projet test
            </button>
          </div>
        </form>

        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateProject();
          }}
        >
          <div className="panel-heading">
            <Gamepad2 size={20} />
            <div><h2>Nouveau projet</h2><p>BlendUp prepare Art et le dossier Assets du moteur.</p></div>
          </div>
          <label className="field">
            <span>Nom</span>
            <input onChange={(event) => setCreateProjectName(event.target.value)} value={createProjectName} />
          </label>
          <label className="field">
            <span>Dossier racine</span>
            <div className="input-action">
              <input onChange={(event) => setCreateProjectRoot(event.target.value)} value={createProjectRoot} />
              <button onClick={onSelectCreateProjectDirectory} type="button"><FolderOpen size={16} /></button>
            </div>
          </label>
          <div className="engine-picker" aria-label="Moteur du projet">
            <button className={createEngine === "godot" ? "active" : ""} onClick={() => setCreateEngine("godot")} type="button">Godot · GLB</button>
            <button className={createEngine === "unity" ? "active" : ""} onClick={() => setCreateEngine("unity")} type="button">Unity · FBX</button>
          </div>
          <button className="primary full" disabled={isCreatingProject} type="submit">
            <Plus size={16} /> {isCreatingProject ? "Creation…" : "Creer le projet"}
          </button>
        </form>
      </div>

      {recentProjects.length > 0 ? (
        <section className="recent-projects">
          <h2>Projets recents</h2>
          <div>
            {recentProjects.map((root) => (
              <button key={root} onClick={() => void onOpenProject(root)} type="button">
                <FolderOpen size={15} /><span>{root}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
