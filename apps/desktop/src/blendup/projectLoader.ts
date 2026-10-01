import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { demoProjectSnapshot, standaloneDemoProjectSnapshot } from "./demoSnapshot";
import type {
  AssetLod,
  AssetMutationResult,
  AssetVariant,
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
const activeDemoSnapshot = new URLSearchParams(window.location.search).get("demo") === "3d"
  ? standaloneDemoProjectSnapshot : demoProjectSnapshot;

function isBrowserDemo(projectRoot?: string): boolean {
  return import.meta.env.DEV
    && ["1", "3d"].includes(new URLSearchParams(window.location.search).get("demo") ?? "")
    && (!projectRoot || projectRoot === activeDemoSnapshot.projectRoot);
}

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
  if (isBrowserDemo(trimmed)) return activeDemoSnapshot;
  return invoke<ProjectSnapshot>("read_project_snapshot", { projectRoot: trimmed });
}

export async function loadDefaultProjectSnapshot(): Promise<ProjectSnapshot> {
  if (isBrowserDemo()) return activeDemoSnapshot;
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

export async function generateAssetPreview(options: {
  assetId: string;
  blenderPath?: string;
  projectRoot: string;
}): Promise<ExportAssetResult> {
  return invoke<ExportAssetResult>("generate_asset_preview", {
    assetId: options.assetId,
    blenderPath: options.blenderPath?.trim() || null,
    projectRoot: options.projectRoot
  });
}

export async function exportAssetVersion(options: {
  assetId: string;
  blenderPath?: string;
  projectRoot: string;
  versionId: string;
  versionKind: "variant" | "lod";
}): Promise<ExportAssetResult> {
  return invoke<ExportAssetResult>("export_asset_version", {
    assetId: options.assetId,
    blenderPath: options.blenderPath?.trim() || null,
    projectRoot: options.projectRoot,
    versionId: options.versionId,
    versionKind: options.versionKind
  });
}

export async function exportAssetVersions(options: {
  assetId: string;
  blenderPath?: string;
  projectRoot: string;
}): Promise<ExportAssetResult> {
  return invoke<ExportAssetResult>("export_asset_versions", {
    assetId: options.assetId,
    blenderPath: options.blenderPath?.trim() || null,
    projectRoot: options.projectRoot
  });
}

export async function clearAssetExports(projectRoot: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("clear_asset_exports", { projectRoot });
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

export interface ProjectImageFile {
  path: string;
  name: string;
  modifiedAt?: string;
}

export async function readProjectFileDataUrl(projectRoot: string, relativePath?: string): Promise<string> {
  if (!relativePath?.trim()) return "";
  if (isBrowserDemo(projectRoot)) return "";
  return invoke<string>("read_project_file_data_url", { projectRoot, relativePath: relativePath.trim() });
}

export async function listProjectImages(projectRoot: string, relativeDir?: string): Promise<ProjectImageFile[]> {
  if (!relativeDir?.trim()) return [];
  if (isBrowserDemo(projectRoot)) return [];
  return invoke<ProjectImageFile[]>("list_project_images", { projectRoot, relativeDir: relativeDir.trim() });
}

export async function selectImageFiles(): Promise<string[]> {
  const selected = await open({
    directory: false,
    multiple: true,
    title: "Choisir des images",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "tga"] }]
  });
  if (!selected) return [];
  return (Array.isArray(selected) ? selected : [selected]).filter((item): item is string => typeof item === "string");
}

export async function createFolder(projectRoot: string, parentDir: string, name: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("create_folder", { projectRoot, parentDir, name });
}

export async function createAsset(options: {
  blenderPath?: string;
  name: string;
  parentDir: string;
  projectRoot: string;
}): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("create_asset", {
    blenderPath: options.blenderPath?.trim() || null,
    name: options.name,
    parentDir: options.parentDir,
    projectRoot: options.projectRoot
  });
}

export async function organizeAsset(projectRoot: string, assetId: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("organize_asset", { projectRoot, assetId });
}

export async function createAssetVariant(
  projectRoot: string,
  assetId: string,
  name: string
): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("create_asset_variant", { projectRoot, assetId, name });
}

export async function generateAssetLods(options: {
  assetId: string;
  blenderPath?: string;
  projectRoot: string;
}): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("generate_asset_lods", {
    assetId: options.assetId,
    blenderPath: options.blenderPath?.trim() || null,
    projectRoot: options.projectRoot
  });
}

export async function deleteAssetVersion(
  projectRoot: string,
  assetId: string,
  versionId: string,
  versionKind: "variant" | "lod"
): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("delete_asset_version", {
    projectRoot,
    assetId,
    versionId,
    versionKind
  });
}

export async function renameAsset(projectRoot: string, assetId: string, newName: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("rename_asset", { projectRoot, assetId, newName });
}

export async function moveAsset(projectRoot: string, assetId: string, targetDir: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("move_asset", { projectRoot, assetId, targetDir });
}

export async function copyAsset(
  projectRoot: string,
  assetId: string,
  targetDir: string,
  move: boolean
): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("copy_asset", { projectRoot, assetId, targetDir, moveAssetFile: move });
}

export async function duplicateAsset(projectRoot: string, assetId: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("duplicate_asset", { projectRoot, assetId });
}

export async function deleteAsset(projectRoot: string, assetId: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("delete_asset", { projectRoot, assetId });
}

export async function renameFolder(projectRoot: string, folder: string, newName: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("rename_folder", { projectRoot, folder, newName });
}

export async function moveFolder(projectRoot: string, folder: string, targetDir: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("move_folder", { projectRoot, folder, targetDir });
}

export async function deleteFolder(projectRoot: string, folder: string): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("delete_folder", { projectRoot, folder });
}

export async function updateAssetMetadata(options: {
  assetId: string;
  lods: AssetLod[];
  notes: string;
  projectRoot: string;
  tags: string[];
  variants: AssetVariant[];
}): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("update_asset_metadata", options);
}

export async function setAssetThumbnail(
  projectRoot: string,
  assetId: string,
  sourcePath: string
): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("set_asset_thumbnail", { projectRoot, assetId, sourcePath });
}

export async function addAssetImages(
  projectRoot: string,
  assetId: string,
  kind: "renders" | "textures",
  sourcePaths: string[]
): Promise<AssetMutationResult> {
  return invoke<AssetMutationResult>("add_asset_images", { projectRoot, assetId, kind, sourcePaths });
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
