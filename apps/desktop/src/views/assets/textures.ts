export type TextureUsage = "normal" | "color" | "roughness" | "metallic" | "ao" | "height" | "emission" | "opacity" | "packed" | "other";

export const textureLabels: Record<TextureUsage, string> = {
  normal: "Normales", color: "Couleur", roughness: "Rugosité", metallic: "Métal",
  ao: "Occlusion", height: "Relief", emission: "Émission", opacity: "Opacité", packed: "Canaux groupés", other: "Autres"
};

export function textureUsage(name: string): TextureUsage {
  const tokens = name.toLowerCase().replace(/\.[^.]+$/, "").split(/[_.\s-]+/);
  const has = (...values: string[]) => values.some((value) => tokens.includes(value));
  if (has("orm", "arm", "rma", "maskmap")) return "packed";
  if (has("normal", "normals", "normalgl", "normaldx", "nrm", "nor")) return "normal";
  if (has("basecolor", "albedo", "diffuse", "diff", "color", "colour", "couleur")) return "color";
  if (has("roughness", "rough", "rugosite")) return "roughness";
  if (has("metallic", "metalness", "metal", "métal")) return "metallic";
  if (has("ao", "occlusion", "ambientocclusion")) return "ao";
  if (has("height", "displacement", "disp", "bump")) return "height";
  if (has("emission", "emissive", "emit")) return "emission";
  if (has("opacity", "alpha", "opacite")) return "opacity";
  return "other";
}

export function isTextureBackup(path: string): boolean {
  return path.replaceAll("\\", "/").split("/").includes("backups");
}
