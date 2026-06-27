# Journal De Production

## 2026-06-25 - Demarrage Production

### Fait

- Initialisation propre du depot Git.
- Creation du workspace npm racine.
- Creation de l'application desktop frontend dans `apps/desktop`.
- Ajout d'une premiere interface React/Vite.
- Ajout des types TypeScript pour les donnees BlendUp.
- Ajout d'un loader temporaire base sur un snapshot du projet `BlendUpTest`.
- Affichage des deux assets tests :
  - `PROP_CubeCrate_01`
  - `ENV_Rock_01`
- Affichage des chemins Blender/FBX/Prefab.
- Affichage des statuts, composants attendus, notes et problems.
- Installation des dependances npm.
- Verification TypeScript reussie.
- Build Vite reussi.
- Serveur local lance sur `http://127.0.0.1:5173/`.

### Contraintes

- Rust/Cargo n'est pas encore installe ou accessible dans le terminal. La partie Tauri native ne peut donc pas encore etre lancee.
- Le navigateur integre n'a pas pu etre utilise pour une verification visuelle a cause d'un blocage de permission sur `AppData`.
- Le frontend lit pour l'instant un snapshot TypeScript, pas encore les fichiers `.blendup` directement.

### Verification

- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- Requete locale `http://127.0.0.1:5173/` : status 200.

### Prochaine Etape

- Remplacer le snapshot temporaire par une premiere couche de lecture de fichiers compatible Tauri.
- Ajouter le shell Tauri quand Rust/Cargo sera disponible.
- Creer un premier module de validation des fiches assets.
- Commencer la vraie vue Problems calculee depuis les donnees.

## 2026-06-25 - Integration Tauri Native

### Fait

- Verification de Rust/Cargo via `C:\Users\morit\.cargo\bin`.
- Ajout des dependances Tauri :
  - `@tauri-apps/api`
  - `@tauri-apps/cli`
- Creation du dossier natif `apps/desktop/src-tauri`.
- Creation de la configuration Tauri `tauri.conf.json`.
- Creation du backend Rust minimal.
- Ajout d'une capability Tauri par defaut.
- Ajout d'une icone temporaire `icons/icon.ico` pour debloquer la compilation Windows.
- Ajout des scripts :
  - `tauri:dev`
  - `tauri:build`

### Verification

- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- `tauri --version` : OK, `tauri-cli 2.11.3`.
- `cargo check` dans `apps/desktop/src-tauri` : OK.
- `tauri info` : OK.

### Environnement Detecte

- WebView2 : OK.
- MSVC : Visual Studio Build Tools 2026.
- rustc : `1.96.0`.
- cargo : `1.96.0`.
- rustup : `1.29.0`.
- Tauri : `2.11.3`.
- React + Vite detectes par Tauri.

### Notes

- Le PATH de Codex ne voit pas encore directement `cargo`, mais le chemin direct `C:\Users\morit\.cargo\bin\cargo.exe` fonctionne.
- Dans ton terminal utilisateur, `cargo`, `rustc` et `rustup` sont bien accessibles normalement.
- L'icone actuelle est temporaire et devra etre remplacee plus tard par une vraie icone BlendUp.

### Prochaine Etape

- Lancer `tauri:dev` depuis un terminal utilisateur pour ouvrir la fenetre native.
- Ajouter la lecture de fichiers `.blendup` via commandes Tauri.
- Remplacer le snapshot TypeScript temporaire par les donnees reelles du projet test.

## 2026-06-25 - Lecture Reelle Du Projet BlendUpTest

### Fait

- Ajout d'une commande native Tauri `read_default_project_snapshot`.
- Ajout d'une commande native Tauri `read_project_snapshot`.
- Lecture de `.blendup/project.json`.
- Lecture automatique des fiches JSON dans `.blendup/assets`.
- Tri des assets par nom d'affichage.
- Calcul des premiers problems automatiques :
  - source Blender manquante ou non definie ;
  - FBX attendu mais pas encore genere ;
  - prefab Unity attendu mais pas encore cree.
- Branchement du frontend sur les commandes Tauri.
- Conservation du snapshot TypeScript comme secours quand l'app est lancee hors Tauri.

### Verification

- `cargo fmt` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.
- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.

### Notes

- Le projet test contient maintenant un vrai projet Unity dans `BlendUpTest/Unity`.
- Les deux fichiers Blender de test sont bien presents :
  - `Art/Blender/Props/PROP_CubeCrate_01.blend`
  - `Art/Blender/Environment/ENV_Rock_01.blend`
