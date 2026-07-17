import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CreateProjectOptions,
  CreateProjectResult,
  ExportAssetResult,
  GameEngine,
  ProjectSnapshot,
  ToolDetection,
  UpdateProjectEngineResult,
  UserSettings
} from "./types";

const userSettingsStorageKey = "blendup:user-settings";

export const defaultUserSettings: UserSettings = {
  schemaVersion: 2,
  kind: "user_settings",
  lastProjectRoot: null,
  recentProjects: [],
  blenderPath: null,
  showBlenderCommandPrompt: false
};

export async function loadProjectSnapshot(projectRoot: string): Promise<ProjectSnapshot> {
  const trimmed = projectRoot.trim();
  if (!trimmed) throw new Error("Choisis un dossier projet BlendUp.");
  return invoke<ProjectSnapshot>("read_project_snapshot", { projectRoot: trimmed });
}

export async function loadDefaultProjectSnapshot(): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>("read_default_project_snapshot");
}

export async function loadUserSettings(): Promise<UserSettings> {
  try {
    return normalizeUserSettings(await invoke<UserSettings>("read_user_settings"));
  } catch {
    const stored = window.localStorage.getItem(userSettingsStorageKey);
    if (!stored) return defaultUserSettings;
    try {
      return normalizeUserSettings(JSON.parse(stored) as Partial<UserSettings>);
    } catch {
      return defaultUserSettings;
    }
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const normalized = normalizeUserSettings(settings);
  try {
    return normalizeUserSettings(await invoke<UserSettings>("save_user_settings", { settings: normalized }));
  } catch {
    window.localStorage.setItem(userSettingsStorageKey, JSON.stringify(normalized));
    return normalized;
  }
}

export async function selectProjectDirectory(title = "Choisir un dossier"): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === "string" ? selected : null;
}

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  return invoke<CreateProjectResult>("create_project", {
    options: {
      projectRoot: options.projectRoot.trim(),
      projectName: options.projectName.trim(),
      engine: options.engine
    }
  });
}

export async function updateProjectEngine(
  projectRoot: string,
  engine: GameEngine
): Promise<UpdateProjectEngineResult> {
  return invoke<UpdateProjectEngineResult>("update_project_engine", { projectRoot, engine });
}

export async function detectBlender(blenderPath?: string): Promise<ToolDetection> {
  return invoke<ToolDetection>("detect_blender", { blenderPath: blenderPath?.trim() || null });
}

export async function exportAsset(options: {
  assetId: string;
  blenderPath?: string;
  projectRoot: string;
}): Promise<ExportAssetResult> {
  return invoke<ExportAssetResult>("export_asset", {
    assetId: options.assetId,
    blenderPath: options.blenderPath?.trim() || null,
    projectRoot: options.projectRoot
  });
}

export async function openProjectPath(projectRoot: string, relativePath: string): Promise<void> {
  return invoke("open_project_path", { projectRoot, relativePath });
}

export async function openBlendFile(options: {
  blenderPath?: string;
  projectRoot: string;
  relativePath: string;
  showCommandPrompt: boolean;
}): Promise<void> {
  return invoke("open_blend_file", {
    blenderPath: options.blenderPath?.trim() || null,
    projectRoot: options.projectRoot,
    relativePath: options.relativePath,
    showCommandPrompt: options.showCommandPrompt
  });
}

export function rememberProject(settings: UserSettings, projectRoot: string): UserSettings {
  return {
    ...settings,
    lastProjectRoot: projectRoot,
    recentProjects: [projectRoot, ...settings.recentProjects.filter((item) => item !== projectRoot)].slice(0, 6)
  };
}

function normalizeUserSettings(settings: Partial<UserSettings>): UserSettings {
  return {
    ...defaultUserSettings,
    ...settings,
    schemaVersion: 2,
    kind: "user_settings",
    recentProjects: Array.isArray(settings.recentProjects)
      ? settings.recentProjects.filter((item): item is string => typeof item === "string").slice(0, 6)
      : []
  };
}
