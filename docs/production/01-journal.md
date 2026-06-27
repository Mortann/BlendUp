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

## 2026-06-27 - Settings Locaux Et Accueil Projet

### Fait

- Ajout d'un modele de settings utilisateur local.
- Ajout des commandes Tauri :
  - `read_user_settings` ;
  - `save_user_settings`.
- Stockage natif des settings hors Git dans le dossier de configuration utilisateur.
- Ajout d'un fallback `localStorage` quand l'interface tourne hors Tauri.
- Ajout du dernier projet ouvert et des projets recents.
- Ajout des chemins locaux :
  - Blender ;
  - Unity ;
  - PureRef.
- Suppression des champs projet/Blender de la barre du haut.
- Ajout d'une page d'accueil quand aucun projet n'est charge.
- Ajout d'une vue `Settings` pour ouvrir un projet, fermer le projet courant et modifier les chemins locaux.
- Chargement automatique du dernier projet au demarrage quand il existe.

### Verification

- `npm run typecheck` : OK.
- `npm run build` : OK.
- `cargo fmt` dans `apps/desktop/src-tauri` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- La creation assistee de projet n'est pas encore implementee.
- Le selecteur de dossier natif reste a ajouter pour remplacer la saisie manuelle de chemin.
- Le snapshot `BlendUpTest` reste disponible comme projet test pendant la production.

### Prochaine Etape

- Ajouter un selecteur de dossier natif.
- Implementer la creation assistee de projet.
- Continuer ensuite l'export Blender et l'integration Unity.

## 2026-06-27 - Selecteur Dossier, Dashboard Et Detection Outils

### Fait

- Ajout du plugin Tauri de dialogue :
  - `@tauri-apps/plugin-dialog` ;
  - `tauri-plugin-dialog`.
- Ajout de la permission `dialog:open`.
- Ajout du selecteur de dossier natif pour ouvrir un projet.
- Conservation du fallback par chemin manuel.
- Ajout d'une vue `Dashboard` comme accueil du projet ouvert.
- Le logo BlendUp en haut a gauche ramene au dashboard projet.
- Ouverture d'un projet et ouverture du projet test arrivent maintenant sur le dashboard.
- Ajout d'une commande Tauri `detect_local_tools`.
- Detection/validation des outils locaux :
  - Blender ;
  - Unity ;
  - PureRef.
- Affichage de la disponibilite des outils dans le dashboard et dans `Settings`.
- Bouton `Detecter` dans `Settings`.

### Notes

- Unity et PureRef ne sont pas lances pour la detection ; BlendUp verifie les chemins explicites et les emplacements d'installation courants.
- Blender peut aussi etre trouve via la commande `blender` ou `BLENDUP_BLENDER_PATH`.
- La creation assistee de projet reste a implementer.

### Verification

- `npm run typecheck` : OK.
- `npm run build` : OK.
- `cargo fmt` dans `apps/desktop/src-tauri` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Prochaine Etape

- Ajouter l'assistant de creation de projet.
- Ajouter ensuite les actions d'ouverture de fichiers/dossiers depuis les fiches assets.
- Continuer le flux Blender vers FBX et la premiere integration Unity.

## 2026-06-27 - Reprise Sur Nouvel Ordinateur Et Synchro Documentation

### Contexte

- Recuperation du depot sur un autre ordinateur via Git.
- Lecture complete du README et de la documentation `docs/` pour reprendre le contexte.
- Confrontation de la documentation a l'etat reel du code.

### Constats

- La creation de projet assistee est en fait deja implementee dans le code :
  - commande Tauri `create_project` dans `apps/desktop/src-tauri/src/main.rs` ;
  - formulaire `createProjectFromWelcome` dans l'ecran d'accueil de `App.tsx`.
  Les entrees de journal precedentes la listaient encore comme "a implementer".
