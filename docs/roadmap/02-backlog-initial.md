# Backlog Initial

Ce backlog transforme la preproduction en blocs de travail.

Il ne s'agit pas encore d'un planning definitif, mais d'une base pour decouper la production.

## Phase 0 - Decisions Techniques

- [ ] Choisir la technologie de l'application desktop.
- [x] Choisir la technologie de l'application desktop : Tauri + TypeScript + React.
- [x] Choisir la librairie UI : HeroUI.
- [x] Choisir le format exact des fichiers `.blendup` : JSON + JSONL.
- [x] Definir la structure de projet par defaut.
- [x] Definir les conventions de nommage initiales.
- [x] Definir les types d'assets V1.
- [x] Definir les presets V1.
- [x] Definir les outils Git/Git LFS minimum.

## Phase 1 - Donnees Et Projet

- [ ] Creer `.blendup/project.json`.
- [ ] Creer modele asset.
- [ ] Creer modele task interne.
- [ ] Creer modele reference.
- [ ] Creer modele lock.
- [ ] Creer activity log.
- [ ] Creer schemaVersion.
- [ ] Creer systeme de lecture/ecriture.
- [ ] Creer premiere migration vide.

## Phase 2 - Application BlendUp

- [ ] Ouvrir projet.
- [ ] Creer projet.
- [ ] Configurer chemins.
- [ ] Lister assets.
- [ ] Creer asset.
- [ ] Editer asset.
- [ ] Rechercher assets.
- [ ] Filtrer assets.
- [ ] Afficher fiche asset.
- [ ] Afficher vue artiste.
- [ ] Afficher vue dev.
- [ ] Afficher Problems.
- [ ] Afficher Project Settings.

## Phase 3 - Nomenclature Et Validation

- [ ] Definir regles nom asset.
- [ ] Definir regles nom branche.
- [ ] Definir regles dossiers.
- [ ] Implementer warnings.
- [ ] Implementer corrections proposees.
- [ ] Implementer corrections automatiques mineures.
- [ ] Implementer budgets qualite simples.
- [ ] Implementer validations bloquantes V1.
- [ ] Implementer validations warning V1.
- [ ] Afficher resultats dans Problems.

## Phase 4 - Add-on Blender Minimal

- [ ] Detecter projet BlendUp.
- [ ] Lire fiche asset.
- [ ] Afficher panneau BlendUp.
- [ ] Ouvrir fiche dans l'application.
- [ ] Exporter FBX.
- [ ] Lire profil export.
- [ ] Valider avant export.
- [ ] Ecrire statut export.
- [ ] Creer template static mesh.
- [ ] Activer/desactiver auto-export.

## Phase 5 - Package Unity Minimal

- [ ] Lire `.blendup/project.json`.
- [ ] Lire assets.
- [ ] Associer FBX a asset.
- [ ] Creer prefab si absent.
- [ ] Mettre a jour prefab.
- [ ] Appliquer composants autorises.
- [ ] Distinguer composants obligatoires et recommandes.
- [ ] Ajouter confirmation de retrait volontaire d'un composant attendu.
- [ ] Proteger les modifications manuelles du prefab.
- [ ] Remonter composants presents.
- [ ] Remonter erreurs import.
- [ ] Remonter warnings.
- [ ] Afficher fenetre Unity minimale si utile.

## Phase 6 - Git Et LFS

- [ ] Detecter depot Git.
- [ ] Afficher branche actuelle.
- [ ] Afficher fichiers modifies.
- [ ] Proposer creation branche.
- [ ] Generer nom branche.
- [ ] Detecter Git LFS.
- [ ] Creer `.gitattributes` automatiquement.
- [ ] Detecter gros fichiers non LFS.
- [ ] Implementer verrou BlendUp.
- [ ] Preparer option Git LFS Lock.

## Phase 7 - References Et Taches

- [ ] Lier dossier references.
- [ ] Lier images.
- [ ] Lier fichier PureRef.
- [ ] Ouvrir PureRef.
- [ ] Creer tache interne.
- [ ] Lier tache a asset.
- [ ] Garder le modele extensible pour une future sync ClickUp.

## Phase 8 - Thumbnails

- [ ] Permettre thumbnail manuel.
- [ ] Stocker chemin thumbnail.
- [ ] Afficher thumbnail dans liste.
- [ ] Afficher thumbnail dans fiche.
- [ ] Explorer generation depuis Blender.
- [ ] Explorer generation depuis Unity.

## Phase 9 - Review Et Statuts

- [ ] Statuts de base.
- [ ] Proprietaire artiste.
- [ ] Referent dev.
- [ ] Reviewer optionnel.
- [ ] Notes artiste/dev.
- [ ] Marquer besoin correction art.
- [ ] Marquer besoin correction dev.
- [ ] Marquer valide.

## Phase 10 - Stabilisation V1

- [ ] Tester sur un projet exemple.
- [ ] Tester creation asset.
- [ ] Tester export Blender.
- [ ] Tester import Unity.
- [ ] Tester prefab update.
- [ ] Tester mode prototype.
- [ ] Tester verrouillage.
- [ ] Tester problemes.
- [ ] Corriger UX.
- [ ] Documenter installation.

## MVP Minimal Encore Plus Petit

Si le scope doit etre reduit, garder uniquement :

- [ ] app BlendUp avec fiches assets ;
- [ ] source Blender + export FBX + prefab Unity ;
- [ ] add-on Blender export manuel ;
- [ ] package Unity prefab simple ;
- [ ] notes/statut ;
- [ ] nomenclature simple ;
- [ ] Problems.
