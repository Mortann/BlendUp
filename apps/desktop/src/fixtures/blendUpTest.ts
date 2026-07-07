import type { ProjectSnapshot } from "../blendup/types";

export const blendUpTestSnapshot: ProjectSnapshot = {
  project: {
    schemaVersion: 1,
    kind: "project",
    projectId: "project_blendup_test",
    name: "BlendUpTest",
    paths: {
      artRoot: "Art",
      blenderRoot: "Art/Blender",
      referencesRoot: "Art/References",
      texturesRoot: "Art/Textures",
      uiRoot: "Art/UI",
      unityRoot: "Unity",
      unityAssetsRoot: "Unity/Assets",
      unityModelsRoot: "Unity/Assets/Models",
      unityPrefabsRoot: "Unity/Assets/Prefabs",
      unityMaterialsRoot: "Unity/Assets/Materials"
    },
    targets: {
      blenderMinimumVersion: "4.0",
      unityMinimumVersion: "6000.0.77f1",
      unityTestVersion: "6000.3.5f2"
    },
    features: {
      git: true,
      gitLfs: true,
      clickUp: false,
      pureRef: true
    },
    assets: {
      roots: ["Art/Blender"],
      typeFolderDepth: 1
    },
    defaultView: "artist"
  },
  assetFolders: [
    "Art/Blender/Environment",
    "Art/Blender/Environment/ENV_Rock_01",
    "Art/Blender/Props",
    "Art/Blender/Props/PROP_CubeCrate_01"
  ],
  assetTypePresets: [
    {
      id: "assets",
      displayName: "Assets",
      prefix: "ASS",
      categoryNames: ["Assets"],
      influence: "Assets generiques organises par dossier."
    },
    {
      id: "prop",
      displayName: "Prop",
      prefix: "PROP",
      categoryNames: ["Prop", "Props", "Accessoire", "Accessoires"],
      influence: "Props et accessoires exportes vers Unity."
    },
    {
      id: "environment_piece",
      displayName: "Environment",
      prefix: "ENV",
      categoryNames: ["Environment", "Environnement", "Env"],
      influence: "Elements de decor et environnement."
    }
  ],
  assetNamingRules: {
    schemaVersion: 1,
    kind: "asset_naming_rules",
    pattern: "{prefix}_{name}_{index}",
    prefixes: ["ASS", "PROP", "ENV", "CHR", "MAT", "TEX", "UI", "FX"],
    blenderSuffixes: ["_MESH", "_COL", "_LOD0", "_LOD1", "_ARM", "_RIG", "_EMPTY", "_SOCKET"],
    forbiddenNameFragments: ["final", "new", "copy", "test"]
  },
  assets: [
    {
      schemaVersion: 1,
      kind: "asset",
      id: "asset_prop_cubecrate_01",
      displayName: "PROP_CubeCrate_01",
      type: "prop",
      status: "in_progress",
      productionMode: "production",
      owners: {
        artist: null,
        reviewer: null
      },
      paths: {
        blenderSource: "Art/Blender/Props/PROP_CubeCrate_01.blend",
        fbxExport: "Unity/Assets/Models/Props/PROP_CubeCrate_01.fbx",
        unityPrefab: "Unity/Assets/Prefabs/Props/PROP_CubeCrate_01.prefab",
        thumbnail: ".blendup/thumbnails/asset_prop_cubecrate_01.png"
      },
      export: {
        profileId: "static_mesh_default",
        autoExport: true,
        importInUnity: true,
        lastExportAt: null,
        lastExportStatus: "never_exported"
      },
      unity: {
        importStatus: "not_imported",
        lastImportAt: null,
        components: [],
        expectedComponents: [
          {
            name: "StaticCollider",
            requirement: "recommended",
            confirmedRemoved: false
          }
        ],
        warnings: []
      },
      tags: ["prop", "test"],
      references: [],
      tasks: ["task_export_first_assets", "task_define_collider_rules"],
      variants: [],
      lods: [],
      notes: {
        artist: "Premier asset prop de test. Sert a verifier export FBX, prefab simple et collider recommande."
      },
      createdAt: "2026-06-24T00:00:00Z",
      updatedAt: "2026-06-24T00:00:00Z"
    },
    {
      schemaVersion: 1,
      kind: "asset",
      id: "asset_env_rock_01",
      displayName: "ENV_Rock_01",
      type: "environment_piece",
      status: "in_progress",
      productionMode: "production",
      owners: {
        artist: null,
        reviewer: null
      },
      paths: {
        blenderSource: "Art/Blender/Environment/ENV_Rock_01.blend",
        fbxExport: "Unity/Assets/Models/Environment/ENV_Rock_01.fbx",
        unityPrefab: "Unity/Assets/Prefabs/Environment/ENV_Rock_01.prefab",
        thumbnail: ".blendup/thumbnails/asset_env_rock_01.png"
      },
      export: {
        profileId: "environment_piece_default",
        autoExport: true,
        importInUnity: true,
        lastExportAt: null,
        lastExportStatus: "never_exported"
      },
      unity: {
        importStatus: "not_imported",
        lastImportAt: null,
        components: [],
        expectedComponents: [
          {
            name: "StaticCollider",
            requirement: "recommended",
            confirmedRemoved: false
          }
        ],
        warnings: []
      },
      tags: ["environment", "rock", "test"],
      references: [],
      tasks: ["task_export_first_assets"],
      variants: [],
      lods: [],
      notes: {
        artist: "Asset environnement de test. Contient un material dans le fichier Blender et sert aux validations FBX/prefab."
      },
      createdAt: "2026-06-24T00:00:00Z",
      updatedAt: "2026-06-24T00:00:00Z"
    }
  ],
  tasks: [
    {
      schemaVersion: 1,
      kind: "task",
      id: "task_export_first_assets",
      title: "Exporter les premiers assets test",
      status: "in_progress",
      priority: "high",
      owner: null,
      assetIds: ["asset_prop_cubecrate_01", "asset_env_rock_01"],
      description: "Verifier que les assets Blender de test peuvent produire des FBX lisibles par Unity.",
      createdAt: "2026-06-25T00:00:00Z",
      updatedAt: "2026-06-25T00:00:00Z"
    },
    {
      schemaVersion: 1,
      kind: "task",
      id: "task_define_collider_rules",
      title: "Definir les regles collider de base",
      status: "todo",
      priority: "medium",
      owner: null,
      assetIds: ["asset_prop_cubecrate_01"],
      description: "Decider quels assets doivent recevoir un collider recommande ou obligatoire cote Unity.",
      createdAt: "2026-06-25T00:00:00Z",
      updatedAt: "2026-06-25T00:00:00Z"
    }
  ],
  gitStatus: {
    available: false,
    files: [],
    message: "Git est seulement lu dans l'application Tauri."
  },
  activity: [
    {
      time: "2026-06-25T09:12:00Z",
      actor: "Owner",
      type: "asset.created",
      assetId: "asset_prop_cubecrate_01",
      message: "Asset PROP_CubeCrate_01 cree dans Art/Blender/Props",
      branch: "main"
    },
    {
      time: "2026-06-25T10:30:00Z",
      actor: "Clement",
      type: "asset.status_changed",
      assetId: "asset_prop_cubecrate_01",
      message: "PROP_CubeCrate_01: todo -> in_progress",
      branch: "main"
    }
  ],
  problems: [
    {
      id: "problem_export_prop_cubecrate_missing",
      severity: "warning",
      source: "blender",
      assetId: "asset_prop_cubecrate_01",
      title: "FBX non exporte",
      detail: "L'asset a une source Blender, mais aucun export FBX n'a encore ete produit.",
      actionLabel: "Exporter"
    },
    {
      id: "problem_export_env_rock_missing",
      severity: "warning",
      source: "blender",
      assetId: "asset_env_rock_01",
      title: "FBX non exporte",
      detail: "L'asset a une source Blender, mais aucun export FBX n'a encore ete produit.",
      actionLabel: "Exporter"
    },
    {
      id: "problem_unity_prefabs_missing",
      severity: "info",
      source: "unity",
      title: "Prefabs en attente",
      detail: "Les prefabs Unity seront crees quand les FBX seront disponibles."
    }
  ]
};
