import { useEffect, useRef } from "react";

// Raccourcis clavier configurables. Les combos sont stockes au format
// "Alt+KeyA" / "F2" / "Shift+KeyN" (base sur KeyboardEvent.code).

export type ShortcutAction =
  | "nav.dashboard"
  | "nav.assets"
  | "nav.references"
  | "nav.tasks"
  | "nav.nomenclature"
  | "nav.team"
  | "nav.problems"
  | "nav.git"
  | "nav.settings"
  | "asset.new"
  | "folder.new"
  | "asset.rename"
  | "asset.delete"
  | "asset.favorite"
  | "asset.openBlender"
  | "asset.validate";

export type ShortcutBindings = Record<ShortcutAction, string>;

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  "nav.dashboard": "Aller au Dashboard",
  "nav.assets": "Aller aux Assets",
  "nav.references": "Aller aux References",
  "nav.tasks": "Aller aux Taches",
  "nav.nomenclature": "Aller a la Nomenclature",
  "nav.team": "Aller a l'Equipe",
  "nav.problems": "Aller aux Problemes",
  "nav.git": "Aller a Git",
  "nav.settings": "Aller aux Parametres",
  "asset.new": "Nouvel asset",
  "folder.new": "Nouveau dossier",
  "asset.rename": "Renommer l'asset selectionne",
  "asset.delete": "Supprimer l'asset selectionne",
  "asset.favorite": "Favori (asset selectionne)",
  "asset.openBlender": "Ouvrir dans Blender",
  "asset.validate": "Valider l'asset (DA)"
};

export const SHORTCUT_ORDER: ShortcutAction[] = [
  "nav.dashboard",
  "nav.assets",
  "nav.references",
  "nav.tasks",
  "nav.nomenclature",
  "nav.team",
  "nav.problems",
  "nav.git",
  "nav.settings",
  "asset.new",
  "folder.new",
  "asset.rename",
  "asset.delete",
  "asset.favorite",
  "asset.openBlender",
  "asset.validate"
];

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  "nav.dashboard": "Alt+KeyD",
  "nav.assets": "Alt+KeyA",
  "nav.references": "Alt+KeyR",
  "nav.tasks": "Alt+KeyT",
  "nav.nomenclature": "Alt+KeyM",
  "nav.team": "Alt+KeyE",
  "nav.problems": "Alt+KeyP",
  "nav.git": "Alt+KeyG",
  "nav.settings": "Alt+KeyS",
  "asset.new": "KeyN",
  "folder.new": "Shift+KeyN",
  "asset.rename": "F2",
  "asset.delete": "Delete",
  "asset.favorite": "KeyF",
  "asset.openBlender": "KeyO",
  "asset.validate": "KeyV"
};

const STORAGE_KEY = "blendup:shortcuts";

const MODIFIER_CODES = [
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight"
];

export function loadShortcutBindings(): ShortcutBindings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULT_SHORTCUTS };
    }

    return { ...DEFAULT_SHORTCUTS, ...(JSON.parse(raw) as Partial<ShortcutBindings>) };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcutBindings(bindings: ShortcutBindings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Persistance best-effort.
  }
}

export function comboFromEvent(event: KeyboardEvent): string {
  const code = event.code;

  if (!code || MODIFIER_CODES.includes(code)) {
    return "";
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(code);

  return parts.join("+");
}

export function formatCombo(combo: string): string {
  if (!combo) {
    return "Aucun";
  }

  return combo
    .split("+")
    .map((part) => {
      if (part.startsWith("Key")) return part.slice(3);
      if (part.startsWith("Digit")) return part.slice(5);
      if (part === "Meta") return "Cmd";
      return part;
    })
    .join(" + ");
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}

export function useShortcuts(
  bindings: ShortcutBindings,
  handlers: Partial<Record<ShortcutAction, () => void>>
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const combo = comboFromEvent(event);
      if (!combo) {
        return;
      }

      for (const action of SHORTCUT_ORDER) {
        if (bindings[action] === combo) {
          const handler = handlersRef.current[action];
          if (handler) {
            event.preventDefault();
            handler();
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);
}
