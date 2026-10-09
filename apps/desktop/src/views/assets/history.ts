type FolderHistory = Pick<History, "state" | "pushState" | "replaceState">;

export function folderHistoryPath(state: unknown, projectId: string): string | null {
  if (!state || typeof state !== "object" || !("blendupFolder" in state)) return null;
  const entry = state.blendupFolder;
  return entry && typeof entry === "object" && "projectId" in entry && entry.projectId === projectId
    && "path" in entry && typeof entry.path === "string" ? entry.path : null;
}

export function recordFolderNavigation(history: FolderHistory, projectId: string, path: string, replace = false) {
  const previous = folderHistoryPath(history.state, projectId);
  if (previous === path) return;
  const state = { ...(history.state && typeof history.state === "object" ? history.state : {}), blendupFolder: { projectId, path } };
  if (replace || previous === null) history.replaceState(state, "");
  else history.pushState(state, "");
}
