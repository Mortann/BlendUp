import { blendUpTestSnapshot } from "../fixtures/blendUpTest";
import type { ProjectSnapshot } from "./types";
import { invoke } from "@tauri-apps/api/core";

export async function loadProjectSnapshot(projectRoot?: string): Promise<ProjectSnapshot> {
  try {
    const trimmedProjectRoot = projectRoot?.trim();

    if (trimmedProjectRoot) {
      return await invoke<ProjectSnapshot>("read_project_snapshot", {
        projectRoot: trimmedProjectRoot
      });
    }

    return await invoke<ProjectSnapshot>("read_default_project_snapshot");
  } catch (error) {
    if (projectRoot?.trim()) {
      throw error;
    }

    console.warn("BlendUp uses the local demo snapshot because Tauri data is not available.", error);
    return blendUpTestSnapshot;
  }
}
