# BlendUp pour Blender

Add-on léger pour relier un fichier `.blend` placé dans `Art` à son projet BlendUp.

## Fonctions

L'add-on 0.6.3 ouvre les assets dans la session Blender active, prépare les dossiers
`textures`, `references` et `renders`, puis synchronise les exports avec BlendUp.

- détection automatique du projet à partir du fichier Blender ouvert ;
- prise en charge des projets 3D sans moteur : gestion des dossiers et validation, sans export manuel ou automatique vers un moteur ;
- export GLB vers Godot ou FBX vers Unity en respectant les sous-dossiers de `Art` ;
- état `À exporter`, `À réexporter` ou `À jour` directement dans Blender ;
- validation rapide des maillages (échelle, UV, matériaux, géométrie non-manifold) ;
- export manuel ou automatique à chaque sauvegarde ;
- génération de copies LOD non destructives pilotée par l'application (modificateur Decimate éditable) ;
- accès direct aux dossiers source et destination.
- préparation des transformations et unwrap Angle Based à la sauvegarde, selon les options du projet ;
- score UV et blocage des exports insuffisants, avec des rapports lisibles dans BlendUp.
- exclusion UV par asset, variantes et LOD inclus, enregistrée dans sa fiche BlendUp ;
- identification de la session Blender qui ouvre un fichier pour la ramener au premier plan sous Windows.

Dans BlendUp, **Informations → Qualité UV → Ignorer cet asset pour la vérification UV** retire l’asset des contrôles et du blocage UV à l’export. Décoche l’option pour rétablir les contrôles. L’application des transformations et l’unwrap à la sauvegarde restent pilotés par les options du projet.

## Installation

Dans Blender, ouvre **Édition > Préférences > Extensions > Installer depuis un disque**, puis sélectionne `blendup.zip`. Active ensuite **BlendUp**. Le panneau apparaît dans la barre latérale de la vue 3D (`N`), onglet **BlendUp**.

Le fichier doit être enregistré dans le dossier `Art` d'un projet qui contient `.blendup/project.json`.

La version 0.6.1 corrige l’erreur `_RestrictData ... filepath` à l’activation : la bibliothèque se charge après l’installation, dès que Blender autorise l’accès au fichier ouvert. Si l’installation de la version précédente a échoué, redémarre Blender puis réinstalle le ZIP corrigé.

## Développement

Le cœur Python ne dépend pas de Blender et peut être testé avec :

```text
python apps/blender-addon/tests/test_core.py
```

Pour tester l’installation et l’activation du ZIP avec un vrai Blender, dans un profil temporaire isolé :

```text
python apps/blender-addon/tests/blender_install_smoke.py --blender "C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe"
```

## Bibliothèque du projet (0.6.0)

Dans la vue 3D, ouvre `N → BlendUp → Bibliothèque du projet`. La liste se remplit à l’ouverture d’un asset ou d’un Showcase. Recherche par nom, dossier ou tag, puis utilise **Placer l’asset** : il arrive au curseur 3D avec son échelle et une instance liée par défaut. Décoche **Instance liée** pour importer une copie modifiable. Un nouveau fichier sans nom conserve le projet associé pendant cette session.

Pour le glisser-déposer, utilise **Synchroniser**, puis **Navigateur d’assets · glisser-déposer**. Un navigateur natif s’ouvre à côté de la vue 3D, avec les collections, vignettes et catalogues du projet. Les fichiers intermédiaires se trouvent dans `.blendup/library/blender` ; les sources restent intactes. Le navigateur lie ses instances à cette bibliothèque générée. Après une modification, synchronise et recharge les bibliothèques liées avec les commandes Blender habituelles.

L’application BlendUp peut également synchroniser cette bibliothèque dans ses paramètres ; elle la maintient ensuite à jour tant qu’elle est ouverte. Le bouton Blender **Synchroniser** fonctionne lorsque l’application est fermée. Chaque sauvegarde d’un asset actualise aussi l’index utilisé par le panneau Godot.
