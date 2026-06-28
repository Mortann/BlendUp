import type { BlendUpProblem, TaskPriority, TaskStatus } from "../blendup/types";

export type ActiveView =
  | "assets"
  | "dashboard"
  | "git"
  | "nomenclature"
  | "problems"
  | "references"
  | "settings"
  | "tasks"
  | "team";

export type OperationMessage = {
  detail?: string;
  title: string;
  tone: "info" | "success" | "error";
};

export type SeverityFilter = BlendUpProblem["severity"] | "all";
export type SourceFilter = BlendUpProblem["source"] | "all";
export type TaskPriorityFilter = TaskPriority | "all";
export type TaskStatusFilter = TaskStatus | "all";

export type SelectOption<TValue extends string> = {
  label: string;
  value: TValue;
};
