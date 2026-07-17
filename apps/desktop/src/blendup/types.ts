export type GameEngine = "godot" | "unity";

export type AssetExportStatus = "ready" | "exported" | "outdated" | "error";

export type AssetVersionStatus = AssetExportStatus | "missing";

export interface AssetVariant {
  id: string;
  name: string;
  status: AssetVersionStatus;
  sourcePath?: string;
  outputPath?: string;
  sourceModifiedAt?: string;
  outputModifiedAt?: string;
  notes: string;
}

export interface AssetLod {
  id: string;
  level: string;
  status: AssetVersionStatus;
  targetRatio?: number;
  triangleBudget?: number;
  generated: boolean;
  sourcePath?: string;
  outputPath?: string;
  sourceModifiedAt?: string;
  outputModifiedAt?: string;
  notes: string;
}

export interface AssetMetadata {
  notes: string;
  tags: string[];
  thumbnailPath?: string;
  variants: AssetVariant[];
  lods: AssetLod[];
}

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
  sizeBytes: number;
  metadata: AssetMetadata;
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
  assetFolders: string[];
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

export interface AssetMutationResult {
  message: string;
  assetId?: string;
}
