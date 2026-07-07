import { defaultAssetSettings, type AssetSettings } from "./model";

export function loadAssetExplorerPath(projectId: string) {
  try {
    return window.localStorage.getItem(scopedPreferenceKey("asset-explorer-path", projectId));
  } catch {
    return null;
  }
}

export function saveAssetExplorerPath(projectId: string, path: string) {
  try {
    window.localStorage.setItem(scopedPreferenceKey("asset-explorer-path", projectId), path);
  } catch {
    // Preference locale non critique.
  }
}

export function loadAssetFavorites(projectId: string) {
  try {
    const value = window.localStorage.getItem(scopedPreferenceKey("asset-favorites", projectId));
    const parsed = value ? JSON.parse(value) : [];

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveAssetFavorites(projectId: string, assetIds: string[]) {
  try {
    window.localStorage.setItem(scopedPreferenceKey("asset-favorites", projectId), JSON.stringify(assetIds));
  } catch {
    // Preference locale non critique.
  }
}

export function loadAssetSettings(projectId: string): AssetSettings {
  try {
    const raw = window.localStorage.getItem(scopedPreferenceKey("asset-settings", projectId));

    if (!raw) {
      return defaultAssetSettings;
    }

    return { ...defaultAssetSettings, ...(JSON.parse(raw) as Partial<AssetSettings>) };
  } catch {
    return defaultAssetSettings;
  }
}

export function saveAssetSettings(projectId: string, settings: AssetSettings) {
  try {
    window.localStorage.setItem(scopedPreferenceKey("asset-settings", projectId), JSON.stringify(settings));
  } catch {
    // Preference locale non critique.
  }
}

export function loadRecentFolders(projectId: string): string[] {
  try {
    const raw = window.localStorage.getItem(scopedPreferenceKey("asset-recent-folders", projectId));
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentFolders(projectId: string, folders: string[]) {
  try {
    window.localStorage.setItem(
      scopedPreferenceKey("asset-recent-folders", projectId),
      JSON.stringify(folders.slice(0, 5))
    );
  } catch {
    // Preference locale non critique.
  }
}

function scopedPreferenceKey(key: string, projectId: string) {
  return `blendup:${projectId}:${key}`;
}
