import { convertFileSrc } from "@tauri-apps/api/core";
import { categoryToType } from "../../blendup/naming";
import type { AssetStatus, AssetType, AssetTypePreset, BlendUpAsset, ProjectSnapshot } from "../../blendup/types";
import { loadActiveMemberId, loadTeamMembers, type TeamMember } from "../../app/people";
import { ARTIST_STATUS_FILTERS, artistStatuses, type AssetQuickFilter } from "./model";

export function baseName(path: string | undefined) {
  return normalizeFolderPath(path).split("/").filter(Boolean).pop() ?? "";
}

export function typeForPath(path: string, assetRoots: string[], presets: AssetTypePreset[]): AssetType {
  const normalizedPath = normalizeFolderPath(path);
  const normalizedRoots = assetRoots.map(normalizeFolderPath).filter(Boolean);
  const normalizedRoot =
    normalizedRoots
      .filter((root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`))
      .sort((left, right) => right.length - left.length)[0] ?? normalizedRoots[0] ?? "";
  const relative =
    normalizedRoot && (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`))
      ? normalizedPath.slice(normalizedRoot.length).replace(/^\//, "")
      : normalizedPath;
  const category = relative.split("/").filter(Boolean)[0] ?? "";

  return category ? categoryToType(category, presets) : "prop";
}


export function getAssetRoots(snapshot: ProjectSnapshot) {
  const configured = snapshot.project.assets?.roots?.map(normalizeFolderPath).filter(Boolean) ?? [];

  return configured.length > 0 ? configured : [normalizeFolderPath(snapshot.project.paths.blenderRoot)];
}

export function resolveThumbnailSrc(path: string | undefined, projectRoot: string | undefined, cacheKey?: string) {
  if (!path) {
    return "";
  }

  if (isRenderableThumbnail(path)) {
    return path;
  }

  const normalizedPath = normalizeFolderPath(path);
  const absolutePath = path.match(/^[a-zA-Z]:[\\/]/)
    ? path
    : projectRoot
      ? `${projectRoot.replaceAll("\\", "/")}/${normalizedPath}`
      : "";

  if (!absolutePath) {
    return "";
  }

  try {
    const src = convertFileSrc(absolutePath);
    return cacheKey ? `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}` : src;
  } catch {
    return "";
  }
}

export function breadcrumbParts(path: string, assetRoots: string[]) {
  const normalized = normalizeFolderPath(path);
  const roots = assetRoots.map(normalizeFolderPath).filter(Boolean);
  const root =
    roots
      .filter((candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`))
      .sort((left, right) => right.length - left.length)[0] ?? roots[0] ?? "";
  const rootLabel = root.split("/").filter(Boolean).pop() ?? "Assets";
  const crumbs = [{ label: rootLabel, path: root }];

  const relative =
    root && (normalized === root || normalized.startsWith(`${root}/`))
      ? normalized.slice(root.length).replace(/^\//, "")
      : "";

  let current = root;
  for (const part of relative.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  }

  return crumbs;
}

export function mergeKnownFolders(assetFolders: string[], assets: BlendUpAsset[], assetRoots: string[]) {
  const folders = new Set<string>();

  for (const root of assetRoots) {
    folders.add(normalizeFolderPath(root));
  }

  for (const folder of assetFolders) {
    const normalized = normalizeFolderPath(folder);
    if (normalized) {
      folders.add(normalized);
    }
  }

  for (const asset of assets) {
    const directory = assetDirectory(asset);
    if (directory) {
      folders.add(directory);
    }

    const assetFolderPath = normalizeFolderPath(asset.paths.assetFolder);
    if (assetFolderPath) {
      folders.add(assetFolderPath);
    }
  }

  return Array.from(folders).sort((left, right) => left.localeCompare(right));
}

export function foldersForPath(assets: BlendUpAsset[], folderPaths: string[], path: string) {
  const normalizedPath = normalizeFolderPath(path);
  const folders = new Map<string, { name: string; path: string; assetCount: number }>();

  for (const directory of folderPaths) {
    const isInCurrentBranch =
      normalizedPath === "" || directory === normalizedPath || directory.startsWith(`${normalizedPath}/`);

    if (!isInCurrentBranch || directory === normalizedPath) {
      continue;
    }

    const relative = normalizedPath === "" ? directory : directory.slice(normalizedPath.length + 1);
    const childName = relative.split("/").filter(Boolean)[0];

    if (!childName) {
      continue;
    }

    const childPath = normalizedPath ? `${normalizedPath}/${childName}` : childName;
    if (!folders.has(childPath)) {
      folders.set(childPath, { name: childName, path: childPath, assetCount: 0 });
    }
  }

  for (const asset of assets) {
    const directory = assetDirectory(asset);
    const isInCurrentBranch =
      normalizedPath === "" || directory === normalizedPath || directory.startsWith(`${normalizedPath}/`);

    if (!isInCurrentBranch || directory === normalizedPath) {
      continue;
    }

    const relative = normalizedPath === "" ? directory : directory.slice(normalizedPath.length + 1);
    const childName = relative.split("/").filter(Boolean)[0];

    if (!childName) {
      continue;
    }

    const childPath = normalizedPath ? `${normalizedPath}/${childName}` : childName;
    const existing = folders.get(childPath);

    if (existing) {
      existing.assetCount += 1;
    } else {
      folders.set(childPath, { name: childName, path: childPath, assetCount: 1 });
    }
  }

  return Array.from(folders.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function filterArtistAssets(
  assets: BlendUpAsset[],
  currentPath: string,
  quickFilter: AssetQuickFilter,
  favoriteAssetIds: string[]
) {
  if (quickFilter === "favorites") {
    return assets.filter((asset) => favoriteAssetIds.includes(asset.id));
  }

  if (ARTIST_STATUS_FILTERS.includes(quickFilter as AssetStatus)) {
    return assets.filter((asset) => normalizeArtistStatus(asset.status) === quickFilter);
  }

  const normalizedPath = normalizeFolderPath(currentPath);

  return assets.filter(
    (asset) => assetDirectory(asset) === normalizedPath || normalizeFolderPath(asset.paths.assetFolder) === normalizedPath
  );
}

export function assetDirectory(asset: BlendUpAsset) {
  // Modele dossier : l'emplacement explorer est le parent du dossier de l'asset.
  if (asset.paths.assetFolder) {
    const parts = normalizeFolderPath(asset.paths.assetFolder).split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }

  // Fallback (pre-migration, fichier .blend a plat) : dossier du fichier.
  const preferredPath = asset.paths.blenderSource ?? asset.paths.fbxExport ?? asset.paths.unityPrefab ?? "";
  const parts = normalizeFolderPath(preferredPath).split("/").filter(Boolean);

  parts.pop();

  return parts.join("/");
}

export function normalizeArtistStatus(status: AssetStatus): AssetStatus {
  if (artistStatuses.some((option) => option.status === status)) {
    return status;
  }

  if (status === "ready_for_export" || status === "exported" || status === "unity_imported") {
    return "review";
  }

  if (status === "archived") {
    return "validated";
  }

  return "todo";
}

export function isAssociatedMember(member: TeamMember | undefined, asset: BlendUpAsset) {
  if (!member) {
    return false;
  }

  const owners = assetPeople(asset);

  if (owners.length === 0) {
    return member.roles.includes("artist") || member.roles.includes("art_director");
  }

  return owners.includes(member.name);
}

export function ownerNames(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

export function assetPeople(asset: BlendUpAsset): string[] {
  return Array.from(
    new Set([
      ...ownerNames(asset.owners.artist),
      ...ownerNames(asset.owners.reviewer)
    ])
  );
}

export function getActiveMember(projectId: string) {
  const members = loadTeamMembers(projectId);
  const activeMemberId = loadActiveMemberId(projectId);

  return members.find((member) => member.id === activeMemberId) ?? members[0];
}

export function normalizeFolderPath(path: string | undefined) {
  return (path ?? "").replaceAll("\\", "/").split("/").filter(Boolean).join("/");
}

export function isRenderableThumbnail(path: string) {
  return path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://");
}
