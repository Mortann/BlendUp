import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FileSearch,
  FolderOpen,
  GitBranch,
  Home,
  Layers3,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Wrench,
  UserRound
} from "lucide-react";
import type {
  BlendUpAsset,
  BlendUpProblem,
  BlendUpTask,
  LocalToolsSnapshot,
  ProjectSnapshot,
  TaskPriority,
  TaskStatus,
  UserSettings
} from "./blendup/types";
import type { Role, RoleCapabilities } from "./blendup/roles";
import {
  capabilitiesFor,
  defaultRoleFromProject,
  loadStoredRole,
  roleLabel,
  storeRole
} from "./blendup/roles";
import { exportAssetToFbx } from "./blendup/actions";
import {
  createProject,
  detectLocalTools,
  loadDefaultProjectSnapshot,
  loadProjectSnapshot,
  loadUserSettings,
  rememberProjectInSettings,
  saveUserSettings,
  selectProjectDirectory,
  takeOpenRequest
} from "./blendup/projectLoader";
import {
  formatAssetType,
  formatExportStatus,
  formatStatus,
  formatTaskPriority,
  formatTaskStatus,
  severityLabel
} from "./ui/format";

type ActiveView = "assets" | "dashboard" | "git" | "problems" | "settings" | "tasks";
type OperationMessage = {
  detail?: string;
  title: string;
  tone: "info" | "success" | "error";
};
type SeverityFilter = BlendUpProblem["severity"] | "all";
type SourceFilter = BlendUpProblem["source"] | "all";
type TaskPriorityFilter = TaskPriority | "all";
type TaskStatusFilter = TaskStatus | "all";

const roleFilters: Array<{ label: string; value: Role }> = [
  { label: "Artiste", value: "artist" },
  { label: "Dev", value: "developer" }
];

const severityFilters: Array<{ label: string; value: SeverityFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Critiques", value: "critical" },
  { label: "Erreurs", value: "error" },
  { label: "Warnings", value: "warning" },
  { label: "Infos", value: "info" }
];

const sourceFilters: Array<{ label: string; value: SourceFilter }> = [
  { label: "Toutes", value: "all" },
  { label: "BlendUp", value: "blendup" },
  { label: "Blender", value: "blender" },
  { label: "Unity", value: "unity" },
  { label: "Git", value: "git" }
];

const taskStatusFilters: Array<{ label: string; value: TaskStatusFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Todo", value: "todo" },
  { label: "En cours", value: "in_progress" },
  { label: "Review", value: "review" },
  { label: "Termine", value: "done" },
  { label: "Bloque", value: "blocked" }
];

