# Choix Techniques Provisoires

## Statut

Ce document propose une direction technique pour la V1. Les choix doivent etre confirmes avant implementation, mais ils donnent une base claire pour la suite.

## Objectifs Techniques

La stack doit permettre :

- application desktop locale ;
- acces fichiers projet ;
- lecture/ecriture JSON ;
- lancement Blender/Unity/PureRef ;
- integration Git ;
- interface sobre et reactive ;
- packaging Windows en priorite ;
- Linux si le cout reste raisonnable ;
- evolution future vers plus d'integrations.

## Application Desktop

### Option Validee : Tauri + TypeScript + React

Pourquoi :

- application desktop plus legere qu'Electron ;
- frontend web moderne ;
- acces fichiers local via backend ;
- bon modele pour une UI sobre ;
- TypeScript utile pour manipuler des schemas ;
- separation propre UI/logique systeme.

Frontend possible :

- React ;
- TypeScript ;
- state management simple au debut ;
- composants UI sobres.

Organisation frontend actuelle :

- `apps/desktop/src/App.tsx` reste un composant d'assemblage court ;
- `apps/desktop/src/app/useBlendUpController.ts` porte l'etat et les actions principales ;
- `apps/desktop/src/app/` contient les types, filtres, metriques et composants UI partages ;
- `apps/desktop/src/views/` contient les vues `Dashboard`, `Assets`, `References`, `Problems`, `Tasks`, `Git`, `Nomenclature`, `Equipe`, `Settings` et `WelcomePage`.

Backend possible :

- Rust via Tauri commands ;
- ou logique systeme minimale au debut ;
- appels Git ;
- lecture/ecriture fichiers ;
- lancement outils externes.

### Option Alternative : Electron + TypeScript

Avantages :

- ecosysteme tres large ;
- integration Node.js simple ;
- beaucoup d'exemples ;
- developpement rapide.

Inconvenients :

- application plus lourde ;
- packaging parfois plus massif.

### Option Alternative : C#/.NET Desktop

Avantages :

- coherent avec Unity/C# ;
- bon acces systeme Windows ;
- performant.

Inconvenients :

- UI potentiellement moins flexible selon framework ;
- moins direct si on veut une interface web-like.

### Decision Provisoire

Pour la V1, partir sur :

```text
Application : Tauri + TypeScript + React
Donnees : JSON versionne dans .blendup
Add-on Blender : Python
Package Unity : C# Editor
Blender cible : 4.0+
Unity cible : Unity 6.0, reference 6000.0.77f1
```

Electron n'est pas prioritaire. Tauri est considere suffisant pour la V1.

## Systeme UI / Composants

Le systeme UI designe la base de composants reutilisables :

- boutons ;
- champs ;
- menus ;
- listes ;
- tableaux ;
- tags ;
- statuts ;
- panneaux ;
- modales ;
- layout ;
- couleurs ;
- espacements.

Decision V1 :

- utiliser HeroUI comme librairie React ;
- creer un design system interne sobre au-dessus de HeroUI ;
- utiliser des composants React reutilisables ;
- eviter une UI trop decorative ;
- prioriser listes, filtres, panneaux de detail et problemes.

Note de production : la documentation HeroUI indique que HeroUI v2 sera deprecie prochainement et recommande HeroUI v3 pour les nouveaux projets. Avant de figer les versions UI, verifier la version HeroUI stable la plus adaptee. Le premier scaffold frontend reste volontairement simple et pourra integrer HeroUI progressivement.

## Settings Locaux Utilisateur

Deux types de reglages doivent etre separes.

Reglages projet, versionnes dans `.blendup` :

- chemins projet ;
- conventions ;
- presets ;
- types d'assets ;
- budgets qualite ;
- composants Unity autorises.

Reglages personnels, non versionnes :

- derniers projets ouverts ;
- taille/position de fenetre ;
- theme ;
- preferences d'affichage ;
- chemins locaux vers executables Blender/Unity/PureRef si necessaire ;
- tokens personnels futurs.

Recommandation V1 :

- stocker les reglages personnels dans le dossier de configuration de l'application Tauri ;
- ne pas les mettre dans Git ;
- garder tous les reglages d'equipe dans `.blendup`.

Implementation actuelle :

- fichier local Windows : `%APPDATA%/BlendUp/user-settings.json` ;
- fallback Linux : `$XDG_CONFIG_HOME/BlendUp/user-settings.json` ou `$HOME/.config/BlendUp/user-settings.json` ;
- champs initiaux : dernier projet, projets recents, chemin Blender, chemin Unity, chemin PureRef ;
- fallback navigateur de developpement : `localStorage`.

Le dernier projet ouvert est recharge au demarrage si le chemin existe encore. Si le projet ne peut pas etre charge, BlendUp affiche l'accueil avec un message d'erreur.

Selection de dossier :

