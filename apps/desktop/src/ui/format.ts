import type { AssetStatus, AssetType, BlendUpAsset, BlendUpProblem, TaskPriority, TaskStatus } from "../blendup/types";
import { labelForType } from "../blendup/naming";

// Les types sont dynamiques (un dossier de categorie = un type) : on delegue au catalogue de noms.
export function formatAssetType(type: AssetType): string {
  return labelForType(type);
}

export function formatStatus(status: AssetStatus): string {
  const labels: Record<AssetStatus, string> = {
    todo: "A faire",
    draft: "Draft",
    in_progress: "En cours",
    review: "A valider",
    ready_for_export: "Ready",
    exported: "Exported",
    unity_imported: "Unity Imported",
    needs_art_fix: "A retravailler",
    validated: "Valide",
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
