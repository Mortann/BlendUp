export const shortcutLabels = {
  rename: "F2", duplicate: "Ctrl+D", copy: "Ctrl+C", cut: "Ctrl+X", paste: "Ctrl+V",
  delete: "Suppr", open: "Entrée", reveal: "Ctrl+Entrée", search: "Ctrl+F",
  createAsset: "Ctrl+N", createFolder: "Ctrl+Maj+N", parent: "Alt+↑", back: "Alt+←", forward: "Alt+→", close: "Échap"
} as const;

export type ExplorerAction = keyof typeof shortcutLabels;

export function explorerShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "repeat">): ExplorerAction | null {
  if (event.repeat) return null;
  const key = event.key.toLowerCase();
  const control = event.ctrlKey || event.metaKey;
  if (event.altKey) {
    if (control || event.shiftKey) return null;
    const actions: Partial<Record<string, ExplorerAction>> = { arrowup: "parent", arrowleft: "back", arrowright: "forward" };
    return actions[key] ?? null;
  }
  if (control) {
    if (key === "n") return event.shiftKey ? "createFolder" : "createAsset";
    if (event.shiftKey) return null;
    const actions: Partial<Record<string, ExplorerAction>> = { d: "duplicate", c: "copy", x: "cut", v: "paste", f: "search", enter: "reveal" };
    return actions[key] ?? null;
  }
  if (event.shiftKey) return null;
  const actions: Partial<Record<string, ExplorerAction>> = { f2: "rename", delete: "delete", enter: "open", escape: "close" };
  return actions[key] ?? null;
}

export function visibleNavigationFolders(folders: string[], collapsed: string[]): string[] {
  return folders.filter((folder) => !collapsed.some((parent) => folder.startsWith(`${parent}/`)));
}
