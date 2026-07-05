# Modele De Donnees

## Objectif

Le modele de donnees doit permettre a BlendUp, Blender et Unity de partager une vision commune des assets sans dependance forte entre les outils.

Les fichiers doivent etre :

- lisibles ;
- versionnables ;
- migrables ;
- robustes aux renommages ;
- adaptes a une petite equipe.

## Dossiers .blendup

Structure recommandee :

```text
.blendup/
  project.json

  assets/
    asset_7a42.json
    asset_9c11.json

  tasks/
    task_local_001.json

  refs/
    ref_board_forest.json

  presets/
    asset-types.json
    export-profiles.json
    blender-templates.json
    unity-components.json
    quality-budgets.json

  naming/
    asset-naming.json
    branch-naming.json
    folder-rules.json

  locks/
    asset_7a42.lock.json

  logs/
    activity.jsonl

  migrations/
    applied.json
```

Tous les chemins stockes dans les donnees BlendUp doivent etre relatifs au root projet.

## Version De Schema

Chaque fichier important doit inclure `schemaVersion`.

Exemple :

```json
{
  "schemaVersion": 1,
  "kind": "asset",
  "id": "asset_7a42"
}
```

Pourquoi :

- permettre d'ajouter des champs plus tard ;
- convertir les anciens projets ;
- eviter de casser les fichiers existants ;
- garder une evolution propre du produit.

## Project

Fichier :

```text
.blendup/project.json
```

Exemple :

```json
{
  "schemaVersion": 1,
  "kind": "project",
  "projectId": "project_blendup_demo",
  "name": "Jeu1",
  "paths": {
    "artRoot": "Art",
    "blenderRoot": "Art/Blender",
    "referencesRoot": "Art/References",
    "texturesRoot": "Art/Textures",
    "unityRoot": "Unity",
    "unityAssetsRoot": "Unity/Assets"
  },
  "features": {
    "git": true,
    "gitLfs": true,
    "clickUp": false,
    "pureRef": true
  },
  "assets": {
    "roots": [
      "Art/Blender"
    ],
    "typeFolderDepth": 1
  },
  "defaultView": "artist"
}
```

## Asset

L'asset est l'entite centrale.

Fichier :

```text
.blendup/assets/asset_7a42.json
```

Exemple :

```json
{
  "schemaVersion": 1,
  "kind": "asset",
  "id": "asset_7a42",
  "displayName": "PROP_Barrel_01",
  "type": "static_mesh",
  "status": "in_progress",
  "productionMode": "production",
  "owners": {
    "artist": "Alice",
    "developer": "Mehdi",
    "reviewer": null
  },
  "paths": {
    "blenderSource": "Art/Blender/Props/PROP_Barrel_01.blend",
    "fbxExport": "Unity/Assets/Models/Props/PROP_Barrel_01.fbx",
    "unityPrefab": "Unity/Assets/Prefabs/Props/PROP_Barrel_01.prefab",
    "thumbnail": ".blendup/thumbnails/asset_7a42.png"
  },
  "export": {
    "profileId": "static_mesh_default",
    "autoExport": true,
    "importInUnity": true,
    "lastExportAt": null,
    "lastExportStatus": "never_exported"
  },
  "unity": {
    "importStatus": "not_imported",
    "lastImportAt": null,
    "components": [],
    "expectedComponents": [
      "Interactable"
    ],
    "warnings": []
  },
  "tags": [
    "prop",
    "wood",
    "interactive"
  ],
  "references": [
    "ref_barrel_board"
  ],
  "tasks": [
    "task_local_001"
  ],
  "variants": [],
  "notes": {
    "artist": "Version bois simple pour test.",
    "developer": "Ajouter Interactable quand le collider est valide."
  },
  "createdAt": "2026-06-24T00:00:00Z",
  "updatedAt": "2026-06-24T00:00:00Z"
}
```

## Asset Types

Les types d'assets permettent de configurer les comportements.

Exemples V1 :

- `static_mesh`
- `prop`
- `environment_piece`
- `material`
- `texture`
- `ui_image`
- `character`

La V1 doit prioriser `static_mesh`, `prop` et `environment_piece`.

Les types affiches dans l'application viennent du fichier :

```text
.blendup/presets/asset-types.json
```

Chaque entree peut definir :

