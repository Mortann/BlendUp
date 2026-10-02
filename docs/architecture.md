# Architecture

## Périmètre

BlendUp gère uniquement les projets, les assets Blender, leurs métadonnées de production, les problèmes d'export et les paramètres locaux.

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

Le champ `engine` accepte `none`, `godot` ou `unity`. Un projet 3D utilise `none` et ne sérialise que `paths.artRoot` : `engineRoot` et `engineAssetsRoot` sont absents. Les configurations des anciens projets restent compatibles.

En mode 3D, les assets et versions présents ont le statut `local`, sans diagnostic d'export moteur. La commande `generate_asset_preview` génère un GLB à la demande sous `.blendup/cache/previews` ; elle ne crée pas d'état d'export et laisse le `.blend` intact. Les commandes d'export et de nettoyage moteur refusent ce mode. Les chemins des versions sont recalculés dans le snapshot et lors des mutations, afin de suivre les changements de type de projet.

- Godot : `bpy.ops.export_scene.gltf`, format binaire GLB.
- Unity : `bpy.ops.export_scene.fbx`.

Les sous-dossiers de `Art` sont reproduits sous le dossier `Assets` actif.

## Métadonnées Assets

Chaque asset peut avoir un fichier `.blendup/assets/asset_<id>.json`. Il contient uniquement les informations nécessaires à l'explorateur : notes, tags, miniature, variantes et LOD. L'identifiant est un hash stable du chemin Blender. L'application continue de lire les métadonnées de l'ancien schéma lorsque celles-ci existent.

## Add-on Blender

`apps/blender-addon/blendup/core` ne dépend pas de Blender : il normalise le projet, calcule les chemins et partage `export-state.json` avec l'application. La couche Blender ajoute le panneau, les opérateurs GLB/FBX, la validation des maillages et l'export après sauvegarde. Aucun prefab ni widget moteur n'est généré.
