# Package Unity BlendUp

Outil Editor Unity qui relie un projet Unity aux donnees `.blendup` :

- detecte le projet BlendUp (dossier parent contenant `.blendup/project.json`) ;
- pour chaque fiche asset : trouve le FBX importe, cree ou met a jour un prefab simple ;
- ajoute les composants attendus (s'ils existent et sont absents) sans rien ecraser ;
- remonte l'etat d'import dans la fiche : `unity.importStatus`, `unity.lastImportAt`, `unity.components`, `unity.warnings`.

Cible : Unity 6.0 (`6000.0.77f1`+). Le projet test utilise `6000.3.5f2`.

## Installation

Le package est le dossier `com.blendup.unity/`.

Option A — package local (recommande). Dans `Unity/Packages/manifest.json`, ajouter :

```json
"com.blendup.unity": "file:../../apps/unity-package/com.blendup.unity"
```

(adapter le chemin relatif selon l'emplacement du projet Unity par rapport au depot).

Option B — copier le dossier `com.blendup.unity/` dans `Unity/Packages/`.

La dependance `com.unity.nuget.newtonsoft-json` est declaree dans le `package.json` ; Unity la resout automatiquement.

## Utilisation

1. Ouvrir le projet Unity (sous `<projet>/Unity`).
2. Menu `BlendUp > Sync Window`.
3. La fenetre liste les assets et leur `importStatus`. Bouton `Sync all assets` ou `Sync` par asset.

Pour chaque asset, le package :

- convertit `paths.fbxExport` / `paths.unityPrefab` (relatifs au root projet) en chemins AssetDatabase ;
- cree le prefab depuis le FBX s'il n'existe pas, sinon ajoute seulement les composants attendus manquants ;
- ecrit l'etat d'import dans la fiche `.blendup` (au meme format JSON que le backend) et ajoute une entree au journal d'activite.

## Regles de securite (V1)

Le package NE supprime jamais de composant, n'ecrase pas un prefab existant et ne touche pas aux scenes. Il cree si absent et ajoute les composants manques. Un composant attendu marque `confirmedRemoved` est ignore.

## Limite (pas de compilation hors Unity)

Le code n'a pas pu etre compile dans l'environnement de developpement (pas de Unity). A verifier dans l'editeur Unity : ouverture sans erreur de compilation, puis un Sync sur `PROP_CubeCrate_01` une fois le FBX exporte.
