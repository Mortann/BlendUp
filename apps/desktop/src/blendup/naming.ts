// Nomenclature des assets : pattern {prefix}_{name}_{index} (ex: ENV_Rock_01).
// BlendUp affiche le "coeur" (Rock) mais conserve le nom technique complet sur disque.

export const ASSET_PREFIXES = ["PROP", "ENV", "CHR", "MAT", "TEX", "UI", "FX"] as const;

import type { AssetTypePreset } from "./types";

// Catalogue des types "connus" : token canonique -> prefixe + libelle affiche.
const KNOWN_TYPE_META: Record<string, { prefix: string; label: string }> = {
  static_mesh: { prefix: "PROP", label: "Static Mesh" },
  prop: { prefix: "PROP", label: "Prop" },
  environment_piece: { prefix: "ENV", label: "Environment" },
  material: { prefix: "MAT", label: "Material" },
  texture: { prefix: "TEX", label: "Texture" },
  ui_image: { prefix: "UI", label: "UI Image" },
  character: { prefix: "CHR", label: "Character" }
};

// Synonymes de noms de dossiers -> token de type canonique connu.
const CATEGORY_SYNONYMS: Record<string, string> = {
  environment: "environment_piece",
  environnement: "environment_piece",
  env: "environment_piece",
  environments: "environment_piece",
  prop: "prop",
  props: "prop",
  accessoire: "prop",
  accessoires: "prop",
  character: "character",
  characters: "character",
  personnage: "character",
  personnages: "character",
  chr: "character",
  material: "material",
  materials: "material",
  materiau: "material",
  materiaux: "material",
  texture: "texture",
  textures: "texture",
  tex: "texture",
  ui: "ui_image",
  interface: "ui_image",
  hud: "ui_image"
};

export const TYPE_PREFIX: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_TYPE_META).map(([type, meta]) => [type, meta.prefix])
);

function slugType(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Nom de dossier (categorie) -> token de type. Connu => canonique ; sinon => slug du nom.
export function categoryToType(folderName: string, presets: AssetTypePreset[] = []): string {
  const lower = folderName.trim().toLowerCase();
  const preset = presets.find((item) =>
    [item.id, item.displayName, ...(item.categoryNames ?? [])]
      .map((value) => value.trim().toLowerCase())
      .includes(lower)
  );

  if (preset) {
    return preset.id;
  }

  return CATEGORY_SYNONYMS[lower] ?? slugType(folderName) ?? "prop";
}

// Prefixe de nomenclature pour un type (connu ou dynamique).
export function prefixForType(type: string, presets: AssetTypePreset[] = []): string {
  const preset = presets.find((item) => item.id === type);
  if (preset?.prefix) {
    return preset.prefix.toUpperCase();
  }

  const known = KNOWN_TYPE_META[type];
  if (known) {
    return known.prefix;
  }
  const letters = type.replace(/[^a-zA-Z0-9]/g, "");
  return (letters.slice(0, 3) || "AST").toUpperCase();
}

// Libelle affiche pour un type (connu => joli libelle ; sinon => nom capitalise).
export function labelForType(type: string, presets: AssetTypePreset[] = []): string {
  const preset = presets.find((item) => item.id === type);
  if (preset?.displayName) {
    return preset.displayName;
  }

  const known = KNOWN_TYPE_META[type];
  if (known) {
    return known.label;
  }
  const label = type
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return label || type;
}

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

export function renamePrefix(currentName: string, type: string, presets: AssetTypePreset[] = []): string {
  const parsed = parseAssetName(currentName);
  const prefix = prefixForType(type, presets);

  return `${prefix}_${parsed.core || currentName}${parsed.index || "_01"}`;
}

// Construit un nom technique a la creation a partir d'un type, d'un coeur et d'un index.
export function buildAssetName(type: string, core: string, index = "_01", presets: AssetTypePreset[] = []): string {
  return `${prefixForType(type, presets)}_${sanitizeCore(core)}${index}`;
}
