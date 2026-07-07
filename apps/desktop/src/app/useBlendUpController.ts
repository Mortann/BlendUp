import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Role } from "../blendup/roles";
import {
  capabilitiesFor,
  defaultRoleFromProject,
  loadStoredRole,
  storeRole
} from "../blendup/roles";
import type {
  AssetLod,
  AssetNamingRules,
  AssetStatus,
  AssetTypePreset,
  AssetVariant,
  LocalToolsSnapshot,
  ProjectSnapshot,
  UserSettings
} from "../blendup/types";
import { exportAssetToFbx } from "../blendup/actions";
import {
  addAssetFiles,
  createAsset,
  createFolder,
  createProject,
  copyAsset,
  deleteAsset,
  deleteFolder,
  duplicateAsset,
  detectLocalTools,
  loadDefaultProjectSnapshot,
  loadProjectSnapshot,
  loadUserSettings,
  migrateAssetsToFolders,
  moveAsset,
  moveFolder,
  openBlendFileInBlender,
  openProjectPath,
  rememberProjectInSettings,
  renameAsset,
  renameFolder,
  saveAssetConfiguration,
  saveUserSettings,
  selectProjectDirectory,
  setAssetAssignees,
  setAssetLods,
  setAssetOwners,
  setAssetVariants,
  takeOpenRequest,
  updateAssetNotes,
  updateAssetStatus
} from "../blendup/projectLoader";
import type { ActiveView, OperationMessage } from "./types";
import {
  DEFAULT_SHORTCUTS,
  loadShortcutBindings,
  saveShortcutBindings,
  useShortcuts,
  type ShortcutAction,
  type ShortcutBindings
} from "./shortcuts";

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

      const refreshedProject = await loadProjectSnapshot(projectRoot);
      if (cancelled) {
        return;
      }

      const asset = refreshedProject.assets.find((item) => item.id === request.assetId);

      if (!asset) {
        setProject(refreshedProject);
        return;
      }

      setProject(refreshedProject);
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
  }, [project?.projectRoot]);

  useEffect(() => {
    const projectRoot = project?.projectRoot;

    if (!projectRoot || activeView !== "assets") {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const refreshedProject = await loadProjectSnapshot(projectRoot);
        if (!cancelled) {
          setProject(refreshedProject);
        }
      } catch (error) {
        console.warn("Actualisation assets impossible", error);
      }
    }, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeView, project?.projectRoot]);

  const migratedRoots = useRef(new Set<string>());

  useEffect(() => {
    const projectRoot = project?.projectRoot;

    if (!projectRoot || migratedRoots.current.has(projectRoot)) {
      return;
    }

    migratedRoots.current.add(projectRoot);
    let cancelled = false;

    void (async () => {
      try {
        const migrated = await migrateAssetsToFolders(projectRoot);

        if (cancelled || migrated <= 0) {
          return;
        }

        const refreshedProject = await loadProjectSnapshot(projectRoot);

        if (!cancelled) {
          setProject(refreshedProject);
          setOperationMessage({
            tone: "info",
            title: "Assets reorganises en dossiers",
            detail: `${migrated} asset(s) migre(s) vers le nouveau modele.`
          });
        }
      } catch (error) {
        console.warn("Migration des assets impossible", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.projectRoot]);

  useEffect(() => {
    if (!operationMessage) {
      return;
    }

    const delay = operationMessage.tone === "error" ? 8000 : 4500;
    const timeoutId = window.setTimeout(() => setOperationMessage(null), delay);

    return () => window.clearTimeout(timeoutId);
  }, [operationMessage]);

  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindings>(() => loadShortcutBindings());

  useEffect(() => {
    saveShortcutBindings(shortcutBindings);
  }, [shortcutBindings]);

  const updateShortcut = (action: ShortcutAction, combo: string) => {
    setShortcutBindings((current) => ({ ...current, [action]: combo }));
  };

  const resetShortcuts = () => setShortcutBindings({ ...DEFAULT_SHORTCUTS });

  useShortcuts(shortcutBindings, {
    "nav.dashboard": () => setActiveView("dashboard"),
    "nav.assets": () => setActiveView("assets"),
    "nav.references": () => setActiveView("references"),
    "nav.tasks": () => setActiveView("tasks"),
    "nav.nomenclature": () => setActiveView("nomenclature"),
    "nav.team": () => setActiveView("team"),
    "nav.problems": () => setActiveView("problems"),
    "nav.git": () => setActiveView("git"),
    "nav.settings": () => setActiveView("settings")
  });

  const persistUserSettings = async (nextSettings: UserSettings) => {
    const savedSettings = await saveUserSettings(nextSettings);
    setUserSettings(savedSettings);
    setBlenderPathInput(savedSettings.blenderPath ?? "");
    setUnityPathInput(savedSettings.unityPath ?? "");
    setPureRefPathInput(savedSettings.pureRefPath ?? "");

    return savedSettings;
  };

  const setShowBlenderCommandPrompt = async (showBlenderCommandPrompt: boolean) => {
    await persistUserSettings({
      ...userSettings,
      blenderPath: blenderPathInput,
      unityPath: unityPathInput,
      pureRefPath: pureRefPathInput,
      showBlenderCommandPrompt
    });
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
      await openBlendFileInBlender({
        blenderPath: blenderPathInput,
        projectRoot: project.projectRoot,
        relativePath: asset.paths.blenderSource,
        showCommandPrompt: userSettings.showBlenderCommandPrompt
      });
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

  const openProjectContentPath = async (relativePath: string) => {
    if (!project?.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Ouverture impossible",
        detail: "Aucun projet charge."
      });
      return;
    }

    try {
      await openProjectPath(project.projectRoot, relativePath);
      setOperationMessage({
        tone: "success",
        title: "Contenu ouvert",
        detail: relativePath
      });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Ouverture impossible",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const changeAssetStatus = async (
    assetId: string,
    status: AssetStatus,
    actor: string,
    actorIsArtDirector: boolean
  ) => {
    if (!project?.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Statut non modifie",
        detail: "Le projet courant n'a pas de dossier source charge."
      });
      return;
    }

    try {
      await updateAssetStatus({
        actor,
        actorIsArtDirector,
        assetId,
        projectRoot: project.projectRoot,
        status,
        updatedAt: new Date().toISOString()
      });
      const refreshedProject = await loadProjectSnapshot(project.projectRoot);

      setProject(refreshedProject);
      setSelectedAssetId(assetId);
      setOperationMessage({
        tone: "success",
        title: "Statut asset mis a jour",
        detail: refreshedProject.assets.find((asset) => asset.id === assetId)?.displayName ?? assetId
      });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Statut non modifie",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const runAssetMutation = async (
    operation: () => Promise<void>,
    successTitle: string,
    successDetail: string,
    errorTitle: string,
    nextSelectedAssetId?: string
  ) => {
    if (!project?.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: errorTitle,
        detail: "Le projet courant n'a pas de dossier source charge."
      });
      return;
    }

    try {
      await operation();
      const refreshedProject = await loadProjectSnapshot(project.projectRoot);
      setProject(refreshedProject);

      if (nextSelectedAssetId !== undefined) {
        setSelectedAssetId(nextSelectedAssetId);
      }

      setOperationMessage({ tone: "success", title: successTitle, detail: successDetail });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: errorTitle,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const handleRenameAsset = async (assetId: string, newName: string, actor: string) => {
    const trimmed = newName.trim();

    if (!trimmed) {
      return;
    }

    await runAssetMutation(
      () =>
        renameAsset({
          projectRoot: project!.projectRoot!,
          assetId,
          newName: trimmed,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Asset renomme",
      trimmed,
      "Renommage impossible"
    );
  };

  const handleMoveAsset = async (assetId: string, targetDir: string, actor: string) => {
    await runAssetMutation(
      () =>
        moveAsset({
          projectRoot: project!.projectRoot!,
          assetId,
          targetDir,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Asset deplace",
      targetDir || "Racine",
      "Deplacement impossible"
    );
  };

  const handleMoveFolder = async (fromDir: string, targetDir: string, actor: string) => {
    await runAssetMutation(
      () =>
        moveFolder({
          projectRoot: project!.projectRoot!,
          fromDir,
          targetDir,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Dossier deplace",
      targetDir || "Racine",
      "Deplacement impossible"
    );
  };

  const handleDeleteAsset = async (assetId: string, actor: string) => {
    await runAssetMutation(
      () =>
        deleteAsset({
          projectRoot: project!.projectRoot!,
          assetId,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Asset supprime",
      "Envoye a la corbeille",
      "Suppression impossible",
      ""
    );
  };

  const handleSetAssetOwners = async (
    assetId: string,
    owners: { artist: string[]; developer: string[]; reviewer: string | null },
    actor: string
  ) => {
    await runAssetMutation(
      () =>
        setAssetOwners({
          projectRoot: project!.projectRoot!,
          assetId,
          artist: owners.artist,
          developer: owners.developer,
          reviewer: owners.reviewer,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Assignation mise a jour",
      "Equipe de l'asset modifiee",
      "Assignation impossible",
      assetId
    );
  };

  const handleUpdateAssetNotes = async (assetId: string, artistNotes: string, actor: string) => {
    await runAssetMutation(
      () =>
        updateAssetNotes({
          projectRoot: project!.projectRoot!,
          assetId,
          artistNotes,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Notes mises a jour",
      "Notes artiste enregistrees",
      "Modification des notes impossible",
      assetId
    );
  };

  const handleSetAssignees = async (assetId: string, assignees: string[], actor: string) => {
    await runAssetMutation(
      () =>
        setAssetAssignees({
          projectRoot: project!.projectRoot!,
          assetId,
          assignees,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Assignation mise a jour",
      `${assignees.length} personne(s) assignee(s)`,
      "Assignation impossible",
      assetId
    );
  };

  const handleCreateFolder = async (parentDir: string, name: string, actor: string) => {
    await runAssetMutation(
      () => createFolder({ projectRoot: project!.projectRoot!, parentDir, name }),
      "Dossier cree",
      name,
      "Creation impossible"
    );
  };

  const handleAddAssetFiles = async (
    assetId: string,
    kind: "references" | "textures",
    sources: string[],
    actor: string
  ) => {
    if (sources.length === 0) {
      return;
    }

    await runAssetMutation(
      () =>
        addAssetFiles({
          projectRoot: project!.projectRoot!,
          assetId,
          kind,
          sources,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Fichiers ajoutes",
      `${sources.length} fichier(s)`,
      "Ajout impossible",
      assetId
    );
  };

  const handleCreateAsset = async (
    input: {
      parentDir: string;
      name: string;
      assetType: string;
      notes: string;
      referenceImages: string[];
      textureImages: string[];
    },
    actor: string
  ) => {
    if (!project?.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Creation impossible",
        detail: "Le projet courant n'a pas de dossier source charge."
      });
      return;
    }

    setIsLoadingProject(true);

    try {
      const message = await createAsset({
        projectRoot: project.projectRoot,
        parentDir: input.parentDir,
        name: input.name,
        assetType: input.assetType,
        notes: input.notes,
        referenceImages: input.referenceImages,
        textureImages: input.textureImages,
        fbxExport: null,
        unityPrefab: null,
        blenderPath: blenderPathInput.trim() || null,
        actor,
        createdAt: new Date().toISOString()
      });
      const refreshedProject = await loadProjectSnapshot(project.projectRoot);
      setProject(refreshedProject);
      setOperationMessage({ tone: "success", title: "Asset cree", detail: message });
    } catch (error) {
      setOperationMessage({
        tone: "error",
        title: "Creation impossible",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleDeleteFolder = async (dir: string, actor: string) => {
    await runAssetMutation(
      () =>
        deleteFolder({
          projectRoot: project!.projectRoot!,
          dir,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Dossier supprime",
      "Envoye a la corbeille",
      "Suppression impossible"
    );
  };

  const handleRenameFolder = async (dir: string, newName: string, actor: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    await runAssetMutation(
      () =>
        renameFolder({
          projectRoot: project!.projectRoot!,
          dir,
          newName: trimmed,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Dossier renomme",
      trimmed,
      "Renommage impossible"
    );
  };

  const handleDuplicateAsset = async (assetId: string, actor: string) => {
    await runAssetMutation(
      async () => {
        await duplicateAsset({
          projectRoot: project!.projectRoot!,
          assetId,
          actor,
          createdAt: new Date().toISOString()
        });
      },
      "Asset duplique",
      "Copie creee",
      "Duplication impossible"
    );
  };

  const handleSetVariants = async (assetId: string, variants: AssetVariant[], actor: string) => {
    await runAssetMutation(
      () =>
        setAssetVariants({
          projectRoot: project!.projectRoot!,
          assetId,
          variants,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "Variantes mises a jour",
      `${variants.length} variante(s)`,
      "Modification des variantes impossible",
      assetId
    );
  };

  const handleSetLods = async (assetId: string, lods: AssetLod[], actor: string) => {
    await runAssetMutation(
      () =>
        setAssetLods({
          projectRoot: project!.projectRoot!,
          assetId,
          lods,
          actor,
          updatedAt: new Date().toISOString()
        }),
      "LODs mis a jour",
      `${lods.length} niveau(x)`,
      "Modification des LODs impossible",
      assetId
    );
  };

  const handlePasteAsset = async (
    assetId: string,
    targetDir: string,
    move: boolean,
    actor: string
  ) => {
    await runAssetMutation(
      async () => {
        await copyAsset({
          projectRoot: project!.projectRoot!,
          assetId,
          targetDir,
          move,
          actor,
          createdAt: new Date().toISOString()
        });
      },
      move ? "Asset deplace" : "Asset colle",
      targetDir || "Racine",
      move ? "Deplacement impossible" : "Collage impossible"
    );
  };

  const handleSaveAssetConfiguration = async (
    assetRoots: string[],
    assetTypePresets: AssetTypePreset[],
    assetNamingRules: AssetNamingRules
  ) => {
    if (!project?.projectRoot) {
      setOperationMessage({
        tone: "error",
        title: "Configuration non enregistree",
        detail: "Le projet courant n'a pas de dossier source charge."
      });
      return;
    }

    await runAssetMutation(
      () =>
        saveAssetConfiguration({
          projectRoot: project.projectRoot!,
          assetRoots,
          assetTypePresets,
          assetNamingRules
        }),
      "Configuration assets enregistree",
      `${assetRoots.length} racine(s), ${assetTypePresets.length} type(s)`,
      "Configuration non enregistree"
    );
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
    openProjectContentPath,
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
    setShowBlenderCommandPrompt,
    setUnityPathInput,
    handleRenameAsset,
    handleMoveAsset,
    handleMoveFolder,
    handleDeleteAsset,
    handleSetAssetOwners,
    handleUpdateAssetNotes,
    handleSetAssignees,
    handleCreateFolder,
    handleAddAssetFiles,
    handleCreateAsset,
    handleDeleteFolder,
    handleRenameFolder,
    handleDuplicateAsset,
    handlePasteAsset,
    handleSetLods,
    handleSetVariants,
    handleSaveAssetConfiguration,
    shortcutBindings,
    updateShortcut,
    resetShortcuts,
    shellStyle,
    toolsSnapshot,
    unityPathInput,
    userSettings,
    chooseCreateProjectDirectory,
    chooseProjectDirectory,
    changeAssetStatus
  };
}
