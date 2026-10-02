import type { BlendUpAsset } from "../../blendup/types.ts";

export const originalVariantId = "original";

export function assetPreviewVersion(asset: BlendUpAsset, variantId: string): BlendUpAsset {
  const variant = asset.metadata.variants.find((item) => item.id === variantId);
  if (!variant) return asset;
  return {
    ...asset,
    name: `${asset.name} · ${variant.name}`,
    sourcePath: variant.sourcePath ?? "",
    outputPath: variant.outputPath ?? "",
    sourceModifiedAt: variant.sourceModifiedAt,
    outputModifiedAt: variant.outputModifiedAt,
    status: variant.status === "missing" ? "ready" : variant.status,
    uvQuality: variant.uvQuality
  };
}

const preferenceKey = (projectRoot: string, assetId: string) => `blendup:preview-variant:${projectRoot}:${assetId}`;

export function savedPreviewVariant(projectRoot: string, asset: BlendUpAsset): string {
  try {
    const id = localStorage.getItem(preferenceKey(projectRoot, asset.id));
    return asset.metadata.variants.some((variant) => variant.id === id) ? id! : originalVariantId;
  } catch { return originalVariantId; }
}

export function savePreviewVariant(projectRoot: string, assetId: string, variantId: string): void {
  try { localStorage.setItem(preferenceKey(projectRoot, assetId), variantId); } catch { /* Preview still works without storage. */ }
}