- plugin Tauri utilise : `@tauri-apps/plugin-dialog` / `tauri-plugin-dialog` ;
- permission Tauri : `dialog:allow-open`.

Creation de projet :

- commande Tauri : `create_project` ;
- creation du dossier racine si necessaire ;
- refus si `.blendup/project.json` existe deja ;
- generation de `.blendup/project.json`, presets, conventions de nommage, migrations appliquees vides et journal d'activite vide ;
- creation optionnelle des dossiers Unity de base ;
- creation optionnelle d'un `.gitignore` Unity/BlendUp si le fichier n'existe pas encore.

Detection outils locaux :

- Blender : chemin explicite, variable `BLENDUP_BLENDER_PATH`, commande `blender`, dossiers `Blender Foundation` ;
- Unity : chemin explicite, installations Unity Hub connues ;
- PureRef : chemin explicite, emplacements d'installation courants.

Unity et PureRef ne sont pas lances pour la detection afin d'eviter d'ouvrir des applications lourdes en arriere-plan.

Ouverture de fichiers projet :

- commande Tauri : `open_project_path` ;
- entree : dossier projet + chemin relatif stocke dans une fiche asset ;
- verification que le fichier existe et reste dans le dossier projet ;
- ouverture via l'application par defaut du systeme (`cmd /C start` sur Windows, `open` sur macOS, `xdg-open` sur Linux).

Comptes locaux V1 :

- les comptes simples de la page `Equipe` sont stockes localement par projet via `localStorage` ;
- ils servent a choisir une identite et des roles independants (`artist`, `developer`, `art_director`), pas a securiser l'application ;
- le compte local `owner` est fixe et represente le createur du projet ; le transfert d'owner n'est pas expose en V1 ;
- une migration future pourra deplacer les membres d'equipe dans `.blendup` si l'equipe veut versionner cette information.

## Donnees

Format recommande :

- JSON pour les donnees machine ;
- JSON Lines pour activity log ;
- Markdown pour documentation humaine.

Pourquoi JSON :

- simple ;
- lisible ;
- bien supporte partout ;
- compatible TypeScript/C#/Python ;
- facile a versionner.

Points a prevoir :

- `schemaVersion` ;
- validation de schema ;
- migrations ;
- backups simples avant migration.

## Add-on Blender

Technologie :

```text
Python + Blender API
```

Responsabilites :

- panneau UI minimal ;
- export FBX ;
- validation ;
- templates Blender ;
- ecriture metadata export.

Communication :

- fichiers `.blendup` ;
- lancement URL/protocole local plus tard si besoin ;
- pas de serveur obligatoire en V1.

## Package Unity

Technologie :

```text
C# Editor scripts
Unity package local
AssetPostprocessor
PrefabUtility
```

Responsabilites :

- import FBX ;
- creation/mise a jour prefab ;
- composants Unity ;
- import status ;
- warnings/errors.

Structure possible :

```text
Unity/Packages/com.blendup.pipeline/
  package.json
  Editor/
    BlendUpProject.cs
    BlendUpAssetDatabase.cs
    BlendUpModelPostprocessor.cs
    BlendUpPrefabBuilder.cs
    BlendUpSettingsWindow.cs
```

## Git

Approche V1 :

- utiliser le binaire Git installe sur la machine ;
- commandes simples ;
- pas de lib Git complexe au debut ;
- parser les sorties avec prudence ;
- garder les actions limitees.

Fonctions :

- status ;
- current branch ;
- create branch ;
- detect LFS ;
- detect locks si active ;
- creer `.gitattributes` automatiquement.

## ClickUp

Approche V1 :

- modele interne d'abord ;
- pas de connexion API ClickUp ;
- pas de sync ClickUp ;
- architecture compatible avec une future integration.

## PureRef

Approche V1 :

- ouvrir fichier `.pur` ;
- stocker chemin ;
- organiser dossiers d'images de references ;
- separer references globales DA et references par asset ;
- ne pas editer profondement.

## Tests A Prevoir

### Application

- lecture/ecriture assets ;
- migrations ;
- filtres/recherche ;
- validation nomenclature ;
- generation chemins.

### Blender

- export FBX simple ;
- validation ;
- auto-export active/desactive ;
- templates.

### Unity

- import FBX ;
- creation prefab ;
- update prefab ;
- composants attendus ;
- erreurs import.

## Packaging

Priorite :

1. Windows.
2. Linux si le cout reste raisonnable.
3. Plus tard macOS si besoin.

Raison :

- contexte utilisateur actuel Windows ;
- Unity/Blender tres souvent en environnement Windows dans ce type de setup ;
- reduire le scope V1.

## Points A Verifier Avant Code

- verifier compatibilite Unity `6000.0.77f1` ;
- verifier compatibilite Blender 4.0 ;
- format exact des chemins Windows ;
- politique de chemins relatifs ;
- integration Git LFS sur machine utilisateur ;
- mecanisme de lancement Blender/Unity ;
- stockage des settings utilisateur locaux.
