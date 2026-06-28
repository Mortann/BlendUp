// Nomenclature des assets : pattern {prefix}_{name}_{index} (ex: ENV_Rock_01).
// BlendUp affiche le "coeur" (Rock) mais conserve le nom technique complet sur disque.

import type { AssetType } from "./types";

export const ASSET_PREFIXES = ["PROP", "ENV", "CHR", "MAT", "TEX", "UI", "FX"] as const;

export const TYPE_PREFIX: Record<AssetType, string> = {
  static_mesh: "PROP",
  prop: "PROP",
  environment_piece: "ENV",
  material: "MAT",
  texture: "TEX",
  ui_image: "UI",
  character: "CHR"
};

const NAME_PATTERN = /^([A-Z]{2,})_(.+?)(_\d+)?$/;

export function parseAssetName(name: string): { prefix: string; core: string; index: string } {
  const match = NAME_PATTERN.exec(name);

  if (!match) {
    return { prefix: "", core: name, index: "" };
  }

  return { prefix: match[1], core: match[2], index: match[3] ?? "" };
}

// Label court affiche dans l'interface (le "coeur" du nom technique).
export function assetLabel(name: string): string {
  return parseAssetName(name).core || name;
}

function sanitizeCore(core: string): string {
  return core.trim().replace(/\s+/g, "");
}

// Reconstruit le nom technique en changeant uniquement le coeur (prefixe + index conserves).
export function renameCore(currentName: string, newCore: string): string {
  const parsed = parseAssetName(currentName);
  const core = sanitizeCore(newCore);

  return parsed.prefix ? `${parsed.prefix}_${core}${parsed.index}` : `${core}${parsed.index}`;
}

// Construit un nom technique a la creation a partir d'un type, d'un coeur et d'un index.
export function buildAssetName(type: AssetType, core: string, index = "_01"): string {
  const prefix = TYPE_PREFIX[type] ?? "PROP";
  return `${prefix}_${sanitizeCore(core)}${index}`;
}
