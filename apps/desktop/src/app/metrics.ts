import type { BlendUpAsset, BlendUpProblem, ProjectSnapshot } from "../blendup/types";

export function sourceLabel(source: BlendUpProblem["source"]): string {
  const labels: Record<BlendUpProblem["source"], string> = {
    blendup: "BlendUp",
    blender: "Blender",
    unity: "Unity",
    git: "Git"
  };

  return labels[source];
}

export function viewTitle(view: string): string {
  const labels: Record<string, string> = {
    assets: "Assets",
    dashboard: "Dashboard",
    git: "Git",
    nomenclature: "Nomenclature",
    problems: "Problems",
    references: "References",
    settings: "Settings",
    tasks: "Tasks",
    team: "Equipe"
  };

  return labels[view] ?? view;
}

export function problemSummary(snapshot: ProjectSnapshot): string {
  if (snapshot.problems.length === 0) {
    return "Aucun probleme";
  }

  const critical = snapshot.problems.filter((problem) => problem.severity === "critical").length;
  const errors = snapshot.problems.filter((problem) => problem.severity === "error").length;
  const warnings = snapshot.problems.filter((problem) => problem.severity === "warning").length;

  return `${critical} critique(s), ${errors} erreur(s), ${warnings} warning(s)`;
}

export function taskSummary(snapshot: ProjectSnapshot): string {
  if (snapshot.tasks.length === 0) {
    return "Aucune tache";
  }

  const todo = snapshot.tasks.filter((task) => task.status === "todo").length;
  const inProgress = snapshot.tasks.filter((task) => task.status === "in_progress").length;

  return `${todo} a faire, ${inProgress} en cours`;
}

export function assetFolder(asset: BlendUpAsset): string {
  const sourcePath = asset.paths.blenderSource ?? asset.paths.fbxExport ?? asset.paths.unityPrefab ?? "";
  const parts = sourcePath.split(/[\\/]/).filter(Boolean);

  if (parts.length >= 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }

  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return "Sans dossier";
}

export function recentAssets(snapshot: ProjectSnapshot, limit = 4): BlendUpAsset[] {
  return [...snapshot.assets]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, limit);
}
