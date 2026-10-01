# BlendUp pour Blender

Add-on léger pour relier un fichier `.blend` placé dans `Art` à son projet BlendUp.

## Fonctions

L'add-on 0.4.2 ouvre les assets dans la session Blender active, prépare les dossiers
`textures`, `references` et `renders`, puis synchronise les exports avec BlendUp.

- détection automatique du projet à partir du fichier Blender ouvert ;
- prise en charge des projets 3D sans moteur : gestion des dossiers et validation, sans export manuel ou automatique vers un moteur ;
- export GLB vers Godot ou FBX vers Unity en respectant les sous-dossiers de `Art` ;
- état `À exporter`, `À réexporter` ou `À jour` directement dans Blender ;
- validation rapide des maillages (échelle, UV, matériaux, géométrie non-manifold) ;
- export manuel ou automatique à chaque sauvegarde ;
- génération de copies LOD non destructives pilotée par l'application (modificateur Decimate éditable) ;
- accès direct aux dossiers source et destination.

## Installation

Dans Blender, ouvre **Édition > Préférences > Extensions > Installer depuis un disque**, puis sélectionne `blendup.zip`. Active ensuite **BlendUp**. Le panneau apparaît dans la barre latérale de la vue 3D (`N`), onglet **BlendUp**.

Le fichier doit être enregistré dans le dossier `Art` d'un projet qui contient `.blendup/project.json`.

## Développement

Le cœur Python ne dépend pas de Blender et peut être testé avec :

```text
python apps/blender-addon/tests/test_core.py
```
