import type { SeverityFilter, SourceFilter, TaskPriorityFilter, TaskStatusFilter } from "./types";

export const severityFilters: Array<{ label: string; value: SeverityFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Critiques", value: "critical" },
  { label: "Erreurs", value: "error" },
  { label: "Warnings", value: "warning" },
  { label: "Infos", value: "info" }
];

export const sourceFilters: Array<{ label: string; value: SourceFilter }> = [
  { label: "Toutes", value: "all" },
  { label: "BlendUp", value: "blendup" },
  { label: "Blender", value: "blender" },
  { label: "Unity", value: "unity" },
  { label: "Git", value: "git" }
];

export const taskStatusFilters: Array<{ label: string; value: TaskStatusFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Todo", value: "todo" },
  { label: "En cours", value: "in_progress" },
  { label: "Review", value: "review" },
  { label: "Termine", value: "done" },
  { label: "Bloque", value: "blocked" }
];

export const taskPriorityFilters: Array<{ label: string; value: TaskPriorityFilter }> = [
  { label: "Toutes", value: "all" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" }
];
