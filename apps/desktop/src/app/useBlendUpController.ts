import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Role } from "../blendup/roles";
import {
  capabilitiesFor,
  defaultRoleFromProject,
  loadStoredRole,
  storeRole
} from "../blendup/roles";
import type { LocalToolsSnapshot, ProjectSnapshot, UserSettings } from "../blendup/types";
import { exportAssetToFbx } from "../blendup/actions";
import {
  createProject,
  detectLocalTools,
  loadDefaultProjectSnapshot,
  loadProjectSnapshot,
  loadUserSettings,
  openProjectPath,
  rememberProjectInSettings,
  saveUserSettings,
  selectProjectDirectory,
  takeOpenRequest
} from "../blendup/projectLoader";
import type { ActiveView, OperationMessage } from "./types";

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

export function useBlendUpController() {
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
  const [project, setProject] = useState<ProjectSnapshot | null>(initialProject);
  const [projectPathInput, setProjectPathInput] = useState(
    initialProject?.projectRoot ?? initialUserSettings.lastProjectRoot ?? ""
  );
  const [pureRefPathInput, setPureRefPathInput] = useState(initialUserSettings.pureRefPath ?? "");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role>(initialRole);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [toolsSnapshot, setToolsSnapshot] = useState<LocalToolsSnapshot | null>(null);
  const [unityPathInput, setUnityPathInput] = useState(initialUserSettings.unityPath ?? "");
  const [userSettings, setUserSettings] = useState<UserSettings>(initialUserSettings);

  const capabilities = capabilitiesFor(role);
  const shellStyle = { "--role-accent": capabilities.accent } as CSSProperties;
  const selectedAsset = project
    ? project.assets.find((asset) => asset.id === selectedAssetId)
    : undefined;
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

  useEffect(() => {
    storeRole(role);
  }, [role]);

  useEffect(() => {
    void refreshToolDetection(true);
    // Run once on startup to detect tools without overriding saved paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const projectRoot = project?.projectRoot;

    if (!projectRoot) {
      return;
    }

    let cancelled = false;

    const intervalId = window.setInterval(async () => {
      const request = await takeOpenRequest(projectRoot);

      if (cancelled || !request) {
        return;
      }

      const asset = project?.assets.find((item) => item.id === request.assetId);

      if (!asset) {
        return;
      }

      setSelectedAssetId(asset.id);
      setActiveView("assets");
      setOperationMessage({
        tone: "info",
        title: "Ouverture demandee depuis Blender",
        detail: `Fiche affichee : ${asset.displayName}`
      });
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [project?.assets, project?.projectRoot]);

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
      setSelectedAssetId(requestedAsset?.id ?? "");
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
      setSelectedAssetId("");
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

  const openAssetInBlender = async (assetId: string) => {
    const asset = project?.assets.find((item) => item.id === assetId);

    if (!project?.projectRoot || !asset) {
      setOperationMessage({
        tone: "error",
        title: "Ouverture impossible",
        detail: "Aucun projet ou asset charge."
      });
      return;
    }

    try {
      await openProjectPath(project.projectRoot, asset.paths.blenderSource);
      setOperationMessage({
        tone: "success",
        title: "Fichier Blender ouvert",
        detail: asset.paths.blenderSource ?? asset.displayName
      });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Ouverture Blender impossible",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return {
    activeView,
    blenderPathInput,
    capabilities,
    createGitignore,
    createProjectFromWelcome,
    createProjectName,
    createProjectRoot,
    createUnityFolders,
    exportingAssetId,
    filteredAssets,
    forgetLastProject,
    handleExportAsset,
    isCreateProjectOpen,
    isCreatingProject,
    isDetectingTools,
    isLoadingProject,
    openAsset,
    openAssetInBlender,
    openDefaultProject,
    openProject,
    operationMessage,
    project,
    projectPathInput,
    pureRefPathInput,
    query,
    refreshToolDetection,
    role,
    saveLocalSettings,
    selectedAsset,
    selectedAssetId,
    selectedProblems,
    setActiveView,
    setBlenderPathInput,
    setCreateGitignore,
    setCreateProjectName,
    setCreateProjectRoot,
    setCreateUnityFolders,
    setIsCreateProjectOpen,
    setOperationMessage,
    setProjectPathInput,
    setPureRefPathInput,
    setQuery,
    setRole,
    setSelectedAssetId,
    setUnityPathInput,
    shellStyle,
    toolsSnapshot,
    unityPathInput,
    userSettings,
    chooseCreateProjectDirectory,
    chooseProjectDirectory
  };
}
