import { useEffect, useMemo, useRef, useState } from "react";
import {
  addAssetImages,
  configureShowcase,
  rebuildShowcase,
  setupEditorIntegration,
  openShowcaseGodot,
  checkAssetUvs,
  updateProjectBlenderSettings,
  updateProjectPaths,
  clearAssetExports,
  copyAsset,
  createAsset,
  createAssetVariant,
  createFolder,
  createProject,
  defaultUserSettings,
  deleteAsset,
  deleteAssetVersion,
  deleteFolder,
  detectBlender,
  duplicateAsset,
  exportAsset,
  exportAssetVersion,
  exportAssetVersions,
  generateAssetLods,
  generateAssetPreview,
  loadDefaultProjectSnapshot,
  loadProjectSnapshot,
  loadUserSettings,
  moveAsset,
  moveFolder,
  openBlendFile,
  openProjectPath,
  organizeAsset,
  rememberProject,
  renameAsset,
  renameFolder,
  saveUserSettings,
  selectImageFiles,
  selectProjectDirectory,
  setAssetThumbnail,
  updateAssetMetadata,
  updateProjectEngine
} from "../blendup/projectLoader";
import type {
  BlenderProjectSettings,
  AssetLod,
  AssetMutationResult,
  AssetVariant,
  BlendUpAsset,
  BlendUpProject,
  GameEngine,
  ProjectSnapshot,
  ToolDetection,
  UserSettings
} from "../blendup/types";
import type { ActiveView, OperationMessage } from "./types";
import { readableError } from "../blendup/problems";

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
  const [openingAssetPath, setOpeningAssetPath] = useState<string | null>(null);
  const openingAsset = useRef(false);
  const changingProjectPaths = useRef(false);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isDetectingBlender, setIsDetectingBlender] = useState(false);
  const [isReexporting, setIsReexporting] = useState(false);
  const [checkingUvAssetIds, setCheckingUvAssetIds] = useState<string[]>([]);
  const [exportingAssetIds, setExportingAssetIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const activeProjectRoot = project?.projectRoot ?? null;
  const currentProjectRoot = useRef(activeProjectRoot);
  currentProjectRoot.current = activeProjectRoot;

  useEffect(() => {
    if (!operationMessage) return;
    const timer = window.setTimeout(() => setOperationMessage(null), operationMessage.tone === "error" ? 8000 : 5000);
    return () => window.clearTimeout(timer);
  }, [operationMessage]);

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

  useEffect(() => {
    if (!activeProjectRoot) return;
    let cancelled = false;
    let refreshing = false;

    const refreshFromDisk = async () => {
      if (cancelled || refreshing || document.hidden || changingProjectPaths.current) return;
      refreshing = true;
      try {
        const snapshot = await loadProjectSnapshot(activeProjectRoot);
        if (!cancelled && !changingProjectPaths.current) {
          setProject((current) => {
            if (!current || current.projectRoot !== activeProjectRoot) return current;
            return JSON.stringify(current) === JSON.stringify(snapshot) ? current : snapshot;
          });
        }
      } catch {
        // Le prochain passage retentera silencieusement : l'utilisateur peut être en train d'enregistrer.
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => void refreshFromDisk(), 1_400);
    const onFocus = () => void refreshFromDisk();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeProjectRoot]);

  const selectedAsset = useMemo(
    () => project?.assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [project, selectedAssetId]
  );

  const showError = (title: string, error: unknown) => {
    setOperationMessage({ detail: readableError(errorMessage(error)), title, tone: "error" });
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

  const [showcaseBusyIds, setShowcaseBusyIds] = useState<string[]>([]);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const handleConfigureShowcase = async (folder: string, enabled: boolean, spacing?: number) => {
    if (!project) return;
    try {
      const message = await configureShowcase(project.projectRoot, folder, enabled, spacing);
      setOperationMessage({ tone: "success", title: message });
      await refreshProject();
    } catch (error) { showError("Option Showcase impossible", error); }
  };
  const handleRebuildShowcase = async (id: string): Promise<boolean> => {
    if (!project || showcaseBusyIds.includes(id)) return false;
    setShowcaseBusyIds((ids) => [...ids, id]);
    try {
      const message = await rebuildShowcase(project.projectRoot, id, userSettings.blenderPath ?? undefined);
      setOperationMessage({ tone: "success", title: message });
      await refreshProject();
      return true;
    } catch (error) { showError("Génération Showcase impossible", error); return false; }
    finally { setShowcaseBusyIds((ids) => ids.filter((entry) => entry !== id)); }
  };
  const handleOpenShowcase = async (id: string, editor: "blender" | "godot") => {
    const scene = project?.showcases?.find((s) => s.id === id);
    if (!project || !scene || scene.status === "generating") return;
    if (scene.status === "outdated" && !await handleRebuildShowcase(id)) return;
    try {
      if (editor === "blender") await openAssetPathInBlender(scene.blenderPath);
      else setOperationMessage({ tone: "success", title: await openShowcaseGodot(project.projectRoot, id) });
    } catch (error) { showError("Ouverture Showcase impossible", error); }
  };
  const handleSetupIntegration = async (editor: "blender" | "godot") => {
    if (!project || integrationBusy) return;
    setIntegrationBusy(true);
    try {
      setOperationMessage({ tone: "success", title: await setupEditorIntegration(project.projectRoot, editor) });
      await refreshProject();
    } catch (error) { showError("Intégration impossible", error); }
    finally { setIntegrationBusy(false); }
  };

  const handleExportAsset = async (assetId: string, quiet = false): Promise<boolean> => {
    if (!project || exportingAssetIds.includes(assetId) || checkingUvAssetIds.includes(assetId)) return false;
    setExportingAssetIds((current) => [...current, assetId]);
    try {
      const result = await (project.project.engine === "none" ? generateAssetPreview : exportAsset)({
        assetId,
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: project.projectRoot
      });
      await refreshProject();
      if (!quiet || !result.success) {
        setOperationMessage({
          detail: result.success ? result.outputPath : readableError(result.log),
          title: result.message,
          tone: result.success ? "success" : "error"
        });
      }
      return result.success;
    } catch (error) {
      showError(project.project.engine === "none" ? "Aperçu impossible" : "Export impossible", error);
      return false;
    } finally {
      setExportingAssetIds((current) => current.filter((id) => id !== assetId));
    }
  };

  const handleExportAssetVersion = async (
    assetId: string,
    versionId: string,
    versionKind: "variant" | "lod"
  ): Promise<boolean> => {
    if (!project || exportingAssetIds.includes(assetId) || checkingUvAssetIds.includes(assetId)) return false;
    setExportingAssetIds((current) => [...current, assetId]);
    try {
      const result = await exportAssetVersion({
        assetId,
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: project.projectRoot,
        versionId,
        versionKind
      });
      await refreshProject();
      setOperationMessage({
        detail: result.success ? result.outputPath : readableError(result.log),
        title: result.message,
        tone: result.success ? "success" : "error"
      });
      return result.success;
    } catch (error) {
      showError("Export de la version impossible", error);
      return false;
    } finally {
      setExportingAssetIds((current) => current.filter((id) => id !== assetId));
    }
  };

  const handleExportAssetVersions = async (assetId: string): Promise<boolean> => {
    if (!project || exportingAssetIds.includes(assetId) || checkingUvAssetIds.includes(assetId)) return false;
    setExportingAssetIds((current) => [...current, assetId]);
    try {
      const result = await exportAssetVersions({
        assetId,
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: project.projectRoot
      });
      await refreshProject();
      setOperationMessage({
        detail: result.success ? result.outputPath : readableError(result.log),
        title: result.message,
        tone: result.success ? "success" : "error"
      });
      return result.success;
    } catch (error) {
      showError("Export de toutes les versions impossible", error);
      return false;
    } finally {
      setExportingAssetIds((current) => current.filter((id) => id !== assetId));
    }
  };

  const reexportAllAssets = async () => {
    if (!project || isReexporting || exportingAssetIds.length || checkingUvAssetIds.length) return;
    const assets = [...project.assets];
    if (!assets.length) {
      setOperationMessage({ title: "Aucun asset a exporter.", tone: "info" });
      return;
    }

    setIsReexporting(true);
    setExportingAssetIds(assets.map((asset) => asset.id));
    let successCount = 0;
    const failures: string[] = [];
    try {
      await clearAssetExports(project.projectRoot);
      for (const asset of assets) {
        try {
          const result = await exportAssetVersions({
            assetId: asset.id,
            blenderPath: userSettings.blenderPath ?? undefined,
            projectRoot: project.projectRoot
          });
          if (result.success) successCount += 1;
          else failures.push(`${asset.name} : ${result.message}`);
        } catch (error) {
          failures.push(`${asset.name} : ${errorMessage(error)}`);
        }
      }
      await refreshProject();
      setOperationMessage({
        detail: failures.length
          ? `${successCount} sur ${assets.length} asset(s) reexporte(s). ${failures.join(" | ")}`
          : `${successCount} asset(s), avec leurs variantes et LOD, ont ete reexportes.`,
        title: successCount === assets.length ? "Reexportation terminee" : "Reexportation partiellement terminee",
        tone: successCount === assets.length ? "success" : "error"
      });
    } catch (error) {
      showError("Impossible de reconstruire les exports", error);
    } finally {
      setExportingAssetIds([]);
      setIsReexporting(false);
    }
  };

  const openAssetPathInBlender = async (relativePath: string) => {
    if (!project || openingAsset.current) return;
    openingAsset.current = true;
    setOpeningAssetPath(relativePath);
    const started = performance.now();
    try {
      await openBlendFile({
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: project.projectRoot,
        relativePath,
        showCommandPrompt: userSettings.showBlenderCommandPrompt
      });
    } catch (error) {
      showError("Impossible d'ouvrir Blender", error);
    } finally {
      // Keep fast bridge acknowledgements visible long enough to confirm the click.
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 400 - (performance.now() - started))));
      openingAsset.current = false;
      setOpeningAssetPath(null);
    }
  };

  const openAssetInBlender = (asset: BlendUpAsset) => openAssetPathInBlender(asset.sourcePath);

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

  const saveProjectBlenderSettings = async (settings: BlenderProjectSettings): Promise<boolean> => {
    if (!project) return false;
    try {
      await updateProjectBlenderSettings(project.projectRoot, settings);
      await refreshProject();
      setOperationMessage({ title: "Options Blender du projet enregistrées", tone: "success" });
      return true;
    } catch (error) { showError("Enregistrement impossible", error); return false; }
  };

  const saveProjectPaths = async (paths: BlendUpProject["paths"]): Promise<boolean> => {
    if (!project || changingProjectPaths.current || exportingAssetIds.length || checkingUvAssetIds.length || isReexporting) return false;
    changingProjectPaths.current = true;
    try {
      await updateProjectPaths(project.projectRoot, paths);
      await refreshProject();
      setOperationMessage({ title: "Dossiers du projet renommés", detail: "Les assets et les exports utilisent maintenant les nouveaux chemins.", tone: "success" });
      return true;
    } catch (error) { showError("Impossible de renommer les dossiers", error); return false; }
    finally { changingProjectPaths.current = false; }
  };

  const checkUvAsset = async (assetId: string, quiet = false): Promise<boolean> => {
    if (!project || checkingUvAssetIds.includes(assetId) || exportingAssetIds.includes(assetId)) return false;
    setCheckingUvAssetIds((current) => [...current, assetId]);
    try {
      const result = await checkAssetUvs(project.projectRoot, assetId, userSettings.blenderPath ?? undefined);
      if (currentProjectRoot.current !== project.projectRoot) return false;
      const snapshot = await loadProjectSnapshot(project.projectRoot);
      if (currentProjectRoot.current !== project.projectRoot) return false;
      setProject(snapshot);
      const asset = snapshot.assets.find((asset) => asset.id === assetId);
      const qualities = asset ? [asset.uvQuality, ...asset.metadata.variants.filter((v) => v.sourcePath).map((v) => v.uvQuality), ...asset.metadata.lods.filter((v) => v.sourcePath).map((v) => v.uvQuality)] : [];
      const blocked = qualities.some((quality) => quality?.blocked);
      if (!quiet) setOperationMessage({ title: result.message, detail: blocked ? "Un score insuffisant est signalé dans Problèmes." : undefined, tone: blocked ? "error" : "success" });
      return Boolean(qualities.length && qualities.every((quality) => quality && quality.complete && !quality.stale));
    } catch (error) { showError("Contrôle UV impossible", error); return false; }
    finally { setCheckingUvAssetIds((current) => current.filter((id) => id !== assetId)); }
  };

  const checkAllUvs = async () => {
    if (!project || checkingUvAssetIds.length || exportingAssetIds.length) return;
    let checked = 0;
    for (const asset of project.assets) {
      if (currentProjectRoot.current !== project.projectRoot) return;
      if (await checkUvAsset(asset.id, true)) checked++;
    }
    if (currentProjectRoot.current !== project.projectRoot) return;
    await refreshProject();
    setOperationMessage({ title: "Contrôle UV terminé", detail: `${checked}/${project.assets.length} asset(s) vérifiés. Les scores insuffisants sont signalés dans Problèmes.`, tone: checked === project.assets.length ? "success" : "error" });
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
    if (!project || exportingAssetIds.length || checkingUvAssetIds.length || isReexporting || engine === project.project.engine) return;
    try {
      const result = await updateProjectEngine(project.projectRoot, engine);
      await refreshProject();
      setOperationMessage({ detail: result.message, title: "Type de projet modifié", tone: "success" });
    } catch (error) {
      showError("Impossible de modifier le type de projet", error);
    }
  };

  const runAssetMutation = async (
    title: string,
    action: (projectRoot: string) => Promise<AssetMutationResult>
  ): Promise<AssetMutationResult | null> => {
    if (!project) return null;
    try {
      const result = await action(project.projectRoot);
      const snapshot = await loadProjectSnapshot(project.projectRoot);
      setProject(snapshot);
      if (result.assetId) setSelectedAssetId(result.assetId);
      setOperationMessage({ title: result.message, tone: "success" });
      return { ...result, asset: snapshot.assets.find((asset) => asset.id === result.assetId) };
    } catch (error) {
      showError(title, error);
      return null;
    }
  };

  const handleCreateFolder = (parentDir: string, name: string) =>
    runAssetMutation("Creation du dossier impossible", (root) => createFolder(root, parentDir, name));

  const handleCreateAsset = async (parentDir: string, name: string) => {
    const result = await runAssetMutation("Creation de l'asset impossible", (root) =>
      createAsset({ blenderPath: userSettings.blenderPath ?? undefined, name, parentDir, projectRoot: root })
    );
    if (result?.asset && userSettings.openAssetAfterCreation) {
      await openAssetInBlender(result.asset);
    }
    return result;
  };

  const handleOrganizeAsset = (assetId: string) =>
    runAssetMutation("Organisation de l'asset impossible", (root) => organizeAsset(root, assetId));

  const handleCreateAssetVariant = (assetId: string, name: string) =>
    runAssetMutation("Creation de la variante impossible", (root) =>
      createAssetVariant(root, assetId, name)
    );

  const handleGenerateAssetLods = (assetId: string) =>
    runAssetMutation("Generation des LOD impossible", (root) =>
      generateAssetLods({
        assetId,
        blenderPath: userSettings.blenderPath ?? undefined,
        projectRoot: root
      })
    );

  const handleDeleteAssetVersion = (
    assetId: string,
    versionId: string,
    versionKind: "variant" | "lod"
  ) =>
    runAssetMutation("Suppression de la version impossible", (root) =>
      deleteAssetVersion(root, assetId, versionId, versionKind)
    );

  const handleRenameAsset = (assetId: string, newName: string) =>
    runAssetMutation("Renommage impossible", (root) => renameAsset(root, assetId, newName));

  const handleMoveAsset = (assetId: string, targetDir: string) =>
    runAssetMutation("Deplacement impossible", (root) => moveAsset(root, assetId, targetDir));

  const handleCopyAsset = (assetId: string, targetDir: string, move: boolean) =>
    runAssetMutation(move ? "Deplacement impossible" : "Copie impossible", (root) =>
      copyAsset(root, assetId, targetDir, move)
    );

  const handleDuplicateAsset = (assetId: string) =>
    runAssetMutation("Duplication impossible", (root) => duplicateAsset(root, assetId));

  const handleDeleteAsset = (assetId: string) =>
    runAssetMutation("Suppression impossible", (root) => deleteAsset(root, assetId));

  const handleRenameFolder = (folder: string, newName: string) =>
    runAssetMutation("Renommage du dossier impossible", (root) => renameFolder(root, folder, newName));

  const handleMoveFolder = (folder: string, targetDir: string) =>
    runAssetMutation("Deplacement du dossier impossible", (root) => moveFolder(root, folder, targetDir));

  const handleDeleteFolder = (folder: string) =>
    runAssetMutation("Suppression du dossier impossible", (root) => deleteFolder(root, folder));

  const handleUpdateAssetMetadata = (
    assetId: string,
    notes: string,
    tags: string[],
    variants: AssetVariant[],
    lods: AssetLod[]
  ) =>
    runAssetMutation("Enregistrement impossible", (root) =>
      updateAssetMetadata({ assetId, lods, notes, projectRoot: root, tags, variants })
    );

  const handleSetAssetThumbnail = async (assetId: string) => {
    const images = await selectImageFiles();
    if (images[0]) {
      await runAssetMutation("Miniature impossible", (root) => setAssetThumbnail(root, assetId, images[0]));
    }
  };

  const handleAddAssetImages = async (assetId: string, kind: "renders" | "textures") => {
    const images = await selectImageFiles();
    if (images.length > 0) {
      await runAssetMutation("Ajout des images impossible", (root) =>
        addAssetImages(root, assetId, kind, images)
      );
    }
  };

  const setShowBlenderCommandPrompt = async (show: boolean) => {
    try {
      await persistSettings({ ...userSettings, showBlenderCommandPrompt: show });
    } catch (error) { showError("Enregistrement impossible", error); }
  };

  const setOpenAssetAfterCreation = async (open: boolean) => {
    try {
      await persistSettings({ ...userSettings, openAssetAfterCreation: open });
    } catch (error) { showError("Enregistrement impossible", error); }
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
    handleConfigureShowcase, handleRebuildShowcase, handleOpenShowcase, handleSetupIntegration, showcaseBusyIds, integrationBusy,
    activeView,
    blenderDetection,
    blenderPathInput,
    changeProjectEngine,
    saveProjectBlenderSettings,
    saveProjectPaths,
    checkUvAsset,
    checkAllUvs,
    checkingUvAssetIds,
    chooseCreateProjectDirectory,
    chooseProjectDirectory,
    createEngine,
    createProjectFromWelcome,
    createProjectName,
    createProjectRoot,
    exportingAssetIds,
    forgetLastProject,
    handleAddAssetImages,
    handleCopyAsset,
    handleCreateAsset,
    handleCreateAssetVariant,
    handleCreateFolder,
    handleDeleteAsset,
    handleDeleteAssetVersion,
    handleDeleteFolder,
    handleDuplicateAsset,
    handleExportAsset,
    handleExportAssetVersion,
    handleExportAssetVersions,
    handleGenerateAssetLods,
    handleMoveAsset,
    handleMoveFolder,
    handleOrganizeAsset,
    handleRenameAsset,
    handleRenameFolder,
    handleSetAssetThumbnail,
    handleUpdateAssetMetadata,
    isBooting,
    isCreatingProject,
    isDetectingBlender,
    isLoadingProject,
    isReexporting,
    openAssetInBlender,
    openAssetPathInBlender,
    openContentPath,
    openDefaultProject,
    openProject,
    operationMessage,
    openingAssetPath,
    project,
    projectPathInput,
    refreshBlenderDetection,
    refreshProject,
    reexportAllAssets,
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
    setOpenAssetAfterCreation,
    userSettings
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Une erreur inconnue est survenue.";
}
