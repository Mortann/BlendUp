# Architecture

## Périmètre

BlendUp gère uniquement les projets, les assets Blender, les problèmes d'export et les paramètres locaux.

L'application React appelle un backend Tauri en Rust. Le backend :

1. lit `.blendup/project.json` ;
2. parcourt récursivement `Art` à la recherche des fichiers `.blend` ;
3. calcule leur destination sous le dossier `Assets` du moteur ;
4. lance Blender en arrière-plan pour produire un GLB ou un FBX ;
5. compare les dates de modification pour déterminer si un export est à jour.

## Configuration du projet

```json
{
  "schemaVersion": 2,
  "kind": "project",
  "projectId": "project_mon_jeu",
  "name": "Mon jeu",
  "engine": "godot",
  "paths": {
    "artRoot": "Art",
    "engineRoot": "Godot",
    "engineAssetsRoot": "Godot/Assets"
  }
}
```

Les données techniques d'export sont limitées à `.blendup/export-state.json`. Aucun fichier de tâches, d'équipe, de nomenclature ou d'intégration Git n'est nécessaire.

## Export

- Godot : `bpy.ops.export_scene.gltf`, format binaire GLB.
- Unity : `bpy.ops.export_scene.fbx`.

Les sous-dossiers de `Art` sont reproduits sous le dossier `Assets` actif.