- `id` : token stocke dans `asset.type` ;
- `displayName` : libelle affiche ;
- `prefix` : prefixe applique au nom technique ;
- `categoryNames` : noms de dossiers qui declenchent ce type ;
- `influence` : aide projet expliquant l'impact du type.

Les racines d'assets viennent de `project.assets.roots`. Le dossier de type est
le premier dossier sous une de ces racines. Exemple : avec racine `Art/Blender`,
`Art/Blender/Assets/PROP_Porte_01` prend le type associe au dossier `Assets`
et le prefixe configure (par defaut `ASS`).

La V1 peut inclure `material`, `texture` et `ui_image` avec un support plus simple :

- fiche asset ;
- references ;
- notes ;
- statut ;
- nomenclature ;
- chemin source ;
- chemin Unity si applicable ;
- pas de pipeline avance au debut.

`character` reste post-V1 ou support tres limite.

## Status

Statuts proposes :

- `draft`
- `in_progress`
- `ready_for_export`
- `exported`
- `unity_imported`
- `needs_art_fix`
- `needs_dev_fix`
- `validated`
- `archived`

Ces statuts doivent etre configurables plus tard, mais une liste simple suffit pour la V1.

### Modele Dossier (Asset = Dossier)

Depuis la passe Assets artiste, un asset n'est plus un simple fichier `.blend` mais un dossier qui le contient, avec ses ressources :

```
Art/Blender/Props/PROP_CubeCrate_01/
  PROP_CubeCrate_01.blend
  references/
  textures/
```

Champs `paths` ajoutes :

- `assetFolder` : dossier de l'asset (ex: `Art/Blender/Props/PROP_CubeCrate_01`) ;
- `blenderSource` : `<assetFolder>/<nom>.blend` ;
- `referencesDir` : `<assetFolder>/references` ;
- `texturesDir` : `<assetFolder>/textures`.

L'emplacement de l'asset dans l'explorateur est le **parent** de `assetFolder` (ex: `Art/Blender/Props`).

BlendUp est la **source de verite du nom** : renommer un asset renomme le dossier et le fichier `.blend`, et met a jour les chemins Unity attendus (FBX/prefab, sans toucher aux fichiers Unity existants).

Une migration native idempotente (`migrate_assets_to_folders`) convertit les assets a plat existants vers ce modele au chargement du projet.

Nom affiche vs nom technique :

- le nom technique suit la nomenclature `{prefix}_{name}_{index}` (ex: `ENV_Rock_01`) et sert pour les dossiers/fichiers ;
- BlendUp affiche le "coeur" (`Rock`) en enlevant le prefixe de type et le suffixe de variante ;
- renommer edite le coeur, reconstruit le nom technique (prefixe + index conserves) et renomme dossier + `.blend` + fichiers Unity `.fbx`/`.prefab` (+ `.meta`) ;
- deplacer un asset deplace aussi les fichiers Unity en repercutant le changement de categorie.
- deplacer un asset ou un dossier sous une autre categorie recalcule `type` et
  renomme le prefixe technique selon `.blendup/presets/asset-types.json`.

Assignation : champ `assignees` (liste de personnes) en plus des `owners` par role. Affichage en avatars facon Trello.

Creation native (`create_asset`) : cree le dossier + `references/` + `textures/`, copie les images choisies, ecrit la fiche, et genere le `.blend` via Blender en mode `-b --python` (si Blender est detecte). `create_folder` cree un simple dossier.

Operations natives (cote Rust), avec BlendUp comme source de verite :

- `rename_asset` : renomme dossier + `.blend` + MAJ chemins ;
- `move_asset` / `move_folder` : deplacent reellement les dossiers sur le disque ;
- `delete_asset` : envoie le dossier de l'asset et sa fiche a la corbeille systeme ;
- `set_asset_owners` : assignation des membres (artiste / dev / reviewer).

### Etat Artiste (Vue Artiste)

En vue artiste, l'etat affiche et modifiable est porte par le champ `status` lui-meme (pas de champ separe). La fiche artiste expose un sous-ensemble simplifie :

- `todo` (A faire) ;
- `in_progress` (En cours) ;
- `review` (A valider) ;
- `needs_art_fix` (A retravailler) ;
- `validated` (Valide).

Regles de changement d'etat :

