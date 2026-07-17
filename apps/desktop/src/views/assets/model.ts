export type AssetDisplayMode = "grid" | "list" | "compact";
export type AssetSortMode = "name" | "recent" | "status" | "size";
export type AssetQuickFilter = "all" | "favorites" | "pending" | "outdated" | "errors" | "exported";
export type AssetThumbSize = "small" | "medium" | "large";

export interface AssetExplorerSettings {
  displayMode: AssetDisplayMode;
  sortMode: AssetSortMode;
  thumbnailSize: AssetThumbSize;
  hideEmptyFolders: boolean;
}

export const defaultAssetExplorerSettings: AssetExplorerSettings = {
  displayMode: "grid",
  sortMode: "recent",
  thumbnailSize: "medium",
  hideEmptyFolders: false
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

export type AssetDialogState =
  | { kind: "createAsset"; parent: string }
  | { kind: "createFolder"; parent: string }
  | { kind: "renameAsset"; assetId: string; initialValue: string }
  | { kind: "renameFolder"; folder: string; initialValue: string }
  | { kind: "moveAsset"; assetId: string }
  | { kind: "moveFolder"; folder: string }
  | null;
