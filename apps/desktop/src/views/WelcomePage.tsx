import { FolderOpen, Plus, RotateCcw } from "lucide-react";

export function WelcomePage({
  createGitignore,
  createProjectName,
  createProjectRoot,
  createUnityFolders,
  isCreateProjectOpen,
  isCreatingProject,
  isLoadingProject,
  onCreateProject,
  onOpenDefaultProject,
  onOpenProject,
  onSelectCreateProjectDirectory,
  onSelectProjectDirectory,
  onToggleCreateProject,
  projectPathInput,
  recentProjects,
  setCreateGitignore,
  setCreateProjectName,
  setCreateProjectRoot,
  setCreateUnityFolders,
  setProjectPathInput
}: {
  createGitignore: boolean;
  createProjectName: string;
  createProjectRoot: string;
  createUnityFolders: boolean;
  isCreateProjectOpen: boolean;
  isCreatingProject: boolean;
  isLoadingProject: boolean;
  onCreateProject: () => void;
  onOpenDefaultProject: () => void;
  onOpenProject: (projectRoot: string) => Promise<boolean>;
  onSelectCreateProjectDirectory: () => void;
  onSelectProjectDirectory: () => void;
  onToggleCreateProject: () => void;
  projectPathInput: string;
  recentProjects: string[];
  setCreateGitignore: (createGitignore: boolean) => void;
  setCreateProjectName: (projectName: string) => void;
  setCreateProjectRoot: (projectRoot: string) => void;
  setCreateUnityFolders: (createUnityFolders: boolean) => void;
  setProjectPathInput: (projectRoot: string) => void;
}) {
  return (
    <section className="welcome-page" aria-label="Accueil BlendUp">
      <div className="welcome-brand">
        <div className="brand-mark">BU</div>
        <div>
          <span className="eyebrow">BlendUp</span>
          <h1>Ouvrir un projet</h1>
        </div>
      </div>

      <div className="welcome-actions">
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onOpenProject(projectPathInput);
          }}
        >
          <label className="settings-field">
            <span>Dossier projet</span>
            <input
              onChange={(event) => setProjectPathInput(event.target.value)}
              placeholder="C:\Users\morit\Desktop\BlendUp\BlendUp_projet_Test"
              value={projectPathInput}
            />
          </label>

          <div className="settings-actions">
            <button disabled={isLoadingProject} onClick={onSelectProjectDirectory} type="button">
              <FolderOpen size={16} />
              {isLoadingProject ? "Ouverture" : "Choisir"}
            </button>
            <button className="secondary" disabled={isLoadingProject} type="submit">
              Ouvrir ce chemin
            </button>
            <button onClick={onToggleCreateProject} type="button">
              <Plus size={16} />
              Creer
            </button>
            <button className="secondary" onClick={onOpenDefaultProject} type="button">
              <RotateCcw size={16} />
              Projet test
            </button>
          </div>
        </form>

        {isCreateProjectOpen ? (
          <CreateProjectPanel
            createGitignore={createGitignore}
            createProjectName={createProjectName}
            createProjectRoot={createProjectRoot}
            createUnityFolders={createUnityFolders}
            isCreatingProject={isCreatingProject}
            onCreateProject={onCreateProject}
            onSelectProjectDirectory={onSelectCreateProjectDirectory}
            setCreateGitignore={setCreateGitignore}
            setCreateProjectName={setCreateProjectName}
            setCreateProjectRoot={setCreateProjectRoot}
            setCreateUnityFolders={setCreateUnityFolders}
          />
        ) : null}

        {recentProjects.length > 0 ? (
          <section className="recent-projects" aria-label="Projets recents">
            <h2>Recents</h2>
            {recentProjects.map((projectRoot) => (
              <button key={projectRoot} onClick={() => void onOpenProject(projectRoot)} type="button">
                <FolderOpen size={16} />
                <span>{projectRoot}</span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function CreateProjectPanel({
  createGitignore,
  createProjectName,
  createProjectRoot,
  createUnityFolders,
  isCreatingProject,
  onCreateProject,
  onSelectProjectDirectory,
  setCreateGitignore,
  setCreateProjectName,
  setCreateProjectRoot,
  setCreateUnityFolders
}: {
  createGitignore: boolean;
  createProjectName: string;
  createProjectRoot: string;
  createUnityFolders: boolean;
  isCreatingProject: boolean;
  onCreateProject: () => void;
  onSelectProjectDirectory: () => void;
  setCreateGitignore: (createGitignore: boolean) => void;
  setCreateProjectName: (projectName: string) => void;
  setCreateProjectRoot: (projectRoot: string) => void;
  setCreateUnityFolders: (createUnityFolders: boolean) => void;
}) {
  return (
    <form
      className="create-project-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onCreateProject();
      }}
    >
      <div className="settings-heading">
        <span className="eyebrow">Nouveau projet</span>
        <h2>Creation guidee</h2>
      </div>

      <div className="create-project-grid">
        <label className="settings-field">
          <span>Nom</span>
          <input
            onChange={(event) => setCreateProjectName(event.target.value)}
            placeholder="Mon projet Unity"
            value={createProjectName}
          />
        </label>

        <label className="settings-field">
          <span>Dossier racine</span>
          <input
            onChange={(event) => setCreateProjectRoot(event.target.value)}
            placeholder="C:\Users\morit\Desktop\MonProjet"
            value={createProjectRoot}
          />
        </label>
      </div>

      <div className="settings-actions">
        <button className="secondary" onClick={onSelectProjectDirectory} type="button">
          <FolderOpen size={16} />
          Choisir dossier
        </button>
      </div>

      <div className="create-project-options">
        <label className="settings-check">
          <input
            checked={createUnityFolders}
            onChange={(event) => setCreateUnityFolders(event.target.checked)}
            type="checkbox"
          />
          <span>Preparer les dossiers Unity</span>
        </label>
        <label className="settings-check">
          <input
            checked={createGitignore}
            onChange={(event) => setCreateGitignore(event.target.checked)}
            type="checkbox"
          />
          <span>Ajouter un .gitignore adapte</span>
        </label>
      </div>

      <div className="settings-actions">
        <button disabled={isCreatingProject} type="submit">
          <Plus size={16} />
          {isCreatingProject ? "Creation" : "Creer le projet"}
        </button>
      </div>
    </form>
  );
}
