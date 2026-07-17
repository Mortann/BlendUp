# BlendUp

BlendUp est une application desktop simple pour exporter les fichiers Blender d'un projet vers Godot ou Unity.

Le flux de la première version est volontairement court :

```text
Art/**/*.blend
  -> Godot/Assets/**/*.glb
  ou
  -> Unity/Assets/**/*.fbx
```

L'application ne contient que trois espaces :

- **Assets** : organiser, rechercher, documenter, prévisualiser et exporter les fichiers Blender ;
- **Problèmes** : voir les exports manquants, obsolètes ou en erreur ;
- **Paramètres** : choisir Godot ou Unity et configurer Blender.

Les anciens systèmes Git, tâches, équipe, références, nomenclature, dashboard, widget Unity et création de prefabs ont été retirés.

## Organisation d'un projet

```text
MonProjet/
├─ .blendup/
│  ├─ project.json
│  ├─ export-state.json
│  └─ temp/
├─ Art/
│  └─ ... fichiers .blend
└─ Godot/Assets/       # projet Godot
   ou Unity/Assets/    # projet Unity
```

Le chemin situé sous `Art` est conservé dans le dossier `Assets`. Par exemple, `Art/Environment/Rock.blend` devient `Godot/Assets/Environment/Rock.glb`.

L'explorateur Assets conserve les fonctions avancées utiles : dossiers, favoris, filtres, plusieurs vues, glisser-déposer, miniatures, aperçu 3D, rendus, textures, variantes et LOD. Ces informations sont locales au projet dans `.blendup/assets` et ne dépendent ni de Git ni d'un système de tâches.

Changer le moteur dans les paramètres active la nouvelle organisation et conserve l'ancien dossier moteur par sécurité.

## Add-on Blender

Le dossier `apps/blender-addon/blendup` contient l'add-on Blender. Il détecte le projet depuis le fichier `.blend`, affiche l'état de l'export, valide les maillages et exporte vers le moteur actif. Un export automatique à la sauvegarde peut être activé dans ses préférences.

Voir [le guide de l'add-on](apps/blender-addon/README.md).

## Développement

Prérequis : Node.js, npm, Rust, les outils Windows C++, WebView2 et Blender.

```powershell
npm install
npm run typecheck
npm run build
npm run tauri:dev
```

La documentation utile se trouve dans [docs/00-index.md](docs/00-index.md).
