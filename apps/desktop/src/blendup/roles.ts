import type { BlendUpProject } from "./types";

// V1 : deux roles seulement (artiste / dev). Valeurs alignees sur
// `project.defaultView` ("artist" | "developer").
export type Role = "artist" | "developer";

export const ROLE_ORDER: Role[] = ["artist", "developer"];

export function roleLabel(role: Role): string {
  return role === "artist" ? "Artiste" : "Dev";
}

// Capacites par role : pilotent le contenu, les actions et le theme visuel.
// L'idee : artiste = epure, oriente Blender, peu de details techniques ;
// dev = dense, oriente Unity, beaucoup de details et d'options.
export interface RoleCapabilities {
  accent: string; // couleur d'accent CSS injectee via --role-accent
  primaryTool: "Blender" | "Unity";
  orientationLabel: string; // badge affiche sur la fiche asset
  canExport: boolean; // l'export FBX est une action artiste (cf. doc UX)
  canEditExpectedComponents: boolean;
  canRebuildPrefab: boolean;
  canEditStatus: boolean;
  showRawPaths: boolean; // chemins FBX/prefab bruts (vue dev)
  showUnityDetails: boolean; // composants presents, warnings Unity (vue dev)
  showExportDetails: boolean; // profil, flags d'export (vue dev)
  showAllOwners: boolean;
  primaryNotes: "artist" | "developer";
}

const ARTIST_CAPABILITIES: RoleCapabilities = {
  accent: "#1d9e75",
  primaryTool: "Blender",
  orientationLabel: "Oriente Blender",
  canExport: true,
  canEditExpectedComponents: false,
  canRebuildPrefab: false,
  canEditStatus: true,
  showRawPaths: false,
  showUnityDetails: false,
  showExportDetails: false,
  showAllOwners: false,
  primaryNotes: "artist"
};

const DEVELOPER_CAPABILITIES: RoleCapabilities = {
  accent: "#378add",
  primaryTool: "Unity",
  orientationLabel: "Oriente Unity",
  canExport: false,
  canEditExpectedComponents: true,
  canRebuildPrefab: true,
  canEditStatus: false,
  showRawPaths: true,
  showUnityDetails: true,
  showExportDetails: true,
  showAllOwners: true,
  primaryNotes: "developer"
};

export function capabilitiesFor(role: Role): RoleCapabilities {
  return role === "developer" ? DEVELOPER_CAPABILITIES : ARTIST_CAPABILITIES;
}

export function defaultRoleFromProject(project: BlendUpProject): Role {
  return project.defaultView === "developer" ? "developer" : "artist";
}

// Le role actif est une preference locale (hors Git), persistee cote frontend
// pour la V1. Pourra rejoindre les settings utilisateur natifs plus tard.
const ACTIVE_ROLE_KEY = "blendup:active-role";

export function loadStoredRole(): Role | null {
  try {
    const value = window.localStorage.getItem(ACTIVE_ROLE_KEY);
    return value === "artist" || value === "developer" ? value : null;
  } catch {
    return null;
  }
}

export function storeRole(role: Role): void {
  try {
    window.localStorage.setItem(ACTIVE_ROLE_KEY, role);
  } catch {
    // Persistance best-effort.
  }
}
