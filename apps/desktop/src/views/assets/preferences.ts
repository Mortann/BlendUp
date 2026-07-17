import { defaultAssetExplorerSettings, type AssetExplorerSettings } from "./model";

function key(projectId: string, name: string) {
  return `blendup:${projectId}:assets:${name}`;
}

export function loadExplorerSettings(projectId: string): AssetExplorerSettings {
  try {
    const raw = window.localStorage.getItem(key(projectId, "settings"));
    return raw ? { ...defaultAssetExplorerSettings, ...(JSON.parse(raw) as Partial<AssetExplorerSettings>) } : defaultAssetExplorerSettings;
  } catch {
    return defaultAssetExplorerSettings;
  }
}

export function saveExplorerSettings(projectId: string, settings: AssetExplorerSettings) {
  try {
    window.localStorage.setItem(key(projectId, "settings"), JSON.stringify(settings));
  } catch {
    // Préférence locale non critique.
  }
}

export function loadFavorites(projectId: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(projectId, "favorites")) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveFavorites(projectId: string, favorites: string[]) {
  try {
    window.localStorage.setItem(key(projectId, "favorites"), JSON.stringify(favorites));
  } catch {
    // Préférence locale non critique.
  }
}

export function loadExplorerPath(projectId: string): string | null {
  try {
    return window.localStorage.getItem(key(projectId, "path"));
  } catch {
    return null;
  }
}

export function saveExplorerPath(projectId: string, path: string) {
  try {
    window.localStorage.setItem(key(projectId, "path"), path);
  } catch {
    // Préférence locale non critique.
  }
}

export function loadRecentFolders(projectId: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(projectId, "recent-folders")) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function saveRecentFolders(projectId: string, folders: string[]) {
  try {
    window.localStorage.setItem(key(projectId, "recent-folders"), JSON.stringify(folders.slice(0, 5)));
  } catch {
    // Préférence locale non critique.
  }
}
