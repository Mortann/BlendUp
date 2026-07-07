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

## 2026-06-27 - Socle Vues Artiste/Dev

### Contexte

- Avant de reimplementer les ecrans perdus (Dashboard, Settings, accueil, creation de projet), pose du socle des deux vues artiste/dev, conformement a `docs/specs/04-interface-ux.md`.
- Decision produit : V1 limitee a deux roles (artiste/dev) ; le role adapte l'affichage ET les actions (garde-fous doux).

### Fait

- Nouveau module `apps/desktop/src/blendup/roles.ts` : type `Role` (`artist` | `developer`), table de capacites par role (`RoleCapabilities`), defaut depuis `project.defaultView`, persistance locale du role actif.
- `App.tsx` : etat `role`, selecteur Artiste/Dev dans la barre laterale, indicateur de vue dans l'en-tete.
- Fiche asset adaptee au role : ordre des sections (Unity d'abord en dev, Fichiers/Notes d'abord en artiste), emphase des notes du role, action Export reservee a la vue artiste.
- Action Export filtree par capacite dans la fiche asset et dans la vue Problems.
- CSS pour le selecteur de vue et l'emphase des notes.

### Verification

- `npm run typecheck` : OK.
- Build complet (`vite`) et `cargo check` a relancer cote Windows (binaire natif Vite/rolldown et cargo indisponibles dans l'environnement Linux courant).

### Notes

- Le role actif est persiste cote frontend (localStorage) pour la V1 ; il pourra rejoindre les settings utilisateur natifs (hors Git) plus tard sans changer l'API de `roles.ts`.
- Permissions douces V1 limitees a deux roles ; lead/admin non prevus pour l'instant.
- Le frontend etait encore sur l'UI simple (Assets/Problems/Tasks/Git) suite a la perte d'App.tsx ; le socle de roles a ensuite ete fusionne avec les ecrans reimplementes.

### Prochaine Etape

- Finaliser la restauration de Dashboard / Settings / accueil / creation de projet en s'appuyant sur le role et le backend existant.
- Re-brancher la consommation `open-request`.

## 2026-06-27 - Incident : Perte De Travail Non Committe Sur App.tsx

### Ce Qui S'Est Passe

- Le working tree contenait un gros travail **non committe** (frontend tres en avance sur le dernier commit Git).
- Lors d'une correction de fins de ligne, une restauration depuis le dernier commit (`git show HEAD`) a **ecrase la version de travail** de `App.tsx`, `projectLoader.ts` et `types.ts`.
- `projectLoader.ts` et `types.ts` ont ete restaures a l'identique. `main.rs` n'avait pas ete ecrase (seule sa fin, tronquee par l'outil d'edition, a ete reconstruite).
- `App.tsx` n'a pas pu etre recupere dans sa version la plus recente. L'utilisateur a fourni une version anterieure de `App.tsx`, qui a ete reinstallee.

### Fonctionnalites Frontend Perdues (UI seulement)

Ces ecrans existaient dans la version non committee et ne sont plus dans le `App.tsx` courant. Le **backend Rust correspondant existe toujours** (`main.rs`) :

- ecran d'accueil (aucun projet charge) ;
- vue `Dashboard` projet ;
- vue `Settings` (chemins locaux, detection d'outils) ;
- creation de projet assistee (UI) ;
- selecteur de dossier natif et detection d'outils cote UI ;
- chargement automatique du dernier projet / projets recents cote UI.

Le code compile de ces ecrans subsiste uniquement dans le bundle `apps/desktop/dist/` (minifie). A reimplementer proprement par-dessus le socle actuel.

### Etat Frontend Courant

- UI active : `Assets`, `Problems`, `Tasks`, `Git` + socle de roles artiste/dev.
- `npm run typecheck` : OK.

### Lecons / A Faire

- Committer regulierement ; ne jamais restaurer depuis Git par-dessus du non committe sans sauvegarde.
- Ajouter un `.gitattributes` (`* text=auto`) pour stopper le bruit CRLF/LF.

## 2026-06-27 - Differenciation Forte Artiste/Dev

### Fait

- Capacites de role enrichies dans `roles.ts` (accent couleur, orientation, `showRawPaths`, `showUnityDetails`, `showExportDetails`, `showAllOwners`, `canRebuildPrefab`...).
- Deux fiches asset distinctes :
  - `ArtistAssetDetail` : epuree, orientee Blender, peu de technique (source Blender, references, notes artiste, a corriger) ;
  - `DevAssetDetail` : dense, orientee Unity (import/prefab, composants attendus + presents, warnings Unity, chemins bruts, details d'export, equipe, notes dev+artiste, problems, plus d'actions).
- Difference visuelle : classe `role-*` + variable CSS `--role-accent`, badge d'orientation, bandeau d'accent en haut de fiche, densite differente, chemins en monospace cote dev.
- L'export FBX reste reserve a la vue artiste.

### Verification

- `npm run typecheck` : OK.
- `npm run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- Les actions dev (rebuild prefab, definir composants, ouvrir Unity, besoin correction art) sont presentes mais desactivees ("a venir").
- Le theme a ensuite ete harmonise en noir/blanc/bleu nuit lors de la refonte UI.

## 2026-06-27 - Restauration App.tsx Complet Et Open-Request

### Contexte

- L'utilisateur a recupere une version complete d'`App.tsx` (UI complete : accueil, Dashboard, Settings, creation de projet) deja fusionnee avec le socle de roles artiste/dev et l'amorce open-request.
- Le fichier recupere etait tronque en fin (coupe au milieu de `TasksView`).

### Fait

- Reconstruction de la fin manquante d'`App.tsx` (reste de `TasksView` + composants : `TaskSummaryCard`, `TaskDetail`, `GitView`, `ProblemsView`, `SegmentedControl`, `ProblemDetail`, `AssetRow`, `AssetProblems`, `ArtistAssetDetail`, `DevAssetDetail`, etc.).
- Re-definition de deux helpers du dashboard perdus (`problemSummary`, `taskSummary`).
- Completion de la fonctionnalite "ouvrir la fiche dans BlendUp" :
  - consommation d'une requete en attente a l'ouverture d'un projet (deja present) ;
  - ajout du **polling** continu (`takeOpenRequest` toutes les 1,5 s) pour ouvrir la fiche en direct quand l'add-on Blender ecrit `.blendup/temp/open-request.json` pendant que l'app est ouverte.

### Boucle open-request complete

1. Add-on Blender ecrit `.blendup/temp/open-request.json`.
2. Backend `take_open_request` lit puis supprime la requete.
3. Frontend : consomme au chargement + polling -> selectionne l'asset et bascule sur la vue Assets.

### Verification

- `npm run typecheck` : OK.
- Build complet (`vite`) et `cargo check` a relancer cote Windows.

### Prochaine Etape

- Tester l'ouverture de fiche depuis Blender de bout en bout dans l'app native.
- Continuer le pipeline Unity (package minimal : FBX -> prefab).

## 2026-06-27 - Refonte UI Et Decoupage Frontend

### Fait

- Refactor de `App.tsx` : passage d'un fichier monolithique a un composant d'assemblage court.
- Ajout de `apps/desktop/src/app/useBlendUpController.ts` pour centraliser l'etat, les actions projet, l'export, les settings locaux, l'open-request et la detection outils.
- Ajout de modules partages dans `apps/desktop/src/app/` :
  - types d'application ;
  - filtres ;
  - metriques ;
  - composants UI communs ;
  - shell de workspace.
- Deplacement des vues dans `apps/desktop/src/views/`.
- Ajout d'une vraie vue `References`.
- Refonte visuelle :
  - shell global noir ;
  - vue artiste avec surface claire ;
  - vue dev avec surface sombre ;
  - palette noir/blanc/bleu nuit ;
  - abandon des accents verts/teal.
- Dashboard adapte au role :
  - artiste : taches, derniers assets travailles, References/Assets, Git en suivi secondaire ;
  - dev : Problems, Tasks, Git en priorite, Assets/References en retrait.
- Page Assets revue :
  - navigation par dossiers ;
  - details masques tant qu'aucun asset n'est selectionne ;
  - cartes plus visuelles en artiste ;
  - liste compacte en dev.
- Les outils locaux ne sont plus affiches dans le dashboard ; ils restent dans `Settings`.

### Verification

- `npm run typecheck` : OK.
- `npm run build` : OK.

### Notes

- Verification visuelle via navigateur integre tentee, mais le plugin navigateur a echoue sur une erreur interne de chemin. Le serveur Vite local reste disponible pour inspection manuelle.
- `apps/unity-package/` et le sous-module `BlendUp_projet_Test` etaient deja presents/modifies dans le workspace et n'ont pas ete touches.

## 2026-06-28 - Passe UX Workspace, Assets, Taches Et Equipe

### Fait

- Suppression du bandeau technique haut du workspace pour donner plus de place a la page centrale.
- Ajout d'une barre laterale repliable : navigation complete en mode ouvert, icones seules en mode replie.
- Remplacement du controle Artiste/Dev par une bascule plus visuelle.
- Le logo seul en haut a droite ferme le projet et renvoie a l'accueil de l'application.
- Vue artiste adoucie : surface claire moins violente, contrastes corriges.
- Page Assets retravaillee :
  - navigation par dossiers type explorateur ;
  - tri et modes d'affichage ;
  - detail artiste dans un panneau flottant ;
  - suppression du bouton `Exporter FBX` de la fiche artiste ;
  - historique minimal visible dans la fiche asset ;
  - bouton `Ouvrir dans Blender` branche sur une commande native.
- Ajout de la commande Tauri `open_project_path` pour ouvrir un fichier projet via l'application par defaut du systeme.
- Page `Nomenclature` ajoutee avec lecture artiste/dev.
- Page `Equipe` ajoutee avec comptes locaux simples, owner, choix d'identite et roles artiste/dev.
- Vue Tasks remplacee par un tableau type kanban avec ajout, edition, suppression, deplacement, sous-taches et assignation locale.
- Vue References enrichie : recherche, tri, ajout local, theme et association optionnelle a un asset.
- Vue Problems reorganisee en colonnes par gravite pour eviter une liste infinie.
- Vue Git differenciee :
  - artiste : etat simple et actions comprehensibles ;
  - dev : branche, statut, fichiers et actions a brancher ensuite.

### Verification

- `npm run typecheck --workspace @blendup/desktop` : OK.
- `cargo fmt` dans `apps/desktop/src-tauri` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.

### Notes

- Les comptes, ajouts de references et editions de taches sont actuellement locaux cote frontend. Les commandes d'ecriture `.blendup` restent a implementer pour rendre ces changements persistants et versionnables.
- `Ouvrir dans Blender` ouvre le fichier `.blend` via l'application par defaut du systeme ; il faut donc que les fichiers `.blend` soient associes a Blender sur la machine.
- L'ouverture automatique des references liees avec PureRef reste a brancher.

## 2026-06-28 - Ajustements Navigation Et Roles Equipe

### Fait

- Le logo BlendUp est maintenant place en haut a gauche de la barre laterale et remplace le bouton de repli.
- La barre laterale se replie automatiquement apres un clic de navigation quand elle est ouverte.
- Quand la barre laterale est repliee, cliquer une icone navigue puis redeplie la barre.
- Ajout d'une transition de largeur pour rendre ce comportement moins abrupt.
- Le bouton de retour a l'accueil devient un bouton texte discret `Accueil`, sans dupliquer le logo.
- Ajout du role local `Directeur artistique` (`art_director`) dans la page `Equipe`.
- Les roles d'equipe sont independants : un membre peut etre artiste, dev et/ou directeur artistique.
- Le role `Owner` est fixe sur le compte local `owner` et ne peut plus etre transfere depuis l'interface.

### Notes

- Le role `Directeur artistique` prepare la validation des assets artiste. Il ne modifie pas encore les droits de changement de statut asset tant que la refonte Assets artiste n'est pas finalisee.


## 2026-06-28 - Finalisation Assets Artiste

### Fait

- Page Assets artiste en mode explorateur parent/enfant sur les vrais dossiers du projet ; emplacement courant memorise par projet (localStorage).
- Panneau d'acces rapides a gauche : favoris locaux (personnels, par projet) et collections (favoris, a valider, a retravailler).
- Visuel par asset (thumbnail si dispo, sinon carte par type) avec nom, etat artiste et personnes associees.
- L'etat artiste remplace le statut technique en vue artiste : A faire, En cours, A valider, A retravailler, Valide.
- Droits de changement d'etat : les personnes associees avancent jusqu'a `A valider` ; seul le `Directeur artistique` peut valider.
- Verrou natif ajoute dans la commande Tauri `update_asset_status` : refus de passer a `validated` (ou de rouvrir un asset deja `validated`) si l'acteur n'est pas `art_director`. Double la protection de l'UI.

### Verification

- `npx tsc -b --noEmit` (typecheck @blendup/desktop) : OK.
- `vite build` et `cargo check` non rejouables dans l'environnement courant (binaires natifs installes sous Windows, cargo absent du sandbox Linux) ; a relancer en local.

### Notes

- Le compte `owner` conserve par defaut tous les roles (dont `art_director`) : le createur du projet peut donc valider tant qu'aucun autre DA n'est defini.
- Les favoris et l'emplacement d'explorateur restent des preferences locales (hors Git) pour la V1.


## 2026-06-28 - Assets Artiste : Modele Dossier, DnD, Parametres

### Fait

- Modele asset = dossier : chaque asset est un dossier (`.../<nom>/<nom>.blend` + `references/` + `textures/`). Champs `paths.assetFolder`, `referencesDir`, `texturesDir` ajoutes. Migration native idempotente `migrate_assets_to_folders` au chargement du projet.
- BlendUp source de verite du nom : `rename_asset` renomme dossier + `.blend` + MAJ chemins Unity attendus (sans toucher aux fichiers Unity).
- Operations natives sur disque : `move_asset`, `move_folder` (deplacement reel), `delete_asset` (corbeille systeme via crate `trash`), `set_asset_owners` (assignation equipe).
- UI Assets artiste :
  - clic droit (renommer / favori / supprimer pour un asset, ouvrir pour un dossier) ;
  - glisser-deposer assets et dossiers vers un dossier ;
  - panneau gauche reorganise : Recent / General (tous les dossiers) / Favoris / Taches / bouton Parametres ;
  - panneau Parametres (affichage, vignettes, tri, masquer dossiers vides, afficher Taches) persiste par projet ;
  - fiche detail recentree (overlay) + assignation des membres de l'equipe ;
  - suppression du message "Aucun asset ici" (on n'affiche plus rien) ;
  - barre de notification en overlay (ne pousse plus la page).

### Verification

- `npx tsc -b --noEmit` (typecheck @blendup/desktop) : OK.
- Revue manuelle + sous-agent du Rust (cargo absent du sandbox) : pas d'erreur bloquante detectee.
- `vite build` et `cargo check` a relancer en local (binaires natifs Windows / cargo absent du sandbox). Nouvelle dependance: `trash = "3"` dans `apps/desktop/src-tauri/Cargo.toml` (la 1re build telechargera la crate).

### Notes

- La migration deplace reellement les fichiers du projet au chargement ; idempotente (assets deja migres ignores).
- Le renommage/deplacement de dossiers de categorie (Props, Environment) via clic droit n'est pas encore expose ; seul le deplacement par glisser-deposer l'est. Renommer/supprimer un dossier de categorie reste a faire.
- Favoris, dossiers recents et parametres d'affichage restent des preferences locales (hors Git).


## 2026-06-28 - Assets Artiste : Noms, Creation, Avatars, Raccourcis

### Fait

- Nom affiche court (coeur) vs nom technique complet : BlendUp affiche `Rock`, le disque garde `ENV_Rock_01`. Renommer/deplacer repercute sur le `.blend` ET les fichiers Unity `.fbx`/`.prefab` (+ `.meta`).
- Creation complete : `create_asset` (dossier + references/ + textures/ + fiche + `.blend` via Blender headless + copie d'images de reference/texture + notes) et `create_folder`. UI : boutons Asset / Dossier + dialogues.
- Assignation multi-personnes (`assignees`) affichee en avatars facon Trello, editable dans la fiche detail.
- Panneau gauche revu : Recent = dossiers d'assets ouverts dans Blender ; section Etat (par statut) a la place de General/Taches ; bouton Parametres colle en bas.
- Raccourcis clavier configurables (navigation + actions assets), remappables dans Parametres > Raccourcis clavier (persistance localStorage, module `app/shortcuts.ts`).
- Notifications en overlay qui disparaissent automatiquement (4.5 s, 8 s pour les erreurs).

### Verification

- `npx tsc -b --noEmit` : OK.
- Revue Rust (cargo absent du sandbox) par relecture + sous-agent : pas d'erreur bloquante. Nouvelle dependance `trash` deja presente.
- `vite build` / `cargo check` a relancer en local.

### Notes

- La creation du `.blend` necessite Blender detecte (sinon l'asset est cree sans `.blend`, a generer depuis Blender).
- Le deplacement des fichiers Unity repose sur la correspondance de segment de categorie (Models/<categorie>/) ; heuristique a affiner si l'arborescence Unity differe.


## 2026-06-29 - Assets : DnD, dossiers, type par categorie, recherche projet

### Fait

- **Drag & drop corrige** : `dragDropEnabled: false` ajoute a la fenetre dans `tauri.conf.json` (le handler de drop natif Tauri interceptait le drag HTML5 du webview -> curseur "interdit"). DnD renforce cote React (`dataTransfer.effectAllowed`/`dropEffect` + `setData`).
- **Dossiers d'info d'asset masques** : les dossiers qui contiennent les infos d'un asset (`paths.assetFolder` : references/textures/.blend) ne sont plus affiches comme dossiers d'organisation navigables. Corrige le cas "un PROP apparait dans le dossier Environment".
- **Type d'asset deduit de l'emplacement** : mapping categorie -> type (Environment->environment_piece, Props->prop, Characters->character, Materials->material, Textures->texture, UI->ui_image). Le selecteur de type a la creation est remplace par un type en lecture seule (defini par le dossier). Au deplacement d'un asset (et au renommage d'un dossier de categorie), le `type` est recalcule cote Rust (`type_for_folder` dans `move_asset` / `rename_folder`).
- **MultiSelect personnes** : composant custom facon react-select (chips, recherche, dropdown) remplace le `<select multiple>` natif pour artistes/devs.
- **Scrollbars discretes** sur toute l'app (webkit + firefox) dans `styles.css`.
- **Recent** : possibilite de retirer un dossier de la section Recent (bouton au survol).
- **Menu contextuel sur le fond d'un dossier** : creer dossier, creer asset, coller, tri, affichage -> ces options ont ete retirees du coin haut-droit (la barre ne garde que le fil d'Ariane).
- **Menu contextuel sur un dossier** : ouvrir, renommer, supprimer (nouvelles commandes Rust `rename_folder` et `delete_folder`, envoi corbeille + reecriture des fiches assets sous le dossier).
- **Copier / couper / coller / dupliquer un asset** : clipboard local + nouvelles commandes Rust `duplicate_asset` et `copy_asset` (copie recursive du dossier, nouvelle fiche, sorties Unity non dupliquees, type recalcule selon la categorie de destination ; couper/coller reutilise `move_asset`).
- **"Fermer" retire** du menu contextuel des assets.
- **Recherche style Spotlight/Arc** : barre en haut au centre ; au clic (ou Ctrl/Cmd+K), overlay agrandi avec fond floute (backdrop-filter) ; recherche assets + dossiers dans tout le projet, pas seulement le dossier courant.

### Fichiers touches

- `apps/desktop/src/views/AssetsView.tsx` (gros refactor explorateur artiste).
- `apps/desktop/src/styles.css` (scrollbars, spotlight, multiselect, menu contextuel, recents, type par dossier).
- `apps/desktop/src-tauri/src/main.rs` (+`delete_folder`, `rename_folder`, `duplicate_asset`, `copy_asset`, `type_for_category`/`type_for_folder`, `move_asset` met a jour le type).
- `apps/desktop/src-tauri/tauri.conf.json` (`dragDropEnabled: false`).
- `apps/desktop/src/blendup/projectLoader.ts`, `src/app/useBlendUpController.ts`, `src/App.tsx` (cablage des nouvelles commandes).

### Verification

- Revue manuelle (outils de compilation indisponibles dans le sandbox : pas de cargo, et le mount bash renvoie une version tronquee des gros fichiers donc `tsc` y est non fiable).
- **A relancer en local Windows** : `npm run typecheck` (tsc) dans `apps/desktop`, puis `cargo check` / `npm run tauri:dev`.

### Notes

- Mapping categorie->type duplique entre le frontend (`CATEGORY_TYPE_MAP` dans AssetsView) et le backend (`type_for_category` dans main.rs) : garder les deux synchronises si on ajoute une categorie.
- Le drag & drop natif de fichiers depuis l'OS est desactive (`dragDropEnabled: false`) ; si on veut plus tard accepter le depot de fichiers externes, il faudra le reactiver et gerer l'evenement Tauri `drag-drop`.
- La vue Developpeur (inventaire technique) conserve sa barre d'outils ; les changements d'UX (menu contextuel, dossiers, recherche) concernent l'explorateur Artiste.


## 2026-06-29 - Assets : suite (drop, contraste, racine Blender, types dynamiques, variantes)

### Fait

- **Drag & drop** : un clic qui suit un drag n'ouvre plus l'asset par erreur (garde `draggedRef` dans la carte + reset au `dragEnd`).
- **Contraste** : le MultiSelect (et le panneau detail, en theme clair) etait stylise en theme sombre -> repasse en theme clair lisible (bordures, chips, menu, focus). Aligne sur la grille `120px | 1fr` du panneau via un wrapper `.ms-field`.
- **Racine Blender** : le fil d'Ariane demarre desormais a `Blender` (label de la racine du projet) ; impossible de remonter au-dessus. La section Recent ne montre que les dossiers situes strictement sous la racine Blender.
- **Types dynamiques** : chaque dossier de categorie sous Blender definit un type. `AssetType` elargi a `string`. Helpers centralises dans `naming.ts` : `categoryToType` (synonymes connus -> token canonique, sinon slug du nom), `prefixForType` (prefixe connu, sinon 3 premieres lettres en majuscule), `labelForType` (libelle). `formatAssetType` delegue a `labelForType`. Cote Rust : `category_to_type` + `slug_type`, `type_for_folder` renvoie un token dynamique ; applique a la creation, au deplacement et au renommage de dossier. (Ex: dossier `Caracter` -> type `caracter`, prefixe `CAR`.)
- **Variantes d'asset (cote BlendUp)** : modele `AssetVariant` (`variants: AssetVariant[]`), commande Rust `set_asset_variants`, UI dans le detail (lister / ajouter / supprimer), badge "variantes" sur la carte d'asset.

### Fichiers touches (en plus du round precedent)

- `apps/desktop/src/blendup/naming.ts` (catalogue de types, categoryToType/prefixForType/labelForType, buildAssetName dynamique).
- `apps/desktop/src/blendup/types.ts` (`AssetType` elargi, interface `AssetVariant`, `variants` type).
- `apps/desktop/src/ui/format.ts` (`formatAssetType` -> `labelForType`).
- `apps/desktop/src/views/AssetsView.tsx` (drop fix, breadcrumb racine Blender, typeForPath dynamique, section + badge variantes).
- `apps/desktop/src/styles.css` (MultiSelect theme clair, badge + section variantes).
- `apps/desktop/src-tauri/src/main.rs` (`category_to_type`/`slug_type`, `type_for_folder` dynamique, `set_asset_variants`).
- `projectLoader.ts`, `useBlendUpController.ts`, `App.tsx` (cablage `set_asset_variants`).

### A faire / reste

- **Add-on Blender** : miniatures auto qui ne fonctionnent pas + gestion des variantes cote add-on -> a traiter dans une prochaine session (apps/blender-addon).
- Garder synchronises le mapping categorie->type entre `naming.ts` (frontend) et `main.rs` (backend).

### Verification

- Revue manuelle (cargo absent du sandbox ; mount bash tronque les gros fichiers donc tsc non fiable ici).
- **A relancer en local Windows** : `npm run typecheck` puis `cargo check` / `npm run tauri:dev`.


## 2026-07-05 - Assets Artiste : racines, nomenclature et miniatures

### Fait

- Renommer ou deplacer un asset ne selectionne plus automatiquement l'asset apres validation/depot.
- Texte "Clic droit pour les options" retire de la barre Assets.
- Section General de la vue artiste : l'entree racine `Blender` n'est plus affichee ; les dossiers sous les racines configurees sont affiches directement.
- Parametres Assets : ajout des racines d'assets projet, sauvegardees dans `project.assets.roots`.
- Snapshot Tauri enrichi avec `assetTypePresets` et `assetNamingRules`.
- Page Nomenclature rendue editable : types, prefixe, alias de dossiers (`categoryNames`), influence, suffixes Blender et fragments interdits.
- Le type d'asset est maintenant deduit depuis le premier dossier sous une racine configuree, via `.blendup/presets/asset-types.json`.
- Deplacer un asset ou un dossier recalcule `asset.type` et renomme le prefixe du nom technique selon le type cible.
- Ajout du type exemple `assets` / prefixe `ASS` pour couvrir les dossiers nommes `Assets`.
- Les dossiers affichent un apercu compose des miniatures des assets contenus.
- Add-on Blender passe en `0.1.1` : generation de vignette plus robuste au save (`render.opengl` tente le contexte viewport puis fallback).

### Verification

- `npm.cmd run typecheck --workspace apps/desktop` : OK.
- `C:\Users\morit\.cargo\bin\cargo.exe check` dans `apps/desktop/src-tauri` : OK.

### Notes

- Les miniatures sont generees au prochain enregistrement du `.blend` lie a une fiche asset. Les vignettes deja absentes ne sont donc pas retro-generees tant que Blender n'a pas resauvegarde l'asset.
- Les racines d'assets sont projet/versionnables ; les preferences d'affichage restent locales par projet.


## 2026-07-05 - Corrections Assets et bouton Blender

### Fait

- Parametres Assets appliques immediatement : affichage par defaut, tri par defaut, taille de vignette.
- Option `Masquer les dossiers vides` branchee sur les listes de dossiers.
- Option `Afficher la partie Taches` branchee sur le panneau gauche Assets.
- Ajout de `Afficher dans l'explorateur` dans le menu contextuel d'un asset ou d'un dossier.
- Rafraichissement automatique du snapshot quand la vue Assets est ouverte, pour voir les miniatures generees par Blender sans redemarrer l'app.
- Cache-buster sur les URLs de miniatures pour eviter qu'une ancienne image/absence d'image reste en cache.
- Add-on Blender `0.1.2` : le bouton `Ouvrir la fiche dans BlendUp` n'ouvre plus `blendup://`, donc plus de popup Microsoft Store si le protocole n'est pas enregistre. Il ecrit la requete fichier et lance seulement l'executable BlendUp si un chemin est renseigne.

### Verification

- `npm.cmd run typecheck --workspace apps/desktop` : OK.
- `npm.cmd run build --workspace apps/desktop` : OK.
- `C:\Users\morit\.cargo\bin\cargo.exe check` dans `apps/desktop/src-tauri` : OK.


## 2026-07-07 - Assets : miniatures, console Blender, variantes, LODs et visualisation

### Fait

- Miniatures : fallback plus robuste. Le snapshot natif renseigne `paths.thumbnail` si un fichier `.blendup/thumbnails/<assetId>.<ext>` existe, meme si la fiche asset ne l'avait pas encore. Cote UI, si l'URL locale ne charge pas, BlendUp relit l'image via une commande native et l'affiche en data URL.
- Visuel par defaut : remplacement du placeholder trop faible par une vignette par type plus lisible (trame, contraste et icone).
- Ouverture Blender : ajout d'une commande native `open_blend_file`, qui lance directement Blender si un chemin est detecte/renseigne, avec preference locale pour afficher ou masquer l'invite de commande sous Windows.
- Parametres : ajout de l'option `Afficher l'invite de commande...` dans les Settings generaux et les Parametres Assets.
- Variantes : enrichissement du modele (`variantType`, `status`, note courte, liens optionnels Blender/Unity), ajout type/statut/note dans l'UI et correction du contraste du bouton Ajouter.
- LODs : ajout du modele `AssetLod`, commande native `set_asset_lods`, badge carte, section detail pour ajouter/supprimer un niveau avec ratio cible.
- Visualisation : ajout d'une section dans la fiche asset qui regroupe thumbnail/rendu, statut mesh FBX, textures, variantes et LODs.
- Documentation mise a jour : modele de donnees, UX, integrations Blender/Unity, roadmap.

### Verification

- `npm run typecheck` : OK.
- `C:\Users\morit\.cargo\bin\cargo.exe check --manifest-path apps/desktop/src-tauri/Cargo.toml` avec `CARGO_INCREMENTAL=0` : OK.
- `npm run build` : OK.


## 2026-07-07 - Assets : visualisation conditionnelle et viewer FBX

### Fait

- Correction du retour automatique vers la premiere section : la fenetre ne reinitialise plus l'onglet actif a chaque rafraichissement du snapshot.
- Navigation conditionnelle : `Modele 3D` apparait seulement avec un FBX exporte, `Rendus` seulement avec des images dans `renders/`, `Textures` seulement avec des images dans `textures/`.
- Suppression de `Vue d'ensemble`, `Variantes`, `LODs` et `Fichiers` dans la fenetre de visualisation.
- Ajout de Three.js + `FBXLoader` + `OrbitControls` pour afficher le FBX exporte dans un vrai viewer 3D WebGL integre.
- Ajout de reglages 3D : fond, presets de lumieres, grille sol, rotation/orbite/zoom souris.
- Ajout du dossier `renders/` dans les chemins d'asset et d'une commande native `list_project_images` pour alimenter les galeries.
- Rendus et textures affiches en galerie grand format avec fleches et zoom image.
- Documentation mise a jour : UX, modele de donnees, journal.

### Verification

- `npm run typecheck` : OK.
- `npm run build` : OK (avertissement de taille bundle attendu avec Three.js).
- `C:\Users\morit\.cargo\bin\cargo.exe check --manifest-path apps/desktop/src-tauri/Cargo.toml` : OK.


## 2026-07-07 - Assets : fenetre de visualisation interne

### Fait

- La visualisation n'est plus une section compacte dans la fiche artiste.
- Ajout d'un bouton `Visualiser` dans la barre d'actions de la fiche asset, a cote de `Ouvrir dans Blender`, `Historique`, `Favori` et `Renommer`.
- Nouvelle fenetre interne BlendUp : menu gauche (vue d'ensemble, mesh, rendu, textures, variantes, LODs, fichiers), zone centrale de visualisation, panneau droit de parametres contextuels.
- Reglages V1 : fond studio/damier/sombre, zoom, grille, bounds, canal texture et LOD actif selon la section.
- Detail asset artiste aeré : largeur augmentee, suppression du bloc Visualisation, formulaires Variantes/LODs reorganises pour eviter les debordements.
- Documentation mise a jour : UX, modele de donnees, journal.

### Verification

- `npm run typecheck` : OK.
