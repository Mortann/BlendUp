import { blendUpTestSnapshot } from "../fixtures/blendUpTest";
import type {
  AssetStatus,
  CreateProjectOptions,
  CreateProjectResult,
  LocalToolsSnapshot,
  OpenRequest,
  ProjectSnapshot,
  UserSettings
} from "./types";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const userSettingsStorageKey = "blendup:user-settings";

export const defaultUserSettings: UserSettings = {
  schemaVersion: 1,
  kind: "user_settings",
  lastProjectRoot: null,
  recentProjects: [],
  blenderPath: null,
  unityPath: null,
  pureRefPath: null
};

export async function loadProjectSnapshot(projectRoot?: string): Promise<ProjectSnapshot> {
  const trimmedProjectRoot = projectRoot?.trim();

  if (!trimmedProjectRoot) {
    throw new Error("Aucun chemin projet n'a ete fourni.");
  }

  try {
    return await invoke<ProjectSnapshot>("read_project_snapshot", {
      projectRoot: trimmedProjectRoot
    });
  } catch (error) {
    if (isBlendUpTestPath(trimmedProjectRoot)) {
      console.warn("BlendUp uses the local demo snapshot because Tauri data is not available.", error);
      return {
        ...blendUpTestSnapshot,
        projectRoot: trimmedProjectRoot
      };
    }

    throw error;
  }
}

export async function loadDefaultProjectSnapshot(): Promise<ProjectSnapshot> {
  try {
    return await invoke<ProjectSnapshot>("read_default_project_snapshot");
  } catch (error) {
    console.warn("BlendUp uses the local demo snapshot because Tauri data is not available.", error);
    return blendUpTestSnapshot;
  }
}

export async function loadUserSettings(): Promise<UserSettings> {
  try {
    return normalizeUserSettings(await invoke<UserSettings>("read_user_settings"));
  } catch (error) {
    const storedSettings = window.localStorage.getItem(userSettingsStorageKey);

    if (!storedSettings) {
      return defaultUserSettings;
    }

    try {
      return normalizeUserSettings(JSON.parse(storedSettings) as UserSettings);
    } catch {
      console.warn("BlendUp could not read local browser settings.", error);
      return defaultUserSettings;
    }
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const normalizedSettings = normalizeUserSettings(settings);

  try {
    return normalizeUserSettings(await invoke<UserSettings>("save_user_settings", { settings: normalizedSettings }));
  } catch {
    window.localStorage.setItem(userSettingsStorageKey, JSON.stringify(normalizedSettings));
    return normalizedSettings;
  }
}

export async function takeOpenRequest(projectRoot: string): Promise<OpenRequest | null> {
  const trimmedProjectRoot = projectRoot.trim();

  if (!trimmedProjectRoot) {
    return null;
  }

  try {
    return (await invoke<OpenRequest | null>("take_open_request", { projectRoot: trimmedProjectRoot })) ?? null;
  } catch {
    return null;
  }
}

export async function selectProjectDirectory(): Promise<string | null> {
  const selectedDirectory = await open({
    directory: true,
    multiple: false,
    title: "Choisir un dossier projet BlendUp"
  });

  return typeof selectedDirectory === "string" ? selectedDirectory : null;
}

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  return invoke<CreateProjectResult>("create_project", {
    options: {
      projectRoot: options.projectRoot.trim(),
      projectName: options.projectName.trim(),
      createUnityFolders: options.createUnityFolders,
      createGitignore: options.createGitignore
    }
  });
}

export async function detectLocalTools(options: {
  blenderPath?: string;
  pureRefPath?: string;
  unityPath?: string;
}): Promise<LocalToolsSnapshot> {
  try {
    return await invoke<LocalToolsSnapshot>("detect_local_tools", {
      blenderPath: options.blenderPath?.trim() || null,
      pureRefPath: options.pureRefPath?.trim() || null,
      unityPath: options.unityPath?.trim() || null
    });
  } catch {
    return {
      blender: fallbackToolDetection("Blender", options.blenderPath),
      unity: fallbackToolDetection("Unity", options.unityPath),
      pureRef: fallbackToolDetection("PureRef", options.pureRefPath)
    };
  }
}

export async function openProjectPath(projectRoot: string, relativePath?: string): Promise<void> {
  if (!relativePath?.trim()) {
    throw new Error("Aucun chemin de fichier n'est associe a cet element.");
  }

  await invoke("open_project_path", {
    projectRoot,
    relativePath: relativePath.trim()
  });
}

export async function updateAssetStatus(options: {
  actor: string;
  assetId: string;
  projectRoot: string;
  status: AssetStatus;
  updatedAt: string;
}): Promise<void> {
  await invoke("update_asset_status", {
    actor: options.actor,
    assetId: options.assetId,
    projectRoot: options.projectRoot,
    status: options.status,
    updatedAt: options.updatedAt
  });
}

export function rememberProjectInSettings(settings: UserSettings, projectRoot: string): UserSettings {
  const trimmedProjectRoot = projectRoot.trim();
  const recentProjects = [
    trimmedProjectRoot,
    ...settings.recentProjects.filter((project) => project !== trimmedProjectRoot)
  ].slice(0, 8);

  return normalizeUserSettings({
    ...settings,
    lastProjectRoot: trimmedProjectRoot,
    recentProjects
  });
}

function fallbackToolDetection(label: string, path?: string): LocalToolsSnapshot["blender"] {
  const trimmedPath = path?.trim();

  return {
    found: Boolean(trimmedPath),
    path: trimmedPath || undefined,
    message: trimmedPath
      ? `${label}: chemin renseigne, validation native indisponible hors Tauri.`
      : `${label}: validation native indisponible hors Tauri.`
  };
}

function normalizeUserSettings(settings: Partial<UserSettings>): UserSettings {
  const recentProjects = Array.from(
    new Set((settings.recentProjects ?? []).map((project) => project.trim()).filter(Boolean))
  ).slice(0, 8);
  const lastProjectRoot = normalizeOptionalPath(settings.lastProjectRoot);

  if (lastProjectRoot && !recentProjects.includes(lastProjectRoot)) {
    recentProjects.unshift(lastProjectRoot);
  }

  return {
    schemaVersion: 1,
    kind: "user_settings",
    lastProjectRoot,
    recentProjects: recentProjects.slice(0, 8),
    blenderPath: normalizeOptionalPath(settings.blenderPath),
    unityPath: normalizeOptionalPath(settings.unityPath),
    pureRefPath: normalizeOptionalPath(settings.pureRefPath)
  };
}

function normalizeOptionalPath(value?: string | null): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

function isBlendUpTestPath(projectRoot: string): boolean {
  const normalizedPath = projectRoot.replaceAll("\\", "/");

  return normalizedPath.endsWith("/BlendUpTest") || normalizedPath.endsWith("/BlendUp_projet_Test");
}
