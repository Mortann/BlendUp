export type AssetType =
  | "static_mesh"
  | "prop"
  | "environment_piece"
  | "material"
  | "texture"
  | "ui_image"
  | "character";

export type AssetStatus =
  | "draft"
  | "in_progress"
  | "ready_for_export"
  | "exported"
  | "unity_imported"
  | "needs_art_fix"
  | "needs_dev_fix"
  | "validated"
  | "archived";

export type ProductionMode = "prototype" | "production";

export type ComponentRequirement = "required" | "recommended";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";

export interface BlendUpProject {
  schemaVersion: number;
  kind: "project";
  projectId: string;
  name: string;
  paths: {
    artRoot: string;
    blenderRoot: string;
    referencesRoot: string;
    texturesRoot: string;
    uiRoot?: string;
    unityRoot: string;
    unityAssetsRoot: string;
    unityModelsRoot?: string;
    unityPrefabsRoot?: string;
    unityMaterialsRoot?: string;
  };
  targets: {
    blenderMinimumVersion: string;
    unityMinimumVersion: string;
    unityTestVersion?: string;
  };
  features: {
    git: boolean;
    gitLfs: boolean;
    clickUp: boolean;
    pureRef: boolean;
  };
  defaultView: "artist" | "developer";
}

export interface ExpectedComponent {
  name: string;
  requirement: ComponentRequirement;
  confirmedRemoved: boolean;
}

export interface BlendUpAsset {
  schemaVersion: number;
  kind: "asset";
  id: string;
  displayName: string;
  type: AssetType;
  status: AssetStatus;
  productionMode: ProductionMode;
  owners: {
    artist: string | null;
    developer: string | null;
    reviewer: string | null;
  };
  paths: {
    blenderSource?: string;
    fbxExport?: string;
    unityPrefab?: string;
    thumbnail?: string;
  };
  export: {
    profileId: string | null;
    autoExport: boolean;
    importInUnity: boolean;
    lastExportAt: string | null;
    lastExportStatus: "never_exported" | "success" | "warning" | "error";
  };
  unity: {
    importStatus: "not_imported" | "imported" | "warning" | "error";
    lastImportAt: string | null;
    components: string[];
    expectedComponents: ExpectedComponent[];
    warnings: string[];
  };
  tags: string[];
  references: string[];
  tasks: string[];
  variants: unknown[];
  notes: {
    artist: string;
    developer: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BlendUpProblem {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  source: "blendup" | "blender" | "unity" | "git";
  assetId?: string;
  title: string;
  detail: string;
  actionLabel?: string;
}

export interface BlendUpTask {
  schemaVersion: number;
  kind: "task";
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  owner: string | null;
  assetIds: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitStatusFile {
  status: string;
  path: string;
}

export interface GitStatusSnapshot {
  available: boolean;
  branch?: string;
  files: GitStatusFile[];
  message: string;
}

export interface ProjectSnapshot {
  projectRoot?: string;
  project: BlendUpProject;
  assets: BlendUpAsset[];
  tasks: BlendUpTask[];
  gitStatus: GitStatusSnapshot;
  problems: BlendUpProblem[];
}

export interface UserSettings {
  schemaVersion: number;
  kind: "user_settings";
  lastProjectRoot: string | null;
  recentProjects: string[];
  blenderPath: string | null;
  unityPath: string | null;
  pureRefPath: string | null;
}

export interface ToolDetection {
  found: boolean;
  path?: string;
  message: string;
}

export interface LocalToolsSnapshot {
  blender: ToolDetection;
  unity: ToolDetection;
  pureRef: ToolDetection;
}

export interface CreateProjectOptions {
  projectRoot: string;
  projectName: string;
  createUnityFolders: boolean;
  createGitignore: boolean;
}

export interface CreateProjectResult {
  projectRoot: string;
  message: string;
}

export interface ExportAssetResult {
  success: boolean;
  assetId: string;
  message: string;
  outputPath?: string;
  blenderPath?: string;
  log: string;
}

export interface OpenRequest {
  assetId: string;
  requestedAt: string;
}
