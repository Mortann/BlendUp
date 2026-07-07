import type { AssetStatus } from "../../blendup/types";
import type { ReactNode } from "react";

export type AssetSortMode = "name" | "recent" | "status";
export type AssetDisplayMode = "grid" | "list" | "compact";
export type AssetQuickFilter = "all" | "favorites" | "todo" | "in_progress" | "review" | "needs_art_fix" | "validated";
export type AssetThumbSize = "small" | "medium" | "large";
export type HistoryTypeFilter = "all" | "status" | "team" | "notes" | "files" | "export" | "other";
export type VisualizationSection = "model" | "render" | "textures";
export type VisualizationBackground = "studio" | "checker" | "dark";
export type ViewerLightMode = "studio" | "soft" | "dramatic";
export type VisualizationNavItem = { id: VisualizationSection; icon: ReactNode; label: string; meta: string };

export interface AssetSettings {
  defaultDisplayMode: AssetDisplayMode;
  thumbnailSize: AssetThumbSize;
  defaultSort: AssetSortMode;
  hideEmptyFolders: boolean;
  showTasks: boolean;
}

export const defaultAssetSettings: AssetSettings = {
  defaultDisplayMode: "grid",
  thumbnailSize: "medium",
  defaultSort: "recent",
  hideEmptyFolders: false,
  showTasks: true
};

export type ContextTarget =
  | { kind: "asset"; assetId: string }
  | { kind: "folder"; path: string }
  | { kind: "background" };

export interface ContextMenuState {
  x: number;
  y: number;
  target: ContextTarget;
}

export type ClipboardEntry = { assetId: string; mode: "copy" | "cut" };

export const artistStatuses: { label: string; status: AssetStatus }[] = [
  { label: "A faire", status: "todo" },
  { label: "En cours", status: "in_progress" },
  { label: "A valider", status: "review" },
  { label: "A retravailler", status: "needs_art_fix" },
  { label: "Valide", status: "validated" }
];

export const ARTIST_STATUS_FILTERS: AssetStatus[] = [
  "todo",
  "in_progress",
  "review",
  "needs_art_fix",
  "validated"
];
