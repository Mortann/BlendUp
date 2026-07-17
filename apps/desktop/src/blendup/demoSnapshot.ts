import type { ProjectSnapshot } from "./types";

export const demoProjectSnapshot: ProjectSnapshot = {
  projectRoot: "C:/BlendUpDemo",
  project: {
    schemaVersion: 2,
    kind: "project",
    projectId: "project_demo",
    name: "Démo Godot",
    engine: "godot",
    paths: {
      artRoot: "Art",
      engineRoot: "Godot",
      engineAssetsRoot: "Godot/Assets"
    }
  },
  assetFolders: ["Art", "Art/Props", "Art/Props/Table"],
  assets: [
    {
      id: "asset_demo_table",
      name: "Table",
      folder: "Art/Props/Table",
      sourcePath: "Art/Props/Table/Table.blend",
      outputPath: "Godot/Assets/Props/Table/Table.glb",
      format: "glb",
      status: "exported",
      sourceModifiedAt: "1784300000",
      outputModifiedAt: "1784300100",
      sizeBytes: 204_800,
      metadata: {
        notes: "Table principale du salon.",
        tags: ["prop", "wood"],
        variants: [
          {
            id: "variant_demo_red",
            name: "Bois rouge",
            status: "ready",
            sourcePath: "Art/Props/Table/Table.variant.bois_rouge.blend",
            outputPath: "Godot/Assets/Props/Table/variants/bois_rouge.glb",
            notes: "Matériau rouge plus sombre."
          }
        ],
        lods: [
          {
            id: "lod_demo_1",
            level: "LOD1",
            status: "exported",
            targetRatio: 50,
            generated: true,
            sourcePath: "Art/Props/Table/Table.lod.lod1.blend",
            outputPath: "Godot/Assets/Props/Table/lods/lod1.glb",
            notes: "Décimation automatique."
          },
          {
            id: "lod_demo_2",
            level: "LOD2",
            status: "ready",
            targetRatio: 25,
            generated: true,
            sourcePath: "Art/Props/Table/Table.lod.lod2.blend",
            outputPath: "Godot/Assets/Props/Table/lods/lod2.glb",
            notes: ""
          }
        ]
      }
    }
  ],
  problems: []
};
