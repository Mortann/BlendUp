export type GameEngine = "godot" | "unity";

export type AssetExportStatus = "ready" | "exported" | "outdated" | "error";

export interface BlendUpProject {
  schemaVersion: 2;
  kind: "project";
  projectId: string;
  name: string;
  engine: GameEngine;
  paths: {
    artRoot: string;
    engineRoot: string;
    engineAssetsRoot: string;
  };
}

export interface BlendUpAsset {
  id: string;
  name: string;
  folder: string;
  sourcePath: string;
  outputPath: string;
  format: "fbx" | "glb";
  status: AssetExportStatus;
  sourceModifiedAt?: string;
  outputModifiedAt?: string;
  lastError?: string;
}

export interface BlendUpProblem {
  id: string;
  severity: "info" | "warning" | "error";
  source: "blendup" | "blender";
  assetId?: string;
  title: string;
  detail: string;
  actionLabel?: "Exporter" | "Ouvrir";
}

export interface ProjectSnapshot {
  projectRoot: string;
  project: BlendUpProject;
  assets: BlendUpAsset[];
  problems: BlendUpProblem[];
}

export interface UserSettings {
  schemaVersion: 2;
  kind: "user_settings";
  lastProjectRoot: string | null;
  recentProjects: string[];
  blenderPath: string | null;
  showBlenderCommandPrompt: boolean;
}

export interface ToolDetection {
  found: boolean;
  path?: string;
  message: string;
}

export interface CreateProjectOptions {
  projectRoot: string;
  projectName: string;
  engine: GameEngine;
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

export interface UpdateProjectEngineResult {
  project: BlendUpProject;
  message: string;
}