const taskPriorityFilters: Array<{ label: string; value: TaskPriorityFilter }> = [
  { label: "Toutes", value: "all" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" }
];

const initialUserSettings = await loadUserSettings();
let initialProject: ProjectSnapshot | null = null;
let initialOperationMessage: OperationMessage | null = null;

if (initialUserSettings.lastProjectRoot) {
  try {
    initialProject = await loadProjectSnapshot(initialUserSettings.lastProjectRoot);
  } catch (error) {
    initialOperationMessage = {
      tone: "error",
      title: "Dernier projet introuvable",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

const initialRole: Role = loadStoredRole() ?? (initialProject ? defaultRoleFromProject(initialProject.project) : "artist");

function App() {
  const [project, setProject] = useState<ProjectSnapshot | null>(initialProject);
  const [role, setRole] = useState<Role>(initialRole);
  const [activeView, setActiveView] = useState<ActiveView>(initialProject ? "dashboard" : "assets");
  const [blenderPathInput, setBlenderPathInput] = useState(initialUserSettings.blenderPath ?? "");
  const [createGitignore, setCreateGitignore] = useState(true);
  const [createProjectName, setCreateProjectName] = useState("");
  const [createProjectRoot, setCreateProjectRoot] = useState("");
  const [createUnityFolders, setCreateUnityFolders] = useState(true);
  const [exportingAssetId, setExportingAssetId] = useState<string | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isDetectingTools, setIsDetectingTools] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [operationMessage, setOperationMessage] = useState<OperationMessage | null>(initialOperationMessage);
  const [projectPathInput, setProjectPathInput] = useState(
    initialProject?.projectRoot ?? initialUserSettings.lastProjectRoot ?? ""
  );
  const [pureRefPathInput, setPureRefPathInput] = useState(initialUserSettings.pureRefPath ?? "");
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(initialProject?.assets[0]?.id ?? "");
  const [toolsSnapshot, setToolsSnapshot] = useState<LocalToolsSnapshot | null>(null);
  const [unityPathInput, setUnityPathInput] = useState(initialUserSettings.unityPath ?? "");
  const [userSettings, setUserSettings] = useState<UserSettings>(initialUserSettings);

  const selectedAsset = project
    ? project.assets.find((asset) => asset.id === selectedAssetId) ?? project.assets[0]
    : undefined;

  const capabilities = capabilitiesFor(role);
  const shellStyle = { "--role-accent": capabilities.accent } as CSSProperties;

  useEffect(() => {
    storeRole(role);
  }, [role]);

  useEffect(() => {
    void refreshToolDetection(true);
    // Run once on startup to detect tools without overriding saved paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistUserSettings = async (nextSettings: UserSettings) => {
    const savedSettings = await saveUserSettings(nextSettings);
    setUserSettings(savedSettings);
    setBlenderPathInput(savedSettings.blenderPath ?? "");
    setUnityPathInput(savedSettings.unityPath ?? "");
    setPureRefPathInput(savedSettings.pureRefPath ?? "");

    return savedSettings;
  };

  const chooseProjectDirectory = async () => {
    try {
      const selectedDirectory = await selectProjectDirectory();

      if (selectedDirectory) {
        setProjectPathInput(selectedDirectory);
        await openProject(selectedDirectory);
      }
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Selection indisponible",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const chooseCreateProjectDirectory = async () => {
    try {
      const selectedDirectory = await selectProjectDirectory();

      if (selectedDirectory) {
        setCreateProjectRoot(selectedDirectory);
      }
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Selection indisponible",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const refreshToolDetection = async (fillEmptyPaths = false) => {
    setIsDetectingTools(true);

    try {
      const detectedTools = await detectLocalTools({
        blenderPath: blenderPathInput,
        pureRefPath: pureRefPathInput,
        unityPath: unityPathInput
      });
      const nextBlenderPath = fillEmptyPaths && !blenderPathInput ? detectedTools.blender.path ?? "" : blenderPathInput;
      const nextUnityPath = fillEmptyPaths && !unityPathInput ? detectedTools.unity.path ?? "" : unityPathInput;
      const nextPureRefPath = fillEmptyPaths && !pureRefPathInput ? detectedTools.pureRef.path ?? "" : pureRefPathInput;

      setToolsSnapshot(detectedTools);

      if (
        nextBlenderPath !== blenderPathInput ||
        nextUnityPath !== unityPathInput ||
        nextPureRefPath !== pureRefPathInput
      ) {
        setBlenderPathInput(nextBlenderPath);
        setUnityPathInput(nextUnityPath);
        setPureRefPathInput(nextPureRefPath);
        await persistUserSettings({
          ...userSettings,
          blenderPath: nextBlenderPath,
          unityPath: nextUnityPath,
          pureRefPath: nextPureRefPath
        });
      }
    } finally {
      setIsDetectingTools(false);
    }
  };

  const openProject = async (projectRoot: string): Promise<boolean> => {
    const trimmedProjectRoot = projectRoot.trim();

    if (!trimmedProjectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Projet non charge",
        detail: "Renseigne un dossier projet BlendUp."
      });
      return false;
    }

    setIsLoadingProject(true);

    try {
      const nextProject = await loadProjectSnapshot(trimmedProjectRoot);
      const nextSettings = rememberProjectInSettings(userSettings, nextProject.projectRoot ?? trimmedProjectRoot);
      const openRequest = nextProject.projectRoot ? await takeOpenRequest(nextProject.projectRoot) : null;
      const requestedAsset = openRequest?.assetId
        ? nextProject.assets.find((asset) => asset.id === openRequest.assetId)
        : undefined;

      await persistUserSettings({
        ...nextSettings,
        blenderPath: blenderPathInput,
        unityPath: unityPathInput,
        pureRefPath: pureRefPathInput
      });
      setProject(nextProject);
      setProjectPathInput(nextProject.projectRoot ?? trimmedProjectRoot);
      setSelectedAssetId(requestedAsset?.id ?? nextProject.assets[0]?.id ?? "");
      setActiveView(requestedAsset ? "assets" : "dashboard");
      setRole(loadStoredRole() ?? defaultRoleFromProject(nextProject.project));
      setOperationMessage({
        tone: "success",
        title: requestedAsset ? "Asset ouvert" : "Projet ouvert",
        detail: requestedAsset?.displayName ?? nextProject.projectRoot ?? trimmedProjectRoot
      });
      return true;
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Projet non charge",
        detail: error instanceof Error ? error.message : String(error)
      });
      return false;
    } finally {
      setIsLoadingProject(false);
    }
  };

  const openDefaultProject = async () => {
    setIsLoadingProject(true);

    try {
      const nextProject = await loadDefaultProjectSnapshot();
      const projectRoot = nextProject.projectRoot;

      if (projectRoot) {
        await persistUserSettings({
          ...rememberProjectInSettings(userSettings, projectRoot),
          blenderPath: blenderPathInput,
          unityPath: unityPathInput,
          pureRefPath: pureRefPathInput
        });
        setProjectPathInput(projectRoot);
      }

      setProject(nextProject);
      setSelectedAssetId(nextProject.assets[0]?.id ?? "");
      setActiveView("dashboard");
      setRole(loadStoredRole() ?? defaultRoleFromProject(nextProject.project));
      setOperationMessage({
        tone: "success",
        title: "Projet test ouvert",
        detail: nextProject.projectRoot ?? "Snapshot local"
      });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Projet test indisponible",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoadingProject(false);
    }
  };

  const createProjectFromWelcome = async () => {
    const trimmedName = createProjectName.trim();
    const trimmedRoot = createProjectRoot.trim();

    if (!trimmedName || !trimmedRoot) {
      setOperationMessage({
        tone: "error",
        title: "Projet non cree",
        detail: "Renseigne un nom et un dossier racine."
      });
      return;
    }

    setIsCreatingProject(true);

    try {
      const result = await createProject({
        projectName: trimmedName,
        projectRoot: trimmedRoot,
        createUnityFolders,
        createGitignore
      });
      const wasOpened = await openProject(result.projectRoot);

      if (wasOpened) {
        setCreateProjectName("");
        setCreateProjectRoot("");
        setIsCreateProjectOpen(false);
        setOperationMessage({
          tone: "success",
          title: "Projet cree",
          detail: result.message
        });
      }
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Projet non cree",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsCreatingProject(false);
    }
  };

  const saveLocalSettings = async () => {
    const savedSettings = await persistUserSettings({
      ...userSettings,
      blenderPath: blenderPathInput,
      unityPath: unityPathInput,
      pureRefPath: pureRefPathInput
    });

    setOperationMessage({
      tone: "success",
      title: "Settings enregistres",
      detail: savedSettings.lastProjectRoot ?? "Aucun projet par defaut"
    });
  };

  const forgetLastProject = async () => {
    await persistUserSettings({
      ...userSettings,
      lastProjectRoot: null
    });
    setProject(null);
    setProjectPathInput("");
    setSelectedAssetId("");
    setActiveView("dashboard");
    setOperationMessage({
      tone: "info",
      title: "Projet ferme",
      detail: "BlendUp affichera l'accueil au prochain demarrage."
    });
  };

  const openAsset = (assetId?: string) => {
    if (assetId) {
      setSelectedAssetId(assetId);
    }

    setActiveView("assets");
  };

  const handleExportAsset = async (assetId: string) => {
    if (!capabilities.canExport) {
      setOperationMessage({
        tone: "info",
        title: "Export reserve a la vue Artiste",
        detail: "Bascule en vue Artiste pour exporter cet asset en FBX."
      });
      return;
    }

    if (!project?.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Export impossible",
        detail: "Le projet courant n'a pas de dossier source charge par Tauri."
      });
      return;
    }

    setExportingAssetId(assetId);
    setOperationMessage({
      tone: "info",
      title: "Export FBX en cours",
      detail: "BlendUp lance Blender en arriere-plan."
    });

    try {
      const result = await exportAssetToFbx({
        assetId,
        blenderPath: blenderPathInput,
        projectRoot: project.projectRoot
      });
      const refreshedProject = await loadProjectSnapshot(project.projectRoot);

      setProject(refreshedProject);
      setSelectedAssetId(assetId);
      setProjectPathInput(refreshedProject.projectRoot ?? project.projectRoot);
      setOperationMessage({
        tone: result.success ? "success" : "error",
        title: result.message,
        detail: result.outputPath ?? result.log
      });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Export impossible",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setExportingAssetId(null);
    }
  };

  const filteredAssets = useMemo(() => {
    if (!project) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return project.assets;
    }

    return project.assets.filter((asset) => {
      const searchable = [
        asset.displayName,
        asset.type,
        asset.status,
        asset.paths.blenderSource,
        asset.paths.fbxExport,
        asset.paths.unityPrefab,
        asset.tags.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [project, query]);

  const selectedProblems =
    project?.problems.filter((problem) => !problem.assetId || problem.assetId === selectedAsset?.id) ?? [];

  if (!project) {
    return (
      <main className="welcome-shell">
        <WelcomePage
          createGitignore={createGitignore}
          createProjectName={createProjectName}
          createProjectRoot={createProjectRoot}
          createUnityFolders={createUnityFolders}
          isCreateProjectOpen={isCreateProjectOpen}
          isCreatingProject={isCreatingProject}
          isLoadingProject={isLoadingProject}
          onCreateProject={createProjectFromWelcome}
          onOpenDefaultProject={openDefaultProject}
          onOpenProject={openProject}
          onSelectCreateProjectDirectory={chooseCreateProjectDirectory}
          onSelectProjectDirectory={chooseProjectDirectory}
          onToggleCreateProject={() => setIsCreateProjectOpen((current) => !current)}
          projectPathInput={projectPathInput}
          recentProjects={userSettings.recentProjects}
          setCreateGitignore={setCreateGitignore}
          setCreateProjectName={setCreateProjectName}
          setCreateProjectRoot={setCreateProjectRoot}
          setCreateUnityFolders={setCreateUnityFolders}
          setProjectPathInput={setProjectPathInput}
        />
        {operationMessage ? (
          <OperationBanner message={operationMessage} onClose={() => setOperationMessage(null)} />
        ) : null}
      </main>
    );
  }

  return (
    <main className={`app-shell role-${role}`} style={shellStyle}>
      <aside className="sidebar" aria-label="Navigation principale">
        <button className="brand brand-button" onClick={() => setActiveView("dashboard")} type="button">
          <div className="brand-mark">BU</div>
          <div>
            <strong>BlendUp</strong>
            <span>{project.project.name}</span>
          </div>
        </button>

        <div className="role-switch">
          <span className="eyebrow">Vue</span>
          <SegmentedControl
            ariaLabel="Choisir la vue"
            options={roleFilters}
            value={role}
            onChange={setRole}
          />
        </div>

        <nav className="nav-list">
          <button
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveView("dashboard")}
            type="button"
          >
            <Home size={18} />
            Dashboard
          </button>
          <button
            className={`nav-item ${activeView === "assets" ? "active" : ""}`}
            onClick={() => setActiveView("assets")}
            type="button"
          >
            <Boxes size={18} />
            Assets
          </button>
          <button
            className={`nav-item ${activeView === "problems" ? "active" : ""}`}
            onClick={() => setActiveView("problems")}
            type="button"
          >
            <AlertTriangle size={18} />
            Problems
            {project.problems.length > 0 ? <span className="nav-badge">{project.problems.length}</span> : null}
          </button>
          <button
            className={`nav-item ${activeView === "tasks" ? "active" : ""}`}
            onClick={() => setActiveView("tasks")}
            type="button"
          >
            <ClipboardList size={18} />
            Tasks
            {project.tasks.length > 0 ? <span className="nav-badge neutral">{project.tasks.length}</span> : null}
          </button>
          <button className="nav-item" type="button">
            <Layers3 size={18} />
            References
          </button>
          <button
            className={`nav-item ${activeView === "git" ? "active" : ""}`}
            onClick={() => setActiveView("git")}
            type="button"
          >
            <GitBranch size={18} />
            Git
          </button>
          <button
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            onClick={() => setActiveView("settings")}
            type="button"
          >
            <Settings size={18} />
            Settings
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Vue {roleLabel(role)}</span>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-meta">
            <span title={project.projectRoot}>{project.projectRoot ?? "Snapshot local"}</span>
            <span>Blender {project.project.targets.blenderMinimumVersion}+</span>
            <span>Unity {project.project.targets.unityTestVersion ?? project.project.targets.unityMinimumVersion}</span>
          </div>
        </header>

        {operationMessage ? (
          <OperationBanner message={operationMessage} onClose={() => setOperationMessage(null)} />
        ) : null}

        {activeView === "dashboard" ? (
          <DashboardView
            onOpenAsset={openAsset}
            onOpenProblems={() => setActiveView("problems")}
            onOpenSettings={() => setActiveView("settings")}
            onOpenTasks={() => setActiveView("tasks")}
            snapshot={project}
            toolsSnapshot={toolsSnapshot}
          />
        ) : activeView === "assets" ? (
          <AssetsView
            capabilities={capabilities}
            exportingAssetId={exportingAssetId}
            filteredAssets={filteredAssets}
            onExportAsset={handleExportAsset}
            problems={project.problems}
            query={query}
            role={role}
            selectedAsset={selectedAsset}
            selectedProblems={selectedProblems}
            setQuery={setQuery}
            setSelectedAssetId={setSelectedAssetId}
          />
        ) : activeView === "problems" ? (
          <ProblemsView
            exportAllowed={capabilities.canExport}
            exportingAssetId={exportingAssetId}
            onExportAsset={handleExportAsset}
            onOpenAsset={openAsset}
            snapshot={project}
          />
        ) : activeView === "tasks" ? (
          <TasksView onOpenAsset={openAsset} snapshot={project} />
        ) : activeView === "settings" ? (
          <SettingsView
            blenderPathInput={blenderPathInput}
            isDetectingTools={isDetectingTools}
            isLoadingProject={isLoadingProject}
            onDetectTools={() => refreshToolDetection(false)}
            onForgetLastProject={forgetLastProject}
            onOpenDefaultProject={openDefaultProject}
            onOpenProject={openProject}
            onSaveSettings={saveLocalSettings}
            onSelectProjectDirectory={chooseProjectDirectory}
            project={project}
            projectPathInput={projectPathInput}
            pureRefPathInput={pureRefPathInput}
            recentProjects={userSettings.recentProjects}
            setBlenderPathInput={setBlenderPathInput}
            setProjectPathInput={setProjectPathInput}
            setPureRefPathInput={setPureRefPathInput}
            setUnityPathInput={setUnityPathInput}
            toolsSnapshot={toolsSnapshot}
            unityPathInput={unityPathInput}
          />
        ) : (
          <GitView snapshot={project} />
        )}
      </section>
    </main>
  );
}

function OperationBanner({
  message,
  onClose
}: {
  message: OperationMessage;
  onClose: () => void;
}) {
  return (
    <div className={`operation-banner ${message.tone}`}>
      <strong>{message.title}</strong>
      {message.detail ? <span>{message.detail}</span> : null}
      <button onClick={onClose} type="button">
        Fermer
      </button>
    </div>
  );
}

function WelcomePage({
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

function DashboardView({
  onOpenAsset,
  onOpenProblems,
  onOpenSettings,
  onOpenTasks,
  snapshot,
  toolsSnapshot
}: {
  onOpenAsset: (assetId?: string) => void;
  onOpenProblems: () => void;
  onOpenSettings: () => void;
  onOpenTasks: () => void;
  snapshot: ProjectSnapshot;
  toolsSnapshot: LocalToolsSnapshot | null;
}) {
  const firstProblem = snapshot.problems[0];
  const firstTask = snapshot.tasks.find((task) => task.status !== "done") ?? snapshot.tasks[0];
  const exportedAssets = snapshot.assets.filter((asset) => asset.export.lastExportStatus === "success").length;
  const importedAssets = snapshot.assets.filter((asset) => asset.unity.importStatus === "imported").length;

  return (
    <section className="dashboard-page" aria-label="Dashboard">
      <div className="dashboard-summary">
        <DashboardCard label="Assets" value={String(snapshot.assets.length)} detail={`${exportedAssets} exporte(s)`} />
        <DashboardCard label="Problems" value={String(snapshot.problems.length)} detail={problemSummary(snapshot)} />
        <DashboardCard label="Tasks" value={String(snapshot.tasks.length)} detail={taskSummary(snapshot)} />
        <DashboardCard label="Unity" value={String(importedAssets)} detail="prefab(s) importe(s)" />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="settings-heading">
            <span className="eyebrow">A traiter</span>
            <h2>{firstProblem?.title ?? "Aucun probleme"}</h2>
          </div>
          <p>{firstProblem?.detail ?? "Le projet ne remonte pas de probleme avec les validations actuelles."}</p>
          <div className="settings-actions">
            <button onClick={onOpenProblems} type="button">
              <AlertTriangle size={16} />
              Problems
            </button>
            {firstProblem?.assetId ? (
              <button className="secondary" onClick={() => onOpenAsset(firstProblem.assetId)} type="button">
                Voir l'asset
              </button>
            ) : null}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="settings-heading">
            <span className="eyebrow">Prochaine tache</span>
            <h2>{firstTask?.title ?? "Aucune tache"}</h2>
          </div>
          <p>{firstTask?.description ?? "Les taches internes apparaitront ici quand elles seront creees."}</p>
          <div className="settings-actions">
            <button onClick={onOpenTasks} type="button">
              <ClipboardList size={16} />
              Tasks
            </button>
          </div>
        </section>

        <section className="dashboard-panel wide">
          <div className="settings-heading">
            <span className="eyebrow">Outils locaux</span>
            <h2>Disponibilite</h2>
          </div>
          <div className="tool-status-grid">
            <ToolStatus label="Blender" status={toolsSnapshot?.blender} />
            <ToolStatus label="Unity" status={toolsSnapshot?.unity} />
            <ToolStatus label="PureRef" status={toolsSnapshot?.pureRef} />
          </div>
          <div className="settings-actions">
            <button className="secondary" onClick={onOpenSettings} type="button">
              <Settings size={16} />
              Settings
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function DashboardCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ToolStatus({ label, status }: { label: string; status?: LocalToolsSnapshot["blender"] }) {
  const isFound = Boolean(status?.found);

  return (
    <div className={`tool-status ${isFound ? "ok" : "missing"}`}>
      {isFound ? <CheckCircle2 size={16} /> : <Wrench size={16} />}
      <div>
        <strong>{label}</strong>
        <span title={status?.message}>{status?.path ?? status?.message ?? "Detection en attente"}</span>
      </div>
    </div>
  );
}

function SettingsView({
  blenderPathInput,
  isDetectingTools,
  isLoadingProject,
  onDetectTools,
  onForgetLastProject,
  onOpenDefaultProject,
  onOpenProject,
  onSaveSettings,
  onSelectProjectDirectory,
  project,
  projectPathInput,
  pureRefPathInput,
  recentProjects,
  setBlenderPathInput,
  setProjectPathInput,
  setPureRefPathInput,
  setUnityPathInput,
  toolsSnapshot,
  unityPathInput
}: {
  blenderPathInput: string;
  isDetectingTools: boolean;
  isLoadingProject: boolean;
  onDetectTools: () => void;
  onForgetLastProject: () => void;
  onOpenDefaultProject: () => void;
  onOpenProject: (projectRoot: string) => Promise<boolean>;
  onSaveSettings: () => void;
  onSelectProjectDirectory: () => void;
  project: ProjectSnapshot;
  projectPathInput: string;
  pureRefPathInput: string;
  recentProjects: string[];
  setBlenderPathInput: (blenderPath: string) => void;
  setProjectPathInput: (projectRoot: string) => void;
  setPureRefPathInput: (pureRefPath: string) => void;
  setUnityPathInput: (unityPath: string) => void;
  toolsSnapshot: LocalToolsSnapshot | null;
  unityPathInput: string;
}) {
  return (
    <section className="settings-page" aria-label="Settings">
      <div className="settings-layout">
        <section className="settings-panel">
          <div className="settings-heading">
            <span className="eyebrow">Projet ouvert</span>
            <h2>{project.project.name}</h2>
          </div>

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onOpenProject(projectPathInput);
            }}
          >
            <label className="settings-field">
              <span>Dossier projet</span>
              <input onChange={(event) => setProjectPathInput(event.target.value)} value={projectPathInput} />
            </label>

            <div className="settings-actions">
              <button disabled={isLoadingProject} onClick={onSelectProjectDirectory} type="button">
                <FolderOpen size={16} />
                {isLoadingProject ? "Ouverture" : "Choisir"}
              </button>
              <button className="secondary" disabled={isLoadingProject} type="submit">
                Ouvrir ce chemin
              </button>
              <button className="secondary" onClick={onOpenDefaultProject} type="button">
                <RotateCcw size={16} />
                Projet test
              </button>
              <button className="secondary danger" onClick={onForgetLastProject} type="button">
                Fermer
              </button>
            </div>
          </form>
        </section>

        <section className="settings-panel">
          <div className="settings-heading">
            <span className="eyebrow">Machine</span>
            <h2>Chemins locaux</h2>
          </div>

          <div className="settings-form">
            <label className="settings-field">
              <span>Blender</span>
              <input
                onChange={(event) => setBlenderPathInput(event.target.value)}
                placeholder="Auto ou chemin blender.exe"
                value={blenderPathInput}
              />
            </label>
            <ToolStatus label="Blender" status={toolsSnapshot?.blender} />
            <label className="settings-field">
              <span>Unity</span>
              <input
                onChange={(event) => setUnityPathInput(event.target.value)}
                placeholder="Chemin Unity Editor"
                value={unityPathInput}
              />
            </label>
            <ToolStatus label="Unity" status={toolsSnapshot?.unity} />
            <label className="settings-field">
              <span>PureRef</span>
              <input
                onChange={(event) => setPureRefPathInput(event.target.value)}
                placeholder="Chemin PureRef"
                value={pureRefPathInput}
              />
            </label>
            <ToolStatus label="PureRef" status={toolsSnapshot?.pureRef} />

            <div className="settings-actions">
              <button className="secondary" disabled={isDetectingTools} onClick={onDetectTools} type="button">
                <Wrench size={16} />
                {isDetectingTools ? "Detection" : "Detecter"}
              </button>
              <button onClick={onSaveSettings} type="button">
                <Save size={16} />
                Enregistrer
              </button>
            </div>
          </div>
        </section>

        <section className="settings-panel wide">
          <div className="settings-heading">
            <span className="eyebrow">Historique</span>
            <h2>Projets recents</h2>
          </div>

          <div className="recent-projects inline">
            {recentProjects.length > 0 ? (
              recentProjects.map((projectRoot) => (
                <button key={projectRoot} onClick={() => void onOpenProject(projectRoot)} type="button">
                  <FolderOpen size={16} />
                  <span>{projectRoot}</span>
                </button>
              ))
            ) : (
              <div className="empty-state compact">
                <FileSearch size={28} />
                <span>Aucun projet recent</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

interface AssetsViewProps {
  capabilities: RoleCapabilities;
  exportingAssetId: string | null;
  filteredAssets: BlendUpAsset[];
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
  query: string;
  role: Role;
  selectedAsset?: BlendUpAsset;
  selectedProblems: BlendUpProblem[];
  setQuery: (query: string) => void;
  setSelectedAssetId: (assetId: string) => void;
}

function AssetsView({
  capabilities,
  exportingAssetId,
  filteredAssets,
  onExportAsset,
  problems,
  query,
  role,
  selectedAsset,
  selectedProblems,
  setQuery,
  setSelectedAssetId
}: AssetsViewProps) {
  return (
    <section className="content-grid">
      <section className="asset-panel" aria-label="Liste des assets">
        <div className="panel-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher"
              type="search"
            />
          </label>
          <span className="count-chip">{filteredAssets.length} assets</span>
        </div>

        <div className="asset-list">
          {filteredAssets.map((asset) => (
            <AssetRow
              asset={asset}
              isSelected={asset.id === selectedAsset?.id}
              key={asset.id}
              onSelect={() => setSelectedAssetId(asset.id)}
              problemCount={problems.filter((problem) => problem.assetId === asset.id).length}
            />
          ))}
        </div>
      </section>

      {selectedAsset ? (
        role === "developer" ? (
          <DevAssetDetail
            asset={selectedAsset}
            capabilities={capabilities}
            isExporting={exportingAssetId === selectedAsset.id}
            onExportAsset={onExportAsset}
            problems={selectedProblems}
          />
        ) : (
          <ArtistAssetDetail
            asset={selectedAsset}
            capabilities={capabilities}
            isExporting={exportingAssetId === selectedAsset.id}
            onExportAsset={onExportAsset}
            problems={selectedProblems}
          />
        )
      ) : (
        <section className="detail-panel empty-state">
          <FileSearch size={32} />
          <span>Aucun asset selectionne</span>
        </section>
      )}
    </section>
  );
}

interface TasksViewProps {
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}

function TasksView({ onOpenAsset, snapshot }: TasksViewProps) {
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(snapshot.tasks[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>("all");

  const assetsById = useMemo(() => {
    return new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  }, [snapshot.assets]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = taskQuery.trim().toLowerCase();

    return snapshot.tasks.filter((task) => {
      const linkedAssetNames = task.assetIds
        .map((assetId) => assetsById.get(assetId)?.displayName)
        .filter(Boolean)
        .join(" ");
      const searchable = [
        task.title,
        task.description,
        task.status,
        task.priority,
        task.owner,
        linkedAssetNames
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

      return matchesStatus && matchesPriority && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [assetsById, priorityFilter, snapshot.tasks, statusFilter, taskQuery]);

  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0];

  return (
    <section className="tasks-page" aria-label="Tasks">
      <div className="task-summary-grid">
        <TaskSummaryCard label="A faire" status="todo" tasks={snapshot.tasks} />
        <TaskSummaryCard label="En cours" status="in_progress" tasks={snapshot.tasks} />
        <TaskSummaryCard label="Review" status="review" tasks={snapshot.tasks} />
        <TaskSummaryCard label="Bloque" status="blocked" tasks={snapshot.tasks} />
      </div>

      <div className="problem-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={taskQuery}
            onChange={(event) => setTaskQuery(event.target.value)}
            placeholder="Rechercher une tache"
            type="search"
          />
        </label>

        <SegmentedControl
          ariaLabel="Filtrer par statut"
          options={taskStatusFilters}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        <SegmentedControl
          ariaLabel="Filtrer par priorite"
          options={taskPriorityFilters}
          value={priorityFilter}
          onChange={setPriorityFilter}
        />
      </div>

      <div className="task-layout">
        <section className="task-list" aria-label="Liste des taches">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <button
                className={`task-row ${task.priority} ${task.id === selectedTask?.id ? "selected" : ""}`}
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                type="button"
              >
                <div className="task-row-main">
                  <strong>{task.title}</strong>
                  <span>
                    {formatTaskStatus(task.status)} - {formatTaskPriority(task.priority)}
                  </span>
                </div>
                <span className="task-asset-count">{task.assetIds.length}</span>
              </button>
            ))
          ) : (
            <div className="empty-state compact">
              <CheckCircle2 size={28} />
              <span>Aucune tache avec ces filtres</span>
            </div>
          )}
        </section>

        <TaskDetail assetsById={assetsById} onOpenAsset={onOpenAsset} task={selectedTask} />
      </div>
    </section>
  );
}

function TaskSummaryCard({
  label,
  status,
  tasks
}: {
  label: string;
  status: TaskStatus;
  tasks: BlendUpTask[];
}) {
  const count = tasks.filter((task) => task.status === status).length;

  return (
    <div className={`task-summary-card ${status}`}>
      <ClipboardList size={17} />
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function TaskDetail({
  assetsById,
  onOpenAsset,
  task
}: {
  assetsById: Map<string, BlendUpAsset>;
  onOpenAsset: (assetId?: string) => void;
  task?: BlendUpTask;
}) {
  if (!task) {
    return (
      <aside className="task-detail-panel empty-state">
        <ClipboardList size={32} />
        <span>Aucune tache a afficher</span>
      </aside>
    );
  }

  return (
    <aside className="task-detail-panel" aria-label="Detail tache">
      <div className="task-detail-heading">
        <span className={`task-priority-dot ${task.priority}`} />
        <div>
          <span className="eyebrow">{formatTaskStatus(task.status)}</span>
          <h2>{task.title}</h2>
        </div>
      </div>

      <p>{task.description}</p>

      <div className="problem-detail-meta">
        <DetailMeta label="Priorite" value={formatTaskPriority(task.priority)} />
        <DetailMeta label="Owner" value={task.owner ?? "Non assigne"} />
        <DetailMeta label="Assets" value={String(task.assetIds.length)} />
        <DetailMeta label="MAJ" value={task.updatedAt} />
      </div>

      <div className="linked-asset-list">
        {task.assetIds.map((assetId) => {
          const asset = assetsById.get(assetId);

          return (
            <button
              disabled={!asset}
              key={assetId}
              onClick={() => onOpenAsset(assetId)}
              type="button"
            >
              <Boxes size={16} />
              <span>{asset?.displayName ?? assetId}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function GitView({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [gitQuery, setGitQuery] = useState("");
  const normalizedQuery = gitQuery.trim().toLowerCase();
  const filteredFiles = snapshot.gitStatus.files.filter((file) => {
    const searchable = `${file.status} ${file.path}`.toLowerCase();

    return !normalizedQuery || searchable.includes(normalizedQuery);
  });

  return (
    <section className="git-page" aria-label="Git">
      <div className="git-summary-grid">
        <div className="git-summary-card">
          <GitBranch size={18} />
          <span>Branche</span>
          <strong>{snapshot.gitStatus.branch ?? "Non detectee"}</strong>
        </div>
        <div className="git-summary-card">
          <FileSearch size={18} />
          <span>Etat</span>
          <strong>{snapshot.gitStatus.available ? "Disponible" : "Indisponible"}</strong>
        </div>
        <div className="git-summary-card">
          <CircleDot size={18} />
          <span>Changements</span>
          <strong>{snapshot.gitStatus.files.length}</strong>
        </div>
      </div>

      <div className="git-message">
        <strong>{snapshot.gitStatus.message}</strong>
        <span>Lecture seule pour la V1 actuelle.</span>
      </div>

      <div className="panel-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={gitQuery}
            onChange={(event) => setGitQuery(event.target.value)}
            placeholder="Filtrer les fichiers"
            type="search"
          />
        </label>
        <span className="count-chip">{filteredFiles.length} fichiers</span>
      </div>

      <section className="git-file-list" aria-label="Fichiers Git">
        {filteredFiles.length > 0 ? (
          filteredFiles.map((file) => (
            <div className="git-file-row" key={`${file.status}-${file.path}`}>
              <span>{file.status || "?"}</span>
              <code>{file.path}</code>
            </div>
          ))
        ) : (
          <div className="empty-state compact">
            <CheckCircle2 size={28} />
            <span>Aucun fichier a afficher</span>
          </div>
        )}
      </section>
    </section>
  );
}

interface ProblemsViewProps {
  exportAllowed: boolean;
  exportingAssetId: string | null;
  onExportAsset: (assetId: string) => void;
  onOpenAsset: (assetId?: string) => void;
  snapshot: ProjectSnapshot;
}

function ProblemsView({
  exportAllowed,
  exportingAssetId,
  onExportAsset,
  onOpenAsset,
  snapshot
}: ProblemsViewProps) {
  const [problemQuery, setProblemQuery] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState(snapshot.problems[0]?.id ?? "");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const assetsById = useMemo(() => {
    return new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  }, [snapshot.assets]);

  const filteredProblems = useMemo(() => {
    const normalizedQuery = problemQuery.trim().toLowerCase();

    return snapshot.problems.filter((problem) => {
      const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;
      const matchesSeverity = severityFilter === "all" || problem.severity === severityFilter;
      const matchesSource = sourceFilter === "all" || problem.source === sourceFilter;
      const searchable = [
        problem.title,
        problem.detail,
        problem.severity,
        problem.source,
        asset?.displayName,
        asset?.type,
        asset?.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesSeverity && matchesSource && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [assetsById, problemQuery, severityFilter, snapshot.problems, sourceFilter]);

  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ?? filteredProblems[0];
  const selectedAsset = selectedProblem?.assetId ? assetsById.get(selectedProblem.assetId) : undefined;

  return (
    <section className="problems-page" aria-label="Problems">
      <div className="problem-summary-grid">
        <ProblemSummaryCard label="Critiques" severity="critical" snapshot={snapshot} />
        <ProblemSummaryCard label="Erreurs" severity="error" snapshot={snapshot} />
        <ProblemSummaryCard label="Warnings" severity="warning" snapshot={snapshot} />
        <ProblemSummaryCard label="Infos" severity="info" snapshot={snapshot} />
      </div>

      <div className="problem-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={problemQuery}
            onChange={(event) => setProblemQuery(event.target.value)}
            placeholder="Rechercher un probleme"
            type="search"
          />
        </label>

        <SegmentedControl
          ariaLabel="Filtrer par severite"
          options={severityFilters}
          value={severityFilter}
          onChange={setSeverityFilter}
        />

        <SegmentedControl
          ariaLabel="Filtrer par source"
          options={sourceFilters}
          value={sourceFilter}
          onChange={setSourceFilter}
        />
      </div>

      <div className="problem-layout">
        <section className="problem-table" aria-label="Liste des problems">
          {filteredProblems.length > 0 ? (
            filteredProblems.map((problem) => {
              const asset = problem.assetId ? assetsById.get(problem.assetId) : undefined;

              return (
                <button
                  className={`problem-table-row ${problem.severity} ${
                    problem.id === selectedProblem?.id ? "selected" : ""
                  }`}
                  key={problem.id}
                  onClick={() => setSelectedProblemId(problem.id)}
                  type="button"
                >
                  <span className={`severity-dot ${problem.severity}`} />
                  <div className="problem-row-main">
                    <strong>{problem.title}</strong>
                    <span>{asset?.displayName ?? "Projet"}</span>
                  </div>
                  <span className="problem-source">{sourceLabel(problem.source)}</span>
                </button>
              );
            })
          ) : (
            <div className="empty-state compact">
              <CheckCircle2 size={28} />
              <span>Aucun probleme avec ces filtres</span>
            </div>
          )}
        </section>

        <ProblemDetail
          asset={selectedAsset}
          exportAllowed={exportAllowed}
          isExporting={selectedAsset?.id === exportingAssetId}
          onExportAsset={onExportAsset}
          onOpenAsset={onOpenAsset}
          problem={selectedProblem}
        />
      </div>
    </section>
  );
}

interface ProblemSummaryCardProps {
  label: string;
  severity: BlendUpProblem["severity"];
  snapshot: ProjectSnapshot;
}

function ProblemSummaryCard({ label, severity, snapshot }: ProblemSummaryCardProps) {
  const count = snapshot.problems.filter((problem) => problem.severity === severity).length;

  return (
    <div className={`problem-summary-card ${severity}`}>
      <CircleDot size={17} />
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

interface SegmentedControlProps<TValue extends string> {
  ariaLabel: string;
  onChange: (value: TValue) => void;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
}

function SegmentedControl<TValue extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: SegmentedControlProps<TValue>) {
  return (
    <div className="segmented-control" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          className={option.value === value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ProblemDetailProps {
  asset?: BlendUpAsset;
  exportAllowed: boolean;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  onOpenAsset: (assetId?: string) => void;
  problem?: BlendUpProblem;
}

function ProblemDetail({
  asset,
  exportAllowed,
  isExporting,
  onExportAsset,
  onOpenAsset,
  problem
}: ProblemDetailProps) {
  if (!problem) {
    return (
      <aside className="problem-detail-panel empty-state">
        <CheckCircle2 size={32} />
        <span>Aucun probleme a afficher</span>
      </aside>
    );
  }

  return (
    <aside className="problem-detail-panel" aria-label="Detail problem">
      <div className="problem-detail-heading">
        <span className={`severity-dot ${problem.severity}`} />
        <div>
          <span className="eyebrow">{severityLabel(problem.severity)}</span>
          <h2>{problem.title}</h2>
        </div>
      </div>

      <p>{problem.detail}</p>

      <div className="problem-detail-meta">
        <DetailMeta label="Source" value={sourceLabel(problem.source)} />
        <DetailMeta label="Asset" value={asset?.displayName ?? "Projet"} />
        <DetailMeta label="Type" value={asset ? formatAssetType(asset.type) : "Global"} />
        <DetailMeta label="Statut" value={asset ? formatStatus(asset.status) : "Projet"} />
      </div>

      <div className="problem-detail-actions">
        {problem.actionLabel ? (
          <ProblemActionButton
            asset={asset}
            exportAllowed={exportAllowed}
            isExporting={isExporting}
            onExportAsset={onExportAsset}
            problem={problem}
          />
        ) : null}
        {asset ? (
          <button className="secondary" onClick={() => onOpenAsset(asset.id)} type="button">
            Voir l'asset
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface AssetRowProps {
  asset: BlendUpAsset;
  isSelected: boolean;
  onSelect: () => void;
  problemCount: number;
}

function AssetRow({ asset, isSelected, onSelect, problemCount }: AssetRowProps) {
  return (
    <button className={`asset-row ${isSelected ? "selected" : ""}`} onClick={onSelect} type="button">
      <div className="asset-thumbnail">
        <Boxes size={20} />
      </div>
      <div className="asset-row-main">
        <div className="asset-row-title">
          <strong>{asset.displayName}</strong>
          {problemCount > 0 ? <span className="mini-warning">{problemCount}</span> : null}
        </div>
        <div className="asset-row-subtitle">
          <span>{formatAssetType(asset.type)}</span>
          <span>{formatStatus(asset.status)}</span>
        </div>
      </div>
    </button>
  );
}

interface AssetDetailProps {
  asset: BlendUpAsset;
  capabilities: RoleCapabilities;
  isExporting: boolean;
  onExportAsset: (assetId: string) => void;
  problems: BlendUpProblem[];
}

function AssetProblems({
  asset,
  capabilities,
  isExporting,
  onExportAsset,
  problems
}: AssetDetailProps) {
  if (problems.length === 0) {
    return (
      <div className="empty-state compact">
        <CheckCircle2 size={24} />
        <span>Aucun probleme pour cet asset</span>
      </div>
    );
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
          {problem.actionLabel ? (
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

function ArtistAssetDetail({ asset, capabilities, isExporting, onExportAsset, problems }: AssetDetailProps) {
  const exported = asset.export.lastExportStatus === "success";

  return (
    <section className="detail-panel detail-panel--artist" aria-label="Detail asset (artiste)">
      <div className="detail-header">
        <div className="detail-thumbnail large">
          <Boxes size={34} />
        </div>
        <div>
          <span className="role-badge">{capabilities.orientationLabel}</span>
          <h2>{asset.displayName}</h2>
          <span className="eyebrow">{formatAssetType(asset.type)}</span>
        </div>
      </div>

      <div className="status-strip">
        <StatusPill label={formatStatus(asset.status)} tone="blue" />
        <StatusPill label={asset.productionMode} tone="neutral" />
        <StatusPill label={exported ? "Exporte" : "A exporter"} tone={exported ? "green" : "orange"} />
      </div>

      <div className="asset-action-bar">
        {capabilities.canExport ? (
          <button disabled={isExporting} onClick={() => onExportAsset(asset.id)} type="button">
            {isExporting ? "Export en cours" : "Exporter FBX"}
          </button>
        ) : null}
        <button className="secondary" disabled title="A venir" type="button">
          Ouvrir dans Blender
        </button>
      </div>

      <div className="detail-sections airy">
        <section className="section-block">
          <h3>Source</h3>
          <PathLine label="Fichier Blender" value={asset.paths.blenderSource} />
        </section>

        <section className="section-block">
          <h3>References</h3>
          <p className="soft-text">
            {asset.references.length > 0
              ? `${asset.references.length} reference(s) liee(s).`
              : "Aucune reference liee pour le moment."}
          </p>
        </section>

        <section className="section-block">
          <h3>Notes artiste</h3>
          <div className="notes-grid single">
            <div className="note-block primary">
              <p>{asset.notes.artist || "Aucune note artiste."}</p>
            </div>
          </div>
        </section>

        <section className="section-block">
          <h3>A corriger</h3>
          <AssetProblems
            asset={asset}
            capabilities={capabilities}
            isExporting={isExporting}
            onExportAsset={onExportAsset}
            problems={problems}
          />
        </section>
      </div>
    </section>
  );
}

function DevAssetDetail({ asset, capabilities, isExporting, onExportAsset, problems }: AssetDetailProps) {
  return (
    <section className="detail-panel detail-panel--dev" aria-label="Detail asset (dev)">
      <div className="detail-header compact">
        <div className="detail-thumbnail small">
          <Boxes size={22} />
        </div>
        <div>
          <span className="role-badge">{capabilities.orientationLabel}</span>
          <h2>{asset.displayName}</h2>
          <span className="eyebrow">
            {formatAssetType(asset.type)} - {asset.id}
          </span>
        </div>
      </div>

      <div className="status-strip">
        <StatusPill label={formatStatus(asset.status)} tone="blue" />
        <StatusPill label={asset.productionMode} tone="neutral" />
        <StatusPill label={asset.export.autoExport ? "Auto-export" : "Manual"} tone="green" />
        <StatusPill label={`Export: ${formatExportStatus(asset.export.lastExportStatus)}`} tone="neutral" />
        <StatusPill label={asset.unity.importStatus.replace("_", " ")} tone="orange" />
      </div>

      <div className="asset-action-bar wrap">
        {capabilities.canExport ? (
          <button disabled={isExporting} onClick={() => onExportAsset(asset.id)} type="button">
            Exporter FBX
          </button>
        ) : (
          <span className="action-hint">Export en vue Artiste</span>
        )}
        {capabilities.canRebuildPrefab ? (
          <button className="secondary" disabled title="A venir" type="button">
            Rebuild prefab
          </button>
        ) : null}
        {capabilities.canEditExpectedComponents ? (
          <button className="secondary" disabled title="A venir" type="button">
            Definir composants
          </button>
        ) : null}
        <button className="secondary" disabled title="A venir" type="button">
          Besoin correction art
        </button>
        <button className="secondary" disabled title="A venir" type="button">
          Ouvrir dans Unity
        </button>
      </div>

      <div className="detail-sections">
        <section className="section-block">
          <h3>Unity</h3>
          <div className="problem-detail-meta">
            <DetailMeta label="Import" value={asset.unity.importStatus.replace("_", " ")} />
            <DetailMeta label="Dernier import" value={asset.unity.lastImportAt ?? "Jamais"} />
          </div>
          <PathLine label="Prefab" value={asset.paths.unityPrefab} />

          <span className="eyebrow subhead">Composants attendus</span>
          <div className="component-list">
            {asset.unity.expectedComponents.length > 0 ? (
              asset.unity.expectedComponents.map((component) => (
                <div className="component-row" key={component.name}>
                  <CheckCircle2 size={16} />
                  <span>{component.name}</span>
                  <small>
                    {component.requirement}
                    {component.confirmedRemoved ? " - retire confirme" : ""}
                  </small>
                </div>
              ))
            ) : (
              <p className="soft-text">Aucun composant attendu defini.</p>
            )}
          </div>

          <span className="eyebrow subhead">Composants presents</span>
          {asset.unity.components.length > 0 ? (
            <div className="chip-row">
              {asset.unity.components.map((component) => (
                <span className="status-pill neutral" key={component}>
                  {component}
                </span>
              ))}
            </div>
          ) : (
            <p className="soft-text">Aucun composant remonte par Unity.</p>
          )}

          {asset.unity.warnings.length > 0 ? (
            <>
              <span className="eyebrow subhead">Warnings Unity</span>
              <div className="problem-list">
                {asset.unity.warnings.map((warning) => (
                  <div className="problem-row warning" key={warning}>
                    <AlertTriangle size={16} />
                    <div>
                      <span>{warning}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {capabilities.showRawPaths ? (
          <section className="section-block">
            <h3>Fichiers</h3>
            <PathLine label="Blender" value={asset.paths.blenderSource} />
            <PathLine label="FBX" value={asset.paths.fbxExport} />
            <PathLine label="Prefab" value={asset.paths.unityPrefab} />
            <PathLine label="Thumbnail" value={asset.paths.thumbnail} />
          </section>
        ) : null}

        {capabilities.showExportDetails ? (
          <section className="section-block">
            <h3>Export</h3>
            <div className="problem-detail-meta">
              <DetailMeta label="Profil" value={asset.export.profileId ?? "Aucun"} />
              <DetailMeta label="Auto-export" value={asset.export.autoExport ? "Oui" : "Non"} />
              <DetailMeta label="Import Unity" value={asset.export.importInUnity ? "Oui" : "Non"} />
              <DetailMeta label="Dernier export" value={asset.export.lastExportAt ?? "Jamais"} />
              <DetailMeta label="Statut" value={formatExportStatus(asset.export.lastExportStatus)} />
            </div>
          </section>
        ) : null}

        {capabilities.showAllOwners ? (
          <section className="section-block">
            <h3>Equipe</h3>
            <div className="owner-grid">
              <Owner label="Artiste" value={asset.owners.artist} />
              <Owner label="Dev" value={asset.owners.developer} />
              <Owner label="Review" value={asset.owners.reviewer} />
            </div>
          </section>
        ) : null}

        <section className="section-block">
          <h3>Notes</h3>
          <div className="notes-grid">
            <div className="note-block primary">
              <span className="eyebrow">Notes dev</span>
              <p>{asset.notes.developer || "Aucune note dev."}</p>
            </div>
            <div className="note-block">
              <span className="eyebrow">Notes artiste</span>
              <p>{asset.notes.artist || "Aucune note artiste."}</p>
            </div>
          </div>
        </section>

        <section className="section-block">
          <h3>Problems</h3>
          <AssetProblems
            asset={asset}
            capabilities={capabilities}
            isExporting={isExporting}
            onExportAsset={onExportAsset}
            problems={problems}
          />
        </section>
      </div>
    </section>
  );
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
      title={
        isExportAction && !exportAllowed
          ? "Export disponible en vue Artiste"
          : canExport
            ? "Exporter l'asset en FBX"
            : "Action pas encore disponible"
      }
      type="button"
    >
      {isExporting && canExport ? "Export" : problem.actionLabel}
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" | "neutral" | "orange" }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function PathLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="path-line">
      <span>{label}</span>
      <code>{value ?? "Non defini"}</code>
    </div>
  );
}

function Owner({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="owner-card">
      <UserRound size={16} />
      <span>{label}</span>
      <strong>{value ?? "Non assigne"}</strong>
    </div>
  );
}

function sourceLabel(source: BlendUpProblem["source"]): string {
  const labels: Record<BlendUpProblem["source"], string> = {
    blendup: "BlendUp",
    blender: "Blender",
    unity: "Unity",
    git: "Git"
  };

  return labels[source];
}

function problemSummary(snapshot: ProjectSnapshot): string {
  const blockingProblems = snapshot.problems.filter(
    (problem) => problem.severity === "critical" || problem.severity === "error"
  ).length;

  return blockingProblems > 0 ? `${blockingProblems} bloquant(s)` : "Rien de bloquant";
}

function taskSummary(snapshot: ProjectSnapshot): string {
  const openTasks = snapshot.tasks.filter((task) => task.status !== "done").length;

  return openTasks > 0 ? `${openTasks} ouverte(s)` : "Tout est ferme";
}

function viewTitle(view: ActiveView): string {
  const labels: Record<ActiveView, string> = {
    assets: "Assets",
    dashboard: "Dashboard",
    git: "Git",
    problems: "Problems",
    settings: "Settings",
    tasks: "Tasks"
  };

  return labels[view];
}

export default App;
