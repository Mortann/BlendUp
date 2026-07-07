# Decisions Validees

Ce document liste les decisions prises pendant le cadrage initial du projet.

## Direction Generale

- BlendUp sera une application separee.
- BlendUp aura une integration Blender via add-on.
- BlendUp aura une integration Unity via package/editor tooling.
- Le flux principal sera Blender -> FBX -> Prefab Unity -> Scenes.
- Le retour Unity -> BlendUp remontera surtout des metadonnees.
- La synchronisation Unity -> Blender complete n'est pas un objectif V1.

## Structure Projet

Un projet type pourra ressembler a ceci :

```text
Jeu1/
  Art/
    Blender/
    References/
    Textures/
    UI/
    Concepts/

  Unity/
    Assets/
    Packages/
    ProjectSettings/

  .blendup/
    assets/
    tasks/
    refs/
    presets/
    naming-rules/
    project-settings.json

  .git/
```

Cette structure pourra etre adaptee au projet, mais BlendUp doit clairement separer :

- sources artistiques ;
- projet Unity ;
- donnees BlendUp ;
- donnees Git.

Pour la V1, BlendUp suit la structure standard `Art/`, `Unity/`, `.blendup/` et ne cherche pas a adapter librement toutes les structures existantes.

Tous les chemins stockes dans `.blendup` doivent etre relatifs au root projet.

## Donnees BlendUp

- Les donnees BlendUp seront stockees dans le depot Git.
- Les donnees doivent etre lisibles, versionnables et migrables.
- Les fiches assets auront un ID stable independant du nom.
- Les conventions projet seront configurables.
- Les presets/templates seront versionnes avec le projet.

## Roles Et Vues

- Il y aura une vue artiste.
- Il y aura une vue validation.
- Les deux vues liront les memes donnees, mais presenteront les informations differemment.
- Les permissions seront douces, pas strictes, au moins au debut.

## Git

- BlendUp ne doit pas remplacer Git.
- Les equipe de production pourront continuer a utiliser Git comme ils le souhaitent.
- BlendUp proposera une interface simplifiee pour les artistes.
- Git LFS doit etre prevu des le debut.
- Le verrouillage sera un verrouillage BlendUp avec option Git LFS Lock.
- La creation de branche pourra suivre une nomenclature automatique.

## ClickUp

- ClickUp est interessant mais ne fait pas partie de la V1.
- BlendUp doit avoir un modele de tache interne.
- ClickUp pourra devenir une integration synchronisee plus tard.
- Le mode hors ligne doit rester possible.

## PureRef

- PureRef doit rester l'outil specialise pour les boards de references.
- BlendUp peut lier et ouvrir des fichiers PureRef.
- BlendUp peut aussi organiser des dossiers d'images de references.
- Les references globales DA doivent etre separees des references par asset.
- BlendUp ne doit pas chercher a remplacer PureRef en V1.

## Nomenclature

- La nomenclature doit etre assistee.
- BlendUp doit avertir et proposer des corrections.
- Les corrections automatiques doivent etre limitees aux cas mineurs et peu risques.
- Les regles doivent etre configurables par projet.
- La nomenclature peut aussi s'appliquer aux branches Git.
- Les branches peuvent suivre les formats `asset/...`, `task/...`, `fix/...`, `review/...`.

## Templates / Presets

- Les templates sont une fonctionnalite importante.
- Ils doivent aider a creer vite et proprement :
  - materiaux ;
  - collections Blender ;
  - colliders ;
  - profils d'export ;
  - presets Unity ;
  - types d'assets.
- La V1 doit commencer simple.

## Versions Et Stack

- Version minimale Blender : 4.0.
- Version minimale Unity : Unity 6.0, version de reference `6000.0.77f1`.
- Plateforme V1 : Windows en priorite, Linux si le cout reste raisonnable.
- Stack application validee : Tauri + TypeScript + React.
- Donnees machine : JSON versionne dans `.blendup`.
- Add-on Blender : Python.
- Package Unity : C# Editor.

## Scenes / Zones

- Les scenes/zones Unity ne sont pas prioritaires pour la V1.
- Une organisation par tags ou zones logiques pourra exister plus tard.
- Pas de carte visuelle avancee au debut.
