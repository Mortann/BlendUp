# Add-on Blender BlendUp

Pont entre Blender et l'application BlendUp pour le pipeline V1 : detection du
projet et de la fiche asset, export FBX (manuel et auto au save), validation de
base, creation depuis templates simples, et demande d'ouverture de la fiche
dans l'application.

Cible : Blender 4.0 minimum.

## Installation

L'add-on est le dossier `blendup/`.

1. Compresser le dossier `blendup/` en `blendup.zip`
   (la racine du zip doit contenir directement `blendup/__init__.py`).
2. Dans Blender : `Edit > Preferences > Add-ons > Install...` puis choisir le zip.
3. Activer "BlendUp".

Pour le developpement, on peut aussi creer un lien/symlink de `blendup/` vers le
dossier `addons` de Blender plutot que d'installer un zip.

## Configuration

Dans `Edit > Preferences > Add-ons > BlendUp` :

- `Nom d'acteur` : nom ecrit dans le journal d'activite `.blendup/logs/activity.jsonl` ;
- `Executable BlendUp` et `lien blendup://` : options pour l'ouverture de fiche ;
- `Export FBX` : tous les reglages d'export (selection, echelle, lissage, types
  d'objets, mode des chemins...). C'est ici que vivent les parametres d'export.

## Utilisation

Panneau `BlendUp` dans la sidebar de la vue 3D (touche `N`).

1. Sauvegarder le `.blend` quelque part dans un projet BlendUp
   (un dossier parent contenant `.blendup/project.json`).
2. L'add-on detecte le projet et tente de lier le fichier a une fiche asset
   en comparant son chemin a `paths.blenderSource`. Sinon, bouton `Lier a un asset`.
3. Choisir le mode d'export (Auto / Manuel / Off) — ecrit dans la fiche asset.
4. `Exporter en FBX` exporte vers `paths.fbxExport` et met a jour la fiche
   (`export.lastExportStatus`, `status`, `updatedAt`) comme le fait l'application.
5. En mode `Auto`, l'export se relance a chaque sauvegarde du `.blend`.
6. `Valider la scene` lance la validation de base (nom, echelle, materiaux...).
7. `Ouvrir la fiche dans BlendUp` ecrit `.blendup/temp/open-request.json`.

## Architecture

- `blendup/core/` : logique metier SANS `bpy` (detection projet/asset, lecture/
  ecriture `.blendup`, nomenclature, validation, format JSON). Testable hors Blender.
- `blendup/bpy_adapter.py`, `ops/`, `ui/`, `prefs.py`, `handlers.py` : couche Blender.

Le format JSON ecrit est identique a celui du backend Rust (cles triees,
indentation 2, retour ligne final), pour eviter des diffs Git parasites.

## Tests

Les tests du coeur ne necessitent pas Blender :

```bash
python apps/blender-addon/tests/test_core.py
```

## Limite connue (suivi cote application)

`Ouvrir la fiche dans BlendUp` ecrit une requete dans
`.blendup/temp/open-request.json` (et tente le lien `blendup://asset/<id>`).
Pour une ouverture automatique, l'application desktop doit encore surveiller ce
fichier (ou enregistrer le protocole `blendup://`). Cote add-on, la demande est
complete.
