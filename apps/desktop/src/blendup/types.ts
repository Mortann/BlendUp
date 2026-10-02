export type GameEngine = "none" | "godot" | "unity";

export type AssetExportStatus = "local" | "ready" | "exported" | "outdated" | "error";

export type AssetVersionStatus = AssetExportStatus | "missing";

export interface BlenderProjectSettings {
  applyTransformsOnSave: boolean;
  unwrapOnSave: boolean;
  validateUvs: boolean;
  minimumUvScore: number;
  allowUvOverlap: boolean;
}

export const defaultBlenderProjectSettings: BlenderProjectSettings = {
  applyTransformsOnSave: false, unwrapOnSave: false, validateUvs: false,
  minimumUvScore: 70, allowUvOverlap: false
};

export interface UvObjectMetrics {
  objectName: string;
  score: number;
  triangleCount: number;
  missingUvTriangles: number;
  degenerateTriangles: number;
  validUvPercent: number;
  stretchScore: number;
  densityScore: number;
  overlapPercent: number;
  markedSeams: number;
  uvCuts: number;
  unusedSeams: number;
  unmarkedCuts: number;
}

export interface UvQualitySummary {
  ignored?: boolean;
  score: number;
  complete: boolean;
  stale: boolean;
  blocked: boolean;
  minimumScore: number;
  checkedAt: string;
  error?: string;
  objects: UvObjectMetrics[];
  issues: string[];
  preparationWarnings: string[];
}

export interface AssetVariant {
  id: string;
  name: string;
  status: AssetVersionStatus;
  sourcePath?: string;
  outputPath?: string;
  sourceModifiedAt?: string;
  outputModifiedAt?: string;
  notes: string;
  uvQuality?: UvQualitySummary;
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
  uvQuality?: UvQualitySummary;
}

export interface AssetMetadata {
  ignoreUvValidation?: boolean;
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
  blender: BlenderProjectSettings;
  paths: {
    artRoot: string;
    engineRoot?: string;
    engineAssetsRoot?: string;
  };
}

export interface BlendUpAsset {
  id: string;
  name: string;
  folder: string;
  sourcePath: string;
  /** Engine export, or a disposable local preview cache when status is local. */
  outputPath: string;
  format: "fbx" | "glb";
  status: AssetExportStatus;
  sourceModifiedAt?: string;
  outputModifiedAt?: string;
  lastError?: string;
  sizeBytes: number;
  metadata: AssetMetadata;
  uvQuality?: UvQualitySummary;
}

export interface BlendUpProblem {
  id: string;
  severity: "info" | "warning" | "error";
  source: "blendup" | "blender";
  assetId?: string;
  title: string;
  detail: string;
  actionLabel?: "Exporter" | "Ouvrir" | "Vérifier";
  category?: "uv" | "export" | "project";
  versionLabel?: string;
  score?: number;
  minimumScore?: number;
  technicalDetails?: string;
}

export interface ProjectSnapshot {
  projectRoot: string;
  project: BlendUpProject;
  assetFolders: string[];
  assets: BlendUpAsset[];
  problems: BlendUpProblem[];
  showcases?: FolderShowcase[];
  integrations?: EditorIntegrations;
}

export interface FolderShowcase {
  id: string; folder: string; spacing: number;
  status: "ready" | "outdated" | "generating" | "error";
  assetCount: number; includedCount: number; godotCount: number;
  blenderPath: string; godotPath?: string; error?: string;
}

export interface EditorIntegrations {
  blender: boolean; godot: boolean; libraryCount: number;
  libraryStatus: "ready" | "generating" | "error" | "";
  libraryErrors: { name: string; error: string }[];
}

export interface UserSettings {
  schemaVersion: 2;
  kind: "user_settings";
  lastProjectRoot: string | null;
  recentProjects: string[];
  blenderPath: string | null;
  showBlenderCommandPrompt: boolean;
  openAssetAfterCreation: boolean;
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
  asset?: BlendUpAsset;
  message: string;
  assetId?: string;
}
