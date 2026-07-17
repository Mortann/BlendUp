import { useEffect, useMemo, useState } from "react";
import {
  createProject,
  defaultUserSettings,
  detectBlender,
  exportAsset,
  loadDefaultProjectSnapshot,
  loadProjectSnapshot,
  loadUserSettings,
  openBlendFile,
  openProjectPath,
  rememberProject,
  saveUserSettings,
  selectProjectDirectory,
  updateProjectEngine
} from "../blendup/projectLoader";
import type { BlendUpAsset, GameEngine, ProjectSnapshot, ToolDetection, UserSettings } from "../blendup/types";
import type { ActiveView, OperationMessage } from "./types";

export function useBlendUpController() {
  const [activeView, setActiveView] = useState<ActiveView>("assets");
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings);
  const [projectPathInput, setProjectPathInput] = useState("");
  const [createProjectName, setCreateProjectName] = useState("");
  const [createProjectRoot, setCreateProjectRoot] = useState("");
  const [createEngine, setCreateEngine] = useState<GameEngine>("godot");
  const [blenderPathInput, setBlenderPathInput] = useState("");
  const [blenderDetection, setBlenderDetection] = useState<ToolDetection | null>(null);
  const [operationMessage, setOperationMessage] = useState<OperationMessage | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isDetectingBlender, setIsDetectingBlender] = useState(false);
  const [exportingAssetIds, setExportingAssetIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadUserSettings().then(async (settings) => {
      if (cancelled) return;
      setUserSettings(settings);
      setBlenderPathInput(settings.blenderPath ?? "");
      setProjectPathInput(settings.lastProjectRoot ?? "");

      if (settings.lastProjectRoot) {
        try {
          const snapshot = await loadProjectSnapshot(settings.lastProjectRoot);
          if (!cancelled) setProject(snapshot);
        } catch {
          // Un projet recent peut avoir ete deplace. L'accueil reste utilisable.
        }
      }

      if (!cancelled) setIsBooting(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAsset = useMemo(
    () => project?.assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [project, selectedAssetId]
  );

  const showError = (title: string, error: unknown) => {
    setOperationMessage({ detail: errorMessage(error), title, tone: "error" });
  };

  const persistSettings = async (next: UserSettings) => {
    const saved = await saveUserSettings(next);
    setUserSettings(saved);
    return saved;
  };

  const openProject = async (projectRoot: string): Promise<boolean> => {
    setIsLoadingProject(true);
    try {
      const snapshot = await loadProjectSnapshot(projectRoot);
      setProject(snapshot);
      setProjectPathInput(snapshot.projectRoot);
      setActiveView("assets");
      setSelectedAssetId(null);
      await persistSettings(rememberProject(userSettings, snapshot.projectRoot));
      return true;
    } catch (error) {
      showError("Impossible d'ouvrir le projet", error);
      return false;
    } finally {
      setIsLoadingProject(false);
    }
  };

  const chooseProjectDirectory = async () => {
    const selected = await selectProjectDirectory("Ouvrir un projet BlendUp");
    if (selected) {
      setProjectPathInput(selected);
      await openProject(selected);
    }
  };

  const chooseCreateProjectDirectory = async () => {
    const selected = await selectProjectDirectory("Choisir le dossier du nouveau projet");
    if (selected) setCreateProjectRoot(selected);
  };

  const openDefaultProject = async () => {
    setIsLoadingProject(true);
    try {
      const snapshot = await loadDefaultProjectSnapshot();
      setProject(snapshot);
      setProjectPathInput(snapshot.projectRoot);
      setActiveView("assets");
      await persistSettings(rememberProject(userSettings, snapshot.projectRoot));
    } catch (error) {
      showError("Projet test indisponible", error);
    } finally {
      setIsLoadingProject(false);
    }
  };

  const createProjectFromWelcome = async () => {
    setIsCreatingProject(true);
    try {
      const result = await createProject({
        engine: createEngine,
        projectName: createProjectName,
        projectRoot: createProjectRoot
      });
      const opened = await openProject(result.projectRoot);
      if (opened) {
        setOperationMessage({ title: result.message, tone: "success" });
        setCreateProjectName("");
      }
    } catch (error) {
      showError("Impossible de creer le projet", error);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const refreshProject = async () => {
    if (!project) return;
    try {
      setProject(await loadProjectSnapshot(project.projectRoot));
    } catch (error) {
      showError("Actualisation impossible", error);
    }
  };

  const handleExportAsset = async (assetId: string, quiet = false): Promise<boolean> => {
    if (!project || exportingAssetIds.includes(assetId)) return false;
    setExportingAssetIds((current) => [...current, assetId]);
    try {
      const result = await exportAsset({
        assetId,
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: project.projectRoot
      });
      await refreshProject();
      if (!quiet || !result.success) {
        setOperationMessage({
          detail: result.success ? result.outputPath : result.log,
          title: result.message,
          tone: result.success ? "success" : "error"
        });
      }
      return result.success;
    } catch (error) {
      showError("Export impossible", error);
      return false;
    } finally {
      setExportingAssetIds((current) => current.filter((id) => id !== assetId));
    }
  };

  const exportAllAssets = async () => {
    if (!project) return;
    const pending = project.assets.filter((asset) => asset.status !== "exported");
    if (pending.length === 0) {
      setOperationMessage({ title: "Tous les assets sont deja a jour.", tone: "info" });
      return;
    }

    let successCount = 0;
    for (const asset of pending) {
      if (await handleExportAsset(asset.id, true)) successCount += 1;
    }
    setOperationMessage({
      detail: `${successCount} sur ${pending.length} export(s) termine(s).`,
      title: successCount === pending.length ? "Export termine" : "Export partiellement termine",
      tone: successCount === pending.length ? "success" : "error"
    });
  };

  const openAssetInBlender = async (asset: BlendUpAsset) => {
    if (!project) return;
    try {
      await openBlendFile({
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: project.projectRoot,
        relativePath: asset.sourcePath,
        showCommandPrompt: userSettings.showBlenderCommandPrompt
      });
    } catch (error) {
      showError("Impossible d'ouvrir Blender", error);
    }
  };

  const openContentPath = async (relativePath: string) => {
    if (!project) return;
    try {
      await openProjectPath(project.projectRoot, relativePath);
    } catch (error) {
      showError("Impossible d'ouvrir ce chemin", error);
    }
  };

  const refreshBlenderDetection = async () => {
    setIsDetectingBlender(true);
    try {
      setBlenderDetection(await detectBlender(blenderPathInput));
    } catch (error) {
      showError("Detection de Blender impossible", error);
    } finally {
      setIsDetectingBlender(false);
    }
  };

  const saveLocalSettings = async () => {
    try {
      const next = await persistSettings({
        ...userSettings,
        blenderPath: blenderPathInput.trim() || null
      });
      setBlenderPathInput(next.blenderPath ?? "");
      setOperationMessage({ title: "Parametres enregistres", tone: "success" });
      await refreshBlenderDetection();
    } catch (error) {
      showError("Enregistrement impossible", error);
    }
  };

  const changeProjectEngine = async (engine: GameEngine) => {
    if (!project || engine === project.project.engine) return;
    try {
      const result = await updateProjectEngine(project.projectRoot, engine);
      await refreshProject();
      setOperationMessage({ detail: result.message, title: "Moteur modifie", tone: "success" });
    } catch (error) {
      showError("Impossible de modifier le moteur", error);
    }
  };

  const setShowBlenderCommandPrompt = async (show: boolean) => {
    await persistSettings({ ...userSettings, showBlenderCommandPrompt: show });
  };

  const forgetLastProject = async () => {
    setProject(null);
    setSelectedAssetId(null);
    await persistSettings({ ...userSettings, lastProjectRoot: null });
  };

  const revealAsset = (assetId: string) => {
    setSelectedAssetId(assetId);
    setActiveView("assets");
  };

  return {
    activeView,
    blenderDetection,
    blenderPathInput,
    changeProjectEngine,
    chooseCreateProjectDirectory,
    chooseProjectDirectory,
    createEngine,
    createProjectFromWelcome,
    createProjectName,
    createProjectRoot,
    exportAllAssets,
    exportingAssetIds,
    forgetLastProject,
    handleExportAsset,
    isBooting,
    isCreatingProject,
    isDetectingBlender,
    isLoadingProject,
    openAssetInBlender,
    openContentPath,
    openDefaultProject,
    openProject,
    operationMessage,
    project,
    projectPathInput,
    refreshBlenderDetection,
    refreshProject,
    revealAsset,
    saveLocalSettings,
    selectedAsset,
    setActiveView,
    setBlenderPathInput,
    setCreateEngine,
    setCreateProjectName,
    setCreateProjectRoot,
    setOperationMessage,
    setProjectPathInput,
    setSelectedAssetId,
    setShowBlenderCommandPrompt,
    userSettings
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Une erreur inconnue est survenue.";
}