- Le backend Tauri lit et ecrit maintenant des donnees `.blendup` (settings, export, creation de projet), au-dela de la simple lecture.
- L'application expose les vues `Dashboard`, `Assets`, `Problems`, `Tasks`, `Git` et `Settings`.
- Le dossier de test reel est `BlendUp_projet_Test/` (sous-module Git), alors que la doc le nommait `BlendUpTest/`.
- Le projet test contient deux fiches assets (`PROP_CubeCrate_01`, `ENV_Rock_01`) et deux taches internes ; le troisieme asset test reste a creer.
- Le working tree apparait entierement modifie sous Git, mais il s'agit uniquement de differences de fins de ligne (CRLF/LF) liees au changement de machine, pas de modifications de contenu.

### Fait

- Mise a jour du README (`Etat actuel`) pour refleter les vues Dashboard/Settings, les settings locaux, le selecteur de dossier natif, la detection d'outils et la creation de projet assistee.
- Alignement du nom du projet test sur le dossier reel `BlendUp_projet_Test` dans la documentation de reference (`README.md`, `docs/00-index.md`, `docs/preproduction/04-questions-ouvertes.md`, `docs/preproduction/05-projet-test.md`).
- Precision dans `05-projet-test.md` que le projet test est integre comme sous-module Git.

### Notes

- Cette session est volontairement limitee a la synchronisation de la documentation avec l'etat deja realise. Les plans futurs (roadmap, backlog, scope) n'ont pas ete modifies.
- L'add-on Blender dedie et le package Unity dedie ne sont toujours pas implementes.

### Prochaine Etape

- Continuer le flux Blender vers FBX et la premiere integration Unity/prefab.
- Ajouter les actions d'ouverture de fichiers/dossiers depuis les fiches assets.
- Creer le troisieme asset test (`material`/`texture`).

## 2026-06-27 - Add-on Blender V1

### Fait

- Creation de l'add-on Blender dans `apps/blender-addon` (package `blendup/`).
- Architecture en deux couches :
  - `blendup/core/` : logique metier sans `bpy` (detection projet/asset, lecture/ecriture `.blendup`, nomenclature, validation, format JSON, liens) ;
  - `bpy_adapter.py`, `ops/`, `ui/`, `prefs.py`, `handlers.py` : couche Blender.
- Detection du projet par recherche d'un parent contenant `.blendup/project.json`.
- Detection de l'asset lie par `paths.blenderSource`, avec memorisation d'un id dans la scene.
- Panneau BlendUp dans la sidebar de la vue 3D (onglet `BlendUp`).
- Export FBX manuel vers `paths.fbxExport`, ecriture de l'etat d'export dans la fiche (`lastExportAt`, `lastExportStatus`, `status`, `updatedAt`) au meme format JSON que le backend.
- Auto-export au save selon le mode d'export par asset (auto / manuel / disabled).
- Reglages d'export FBX places dans les preferences de l'add-on.
- Validation de base avant export (objets exportables, echelle, nomenclature, materiaux).
- Templates simples : materiau de base, collider simple, preparation static mesh.
- Action "ouvrir la fiche dans BlendUp" via `.blendup/temp/open-request.json` + tentative `blendup://asset/<id>`.
- Journal d'activite alimente (`asset.exported`, `asset.export_failed`, `asset.export_mode_changed`).
- Tests du coeur sans Blender dans `apps/blender-addon/tests`.

### Verification

- `python apps/blender-addon/tests/test_core.py` : 8/8 OK.
- `py_compile` sur tous les fichiers de l'add-on : OK (syntaxe valide).
- Format JSON ecrit par l'add-on : identique octet pour octet a une fiche ecrite par le backend.

### Notes

- Le test "vivant" dans Blender (panneau, export reel, auto-export) reste a faire par l'utilisateur : pas de Blender dans l'environnement de developpement courant.
- L'add-on cible Blender 4.0+ via `bl_info`.
- L'ouverture de fiche depuis Blender necessite encore un suivi cote application : surveiller `.blendup/temp/open-request.json` ou enregistrer le protocole `blendup://`.

### Prochaine Etape

- Tester l'add-on dans Blender sur le projet test (`PROP_CubeCrate_01`).
- Cote application : consommer `.blendup/temp/open-request.json` pour ouvrir une fiche.
- Demarrer le package Unity minimal (import FBX -> prefab) pour fermer la boucle.
