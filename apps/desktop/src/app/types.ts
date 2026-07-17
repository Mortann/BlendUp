export type ActiveView = "assets" | "problems" | "settings";

export type OperationMessage = {
  detail?: string;
  title: string;
  tone: "info" | "success" | "error";
};
