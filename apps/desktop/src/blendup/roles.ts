export type Role = "artist";

export const ROLE_ORDER: Role[] = ["artist"];

export function roleLabel(_role: Role): string {
  return "Artiste";
}

export interface RoleCapabilities {
  accent: string;
  primaryTool: "Blender";
  orientationLabel: string;
  canExport: boolean;
  canEditExpectedComponents: boolean;
  canRebuildPrefab: boolean;
  canEditStatus: boolean;
  showRawPaths: boolean;
  showUnityDetails: boolean;
  showExportDetails: boolean;
  showAllOwners: boolean;
  primaryNotes: "artist";
}

const ARTIST_CAPABILITIES: RoleCapabilities = {
  accent: "#143a73",
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

export function capabilitiesFor(_role: Role): RoleCapabilities {
  return ARTIST_CAPABILITIES;
}