- les personnes associees a l'asset (artiste/dev proprietaire) peuvent faire avancer l'etat jusqu'a `review` (demande de validation) ;
- seul le `Directeur artistique` (`art_director`) peut passer un asset a `validated` ;
- un asset deja `validated` ne peut etre rouvert (changer d'etat) que par un `Directeur artistique`.

Ce verrou est applique a deux niveaux : l'interface desactive les actions interdites, et la commande native `update_asset_status` rejette toute tentative de validation ou de reouverture par un acteur non `art_director` (verrou natif, non contournable depuis l'UI).

## Production Mode

Valeurs :

- `prototype`
- `production`

Effets :

- un asset prototype peut ne pas etre importe dans Unity ;
- un asset prototype peut avoir des validations moins strictes ;
- un asset production doit suivre plus de regles.

## Variant

Exemple :

```json
{
  "id": "variant_wood",
  "displayName": "Wood",
  "variantType": "visual",
  "status": "in_progress",
  "paths": {
    "fbxExport": "Unity/Assets/Models/Props/PROP_Barrel_01_Wood.fbx",
    "unityPrefab": "Unity/Assets/Prefabs/Props/PROP_Barrel_01_Wood.prefab"
  },
  "notes": "Version bois standard."
}
```

Types de variantes :

- `visual`
- `mesh`
- `gameplay`

## Reference

Fichier :

```text
.blendup/refs/ref_barrel_board.json
```

Exemple :

```json
{
  "schemaVersion": 1,
  "kind": "reference",
  "id": "ref_barrel_board",
  "displayName": "Barrel References",
  "type": "pure_ref_board",
  "paths": {
    "pureRefFile": "Art/References/Props/Barrels.pur",
    "folder": "Art/References/Props/Barrels"
  },
  "linkedAssets": [
    "asset_7a42"
  ],
  "notes": "References bois humide, tonneaux uses, cerclage metal."
}
```

## Task

Tache interne BlendUp.

```json
{
  "schemaVersion": 1,
  "kind": "task",
  "id": "task_local_001",
  "title": "Finaliser PROP_Barrel_01",
  "status": "todo",
  "priority": "medium",
  "owner": "Alice",
  "assetIds": [
    "asset_7a42"
  ],
  "description": "Finaliser l'export FBX et verifier le collider recommande.",
  "createdAt": "2026-06-25T00:00:00Z",
  "updatedAt": "2026-06-25T00:00:00Z"
}
```

Statuts V1 :

- `todo`
- `in_progress`
- `review`
- `done`
- `blocked`

Priorites V1 :

- `low`
- `medium`
- `high`
- `critical`

ClickUp reste hors V1. Une synchronisation externe pourra ajouter plus tard une section `external`, sans casser les taches internes existantes.

## Lock

Verrouillage doux BlendUp.

```json
{
  "schemaVersion": 1,
  "kind": "asset_lock",
  "assetId": "asset_7a42",
  "lockedBy": "Alice",
  "branch": "asset/PROP_Barrel_01-modeling",
  "reason": "Modeling update",
  "createdAt": "2026-06-24T00:00:00Z",
  "expiresAt": null,
  "lfsLock": {
    "enabled": false,
    "lockId": null
  }
}
```

## Activity Log

Format recommande : JSON Lines.

Fichier :

```text
.blendup/logs/activity.jsonl
```

Exemple d'entrees :

```json
{"time":"2026-06-24T10:00:00Z","actor":"Alice","type":"asset.created","assetId":"asset_7a42","message":"Asset created"}
{"time":"2026-06-24T10:12:00Z","actor":"Alice","type":"asset.exported","assetId":"asset_7a42","message":"FBX exported successfully"}
{"time":"2026-06-24T10:15:00Z","actor":"Unity","type":"unity.imported","assetId":"asset_7a42","message":"Prefab updated"}
```

## Uses / Used By

Pour la V1, cette information peut etre calculee partiellement.

Sources possibles :

- fichier asset ;
- chemin texture/material ;
- composants Unity remontes ;
- references liees ;
- taches liees ;
- prefab associe.

La V1 ne doit pas chercher une analyse exhaustive de tout Unity. Elle doit afficher les dependances connues par BlendUp et les integrations.

## Donnees A Eviter En V1

Ne pas stocker en V1 :

- scene Unity complete ;
- hierarchy Unity complete ;
- donnees de mesh ;
- donnees Blender internes complexes ;
- donnees de Git inutiles ;
- historique complet de diff.

BlendUp doit stocker des metadonnees, pas dupliquer les fichiers source.