- Les FBX et prefabs n'existent pas encore, donc les premiers problems calcules sont attendus.

### Prochaine Etape

- Ajouter un choix de dossier projet dans l'interface au lieu d'utiliser seulement `BlendUpTest`.
- Creer le premier module de validation plus structure pour separer errors, warnings et infos.
- Commencer le flux Blender vers FBX, avec detection du chemin Blender si possible.

## 2026-06-25 - Premiere Vue Problems Utilisable

### Fait

- Activation du bouton `Problems` dans la navigation principale.
- Ajout d'un badge de nombre de problems dans la barre laterale.
- Creation d'une vue Problems dediee.
- Ajout d'un resume par severite :
  - critiques ;
  - erreurs ;
  - warnings ;
  - infos.
- Ajout d'une recherche dans les problems.
- Ajout de filtres par severite.
- Ajout de filtres par source :
  - BlendUp ;
  - Blender ;
  - Unity ;
  - Git.
- Ajout d'une liste selectionnable de problems.
- Ajout d'un panneau de detail pour le problem selectionne.
- Ajout d'un lien de navigation depuis un problem vers l'asset concerne.
- Ajout d'un etat vide quand aucun problem ne correspond aux filtres.
- Ajout d'un etat vide dans la fiche asset quand aucun problem n'est associe.

### Verification

- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- Les actions affichees dans les problems restent visuelles pour l'instant.
- La prochaine etape logique est de rendre certaines actions reelles, par exemple ouvrir un asset, exporter, ou corriger un chemin.

### Prochaine Etape

- Ajouter un choix de dossier projet dans l'interface.
- Ou commencer le flux d'export Blender vers FBX depuis une action d'asset.
- Ou structurer les validations dans un module dedie avant d'ajouter plus de regles.

## 2026-06-25 - Chargement De Projet Par Chemin

### Fait

- Ajout du champ `projectRoot` dans le snapshot renvoye par Tauri.
- Extension du loader frontend pour charger :
  - le projet par defaut ;
  - ou un projet depuis un chemin donne.
- Ajout d'une barre compacte dans l'en-tete pour saisir un chemin projet.
- Ajout d'un bouton `Charger`.
- Ajout d'un message d'erreur si le chemin donne ne peut pas etre lu.
- Reinitialisation de la selection d'asset apres chargement d'un nouveau projet.

### Verification

- `cargo fmt` : OK.
- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- Le chargement par chemin est volontairement simple pour l'instant.
- Une version plus confortable devra utiliser un selecteur de dossier natif.
- Le fallback vers le snapshot de demonstration reste actif seulement quand aucun chemin explicite n'est demande et que Tauri n'est pas disponible.

### Prochaine Etape

- Ajouter un selecteur de dossier natif via plugin Tauri quand on verrouillera l'UX projet.
- Ou commencer le flux Blender vers FBX depuis les actions d'asset.
- Ou separer le moteur de validation dans un module dedie pour faciliter l'ajout de nouvelles regles.

## 2026-06-25 - Premiere Action Export FBX

### Fait

- Ajout d'une commande native Tauri `export_asset_to_fbx`.
- Ajout d'une detection simple de Blender :
  - chemin saisi dans l'interface ;
  - variable d'environnement `BLENDUP_BLENDER_PATH` ;
  - commande `blender` ou `blender.exe` disponible ;
  - dossiers Windows `Blender Foundation` ;
  - chemins Linux courants.
- Ajout d'un script Python Blender temporaire pour exporter en FBX.
- Creation automatique du dossier de sortie FBX si necessaire.
- Mise a jour de la fiche asset apres tentative :
  - `export.lastExportAt` ;
  - `export.lastExportStatus` ;
  - `status: exported` si succes.
- Ajout d'un problem automatique si le dernier export est en erreur.
- Ajout d'un champ `Blender` dans l'en-tete pour renseigner le chemin de l'executable.
- Ajout du bouton `Exporter FBX` dans la fiche asset.
- Activation des actions `Exporter` dans les problems concernes.
- Ajout d'une banniere de feedback pour afficher succes ou erreur.
- Rechargement automatique du projet apres tentative d'export.

### Verification

- `cargo fmt` : OK.
- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- L'export necessite Blender accessible depuis l'application.
- Si Blender n'est pas detecte, l'utilisateur peut coller le chemin de `blender.exe`.
- L'import Unity/prefab n'est pas encore automatise.

