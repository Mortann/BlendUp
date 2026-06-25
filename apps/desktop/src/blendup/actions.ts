import { invoke } from "@tauri-apps/api/core";
import type { ExportAssetResult } from "./types";

export async function exportAssetToFbx(options: {
  assetId: string;
  blenderPath?: string;
  projectRoot: string;
}): Promise<ExportAssetResult> {
  return invoke<ExportAssetResult>("export_asset_to_fbx", {
    assetId: options.assetId,
    blenderPath: options.blenderPath?.trim() || null,
    exportedAt: new Date().toISOString(),
    projectRoot: options.projectRoot
  });
}
