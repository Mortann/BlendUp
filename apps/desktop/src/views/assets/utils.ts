import type { AssetExportStatus, BlendUpAsset } from "../../blendup/types";
import type { AssetQuickFilter, AssetSortMode } from "./model";

export function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export function parentPath(path: string) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
}

export function baseName(path: string) {
  return normalizePath(path).split("/").pop() ?? path;
}

export function directChildFolders(folders: string[], currentPath: string) {
  const current = normalizePath(currentPath);
  return folders
    .map(normalizePath)
    .filter((folder) => folder !== current && parentPath(folder) === current)
    .sort((left, right) => left.localeCompare(right));
}

export function breadcrumbParts(path: string) {
  const parts = normalizePath(path).split("/").filter(Boolean);
  return parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join("/") }));
}

export function assetMatchesFilter(asset: BlendUpAsset, filter: AssetQuickFilter, favorites: string[]) {
  if (filter === "favorites") return favorites.includes(asset.id);
  if (filter === "pending") return asset.status === "ready" || asset.status === "outdated";
  if (filter === "outdated") return asset.status === "outdated";
  if (filter === "errors") return asset.status === "error";
  if (filter === "exported") return asset.status === "exported";
  return true;
}

export function sortAssets(assets: BlendUpAsset[], mode: AssetSortMode) {
  return [...assets].sort((left, right) => {
    if (mode === "name") return left.name.localeCompare(right.name);
    if (mode === "size") return right.sizeBytes - left.sizeBytes;
    if (mode === "status") return statusOrder(left.status) - statusOrder(right.status) || left.name.localeCompare(right.name);
    return Number(right.sourceModifiedAt ?? 0) - Number(left.sourceModifiedAt ?? 0);
  });
}

function statusOrder(status: AssetExportStatus) {
  return ({ error: 0, outdated: 1, ready: 2, exported: 3 } as const)[status];
}

export function statusLabel(status: AssetExportStatus) {
  return ({ error: "Erreur", outdated: "À réexporter", ready: "Prêt", exported: "À jour" } as const)[status];
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatTimestamp(value?: string) {
  if (!value) return "Jamais";
  const timestamp = Number(value) * 1000;
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : value;
}

export function folderAssetCount(assets: BlendUpAsset[], folder: string) {
  const normalized = normalizePath(folder);
  return assets.filter((asset) => asset.folder === normalized || asset.folder.startsWith(`${normalized}/`)).length;
}