### Prochaine Etape

- Tester l'export avec un vrai chemin Blender local.
- Ajouter une detection UX plus confortable de Blender.
- Ajouter ensuite une premiere integration Unity/prefab.

## 2026-06-25 - Premiere Vue Tasks Interne

### Fait

- Ajout du format de tache interne `.blendup/tasks/*.json`.
- Creation de deux taches de test :
  - `task_export_first_assets` ;
  - `task_define_collider_rules`.
- Liaison des taches aux deux assets test.
- Ajout de `tasks` dans le snapshot Tauri.
- Lecture automatique des taches depuis `.blendup/tasks`.
- Validation des taches qui pointent vers un asset inexistant.
- Ajout des types TypeScript `BlendUpTask`, `TaskStatus`, `TaskPriority`.
- Ajout d'une entree `Tasks` dans la navigation principale.
- Ajout d'une vue Tasks avec :
  - resume par statut ;
  - recherche ;
  - filtres statut/priorite ;
  - liste selectionnable ;
  - panneau de detail ;
  - liens vers les assets lies.

### Verification

- `cargo fmt` : OK.
- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- La V1 garde les taches internes, sans ClickUp.
- Les taches ne sont pas encore editables depuis l'interface.

### Prochaine Etape

- Ajouter la creation/edition de taches depuis l'interface.
- Ou continuer le pipeline Unity avec une premiere lecture/import prefab.

## 2026-06-25 - Vue Git Lecture Seule

### Fait

- Ajout d'un etat Git dans le snapshot Tauri.
- Lecture de la branche courante avec Git.
- Lecture du statut court des fichiers.
- Ajout des types TypeScript :
  - `GitStatusSnapshot` ;
  - `GitStatusFile`.
- Activation de l'entree `Git` dans la navigation principale.
- Ajout d'une vue Git avec :
  - branche courante ;
  - disponibilite de Git ;
  - nombre de changements ;
  - message de statut ;
  - recherche dans les fichiers ;
  - liste des fichiers modifies/non suivis.

### Verification

- `cargo fmt` : OK.
- `npm.cmd run typecheck` : OK.
- `npm.cmd run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- La vue Git est volontairement en lecture seule.
- Les actions sensibles comme push, pull, merge ou resolution de conflit restent a concevoir plus tard.

### Prochaine Etape

- Ajouter un selecteur de dossier natif.
- Tester l'export FBX avec Blender local.
- Commencer une premiere integration Unity/prefab.

## 2026-06-27 - Reprise Du Depot Et Verification Locale

### Fait

- Lecture du README et de toute la documentation `docs/`.
- Verification de la coherence entre la documentation, l'application desktop et le projet test.
- Installation des dependances npm.
- Installation de Rust via rustup.
- Installation du Windows SDK necessaire au linker MSVC.
- Verification du projet test `BlendUpTest/` :
  - `.blendup/project.json` present ;
  - deux fiches assets presentes ;
  - deux taches internes presentes ;
  - projet Unity en version `6000.3.5f2`.
- Mise a jour du README pour refleter l'etat reel du depot.
- Ajout de `docs/production/02-installation-verification.md`.
- Mise a jour de l'index documentation, de l'architecture generale et du backlog initial.

### Verification

- `npm install` : OK, 0 vulnerabilite.
- `npm run typecheck` : OK.
- `npm run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.
- `tauri info` : OK avec Rust/Cargo detectes.
- Serveur Vite local `http://127.0.0.1:5173/` : status 200.

### Environnement Detecte

- Node : `24.14.0`.
- npm : `11.9.0`.
- Tauri CLI : `2.11.3`.
- rustc : `1.96.0`.
- cargo : `1.96.0`.
- rustup : `1.29.0`.
- Windows SDK installe pour le linker : `10.0.18362.0`.
- WebView2 : OK.
- MSVC : Visual Studio Community 2022.

### Notes

- Le terminal Codex courant ne recharge pas automatiquement le `PATH` apres installation de Rust. Ajouter temporairement `C:\Users\morit\.cargo\bin` au `PATH` ou ouvrir un nouveau terminal.
- Avant installation du Windows SDK, `cargo check` trouvait `link.exe` mais echouait sur `kernel32.lib`.
- Le serveur Vite a ete lance pour verification, puis arrete apres le test.

### Prochaine Etape

- Ajouter un selecteur de dossier natif.
- Tester l'export FBX avec un vrai chemin Blender local.
- Continuer vers une premiere integration Unity/prefab.
