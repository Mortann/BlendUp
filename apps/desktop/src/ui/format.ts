import type { AssetStatus, AssetType, BlendUpAsset, BlendUpProblem, TaskPriority, TaskStatus } from "../blendup/types";

export function formatAssetType(type: AssetType): string {
  const labels: Record<AssetType, string> = {
    static_mesh: "Static Mesh",
    prop: "Prop",
    environment_piece: "Environment",
    material: "Material",
    texture: "Texture",
    ui_image: "UI Image",
    character: "Character"
  };

  return labels[type];
}

export function formatStatus(status: AssetStatus): string {
  const labels: Record<AssetStatus, string> = {
    draft: "Draft",
    in_progress: "In Progress",
    ready_for_export: "Ready",
    exported: "Exported",
    unity_imported: "Unity Imported",
    needs_art_fix: "Art Fix",
    needs_dev_fix: "Dev Fix",
    validated: "Validated",
    archived: "Archived"
  };

  return labels[status];
}

export function severityLabel(severity: BlendUpProblem["severity"]): string {
  const labels: Record<BlendUpProblem["severity"], string> = {
    info: "Info",
    warning: "Warning",
    error: "Error",
    critical: "Critical"
  };

  return labels[severity];
}

export function formatExportStatus(status: BlendUpAsset["export"]["lastExportStatus"]): string {
  const labels: Record<BlendUpAsset["export"]["lastExportStatus"], string> = {
    never_exported: "Never Exported",
    success: "Success",
    warning: "Warning",
    error: "Error"
  };

  return labels[status];
}

export function formatTaskPriority(priority: TaskPriority): string {
  const labels: Record<TaskPriority, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical"
  };

  return labels[priority];
}

export function formatTaskStatus(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    todo: "Todo",
    in_progress: "In Progress",
    review: "Review",
    done: "Done",
    blocked: "Blocked"
  };

  return labels[status];
}
