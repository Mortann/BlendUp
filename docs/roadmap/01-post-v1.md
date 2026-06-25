# Roadmap Post-V1

Ce document liste les evolutions possibles apres une V1 solide.

## V1 - Base Realiste

Objectif :

- pipeline static mesh Blender -> Unity ;
- fiches assets ;
- metadata ;
- validation ;
- prefab simple ;
- app + add-on + package.

La V1 est terminee quand BlendUp rend le flux de base reellement plus simple qu'un workflow manuel.

## V1.1 - Stabilisation Et Qualite

Objectif : fiabiliser la V1 sur un vrai projet.

Idees :

- meilleurs thumbnails ;
- meilleurs logs ;
- meilleure detection des fichiers manquants ;
- amelioration des presets ;
- plus de validations Blender ;
- plus de validations Unity ;
- export test plus complet ;
- verrouillage BlendUp plus clair ;
- premiers tests de migration ;
- amelioration UI des Problems.

## V1.2 - Collaboration

Objectif : rendre le travail d'equipe plus confortable.

Idees :

- branches par asset/tache ;
- verrouillage Git LFS Lock si configure ;
- proprietaires/reviewers plus visibles ;
- notifications locales ;
- review art/dev plus lisible ;
- journal d'activite par asset enrichi ;
- meilleure gestion des taches internes.

## V1.3 - ClickUp

Objectif : integrer ClickUp sans rendre BlendUp dependant.

Idees :

- connecter workspace ClickUp ;
- lier taches ;
- creer tache ClickUp depuis BlendUp ;
- synchroniser statut ;
- synchroniser assignee ;
- detecter conflits ;
- afficher erreurs de sync.

## V1.4 - References Et PureRef

Objectif : rendre la gestion references plus pratique.

Idees :

- ouvrir board PureRef depuis asset ;
- associer plusieurs boards a un theme ;
- generer un board depuis une selection d'images si possible ;
- exporter un apercu ;
- mieux classer references globales/asset.

## V2 - Types D'Assets Plus Avances

Objectif : enrichir les types d'assets au-dela du support simple de la V1.

Types possibles :

- materials avances ;
- textures avancees ;
- UI images avancees ;
- concept art ;
- characters ;
- animations ;
- environment kits.

Chaque type doit avoir :

- template ;
- validation ;
- workflow export/import ;
- vue detail adaptee.

## V2 - Variants Avances

Objectif : rendre les variants plus puissants.

Idees :

- variants multiples par asset ;
- partage de source ;
- prefab variant Unity ;
- variants visuels/material ;
- variants gameplay ;
- comparaison entre variants ;
- statut par variant.

## V2 - Uses / Used By Avance

Objectif : comprendre les dependances du projet.

Idees :

- analyse prefabs Unity ;
- detection materials/textures ;
- scenes utilisant un prefab ;
- assets dependants ;
- alertes avant suppression ;
- graphe simple de dependances.

## V2 - Characters Et Animations

Objectif : couvrir progressivement les personnages.

Idees :

- profils rig ;
- validation armature ;
- animation clips ;
- import settings Unity ;
- avatar/rig Unity ;
- prefab character ;
- budgets specifiques.

Attention : gros chantier, a ne pas mettre en V1.

## V2 - UI Et 2D

Objectif : inclure dessins, UI, textures.

Idees :

- assets UI ;
- export sprites ;
- compression Unity ;
- references DA ;
- naming UI ;
- thumbnails ;
- lien avec prefabs UI.

## V3 - Scenes / Zones

Objectif : aider a organiser les zones du jeu.

Idees :

- zones logiques ;
- liste d'assets par zone ;
- notes art/dev par zone ;
- taches liees ;
- statut d'integration par zone ;
- scene Unity associee ;
- pas forcement une carte visuelle.

## V3 - Automatisation Plus Avancee

Objectif : accelerer les pipelines complexes.

Idees :

- batch export ;
- batch validation ;
- previews automatiques Blender ;
- previews Unity ;
- pipelines par type ;
- hook pre-commit optionnel ;
- generation de rapports.

## V3 - Multi-Projets Et Templates Reutilisables

Objectif : reutiliser BlendUp entre projets.

Idees :

- bibliotheque de templates ;
- import/export de conventions ;
- profils studio ;
- duplication de structure projet ;
- partage de presets.

## Idees A Garder De Cote

A ne pas prioriser tant que la base n'est pas solide :

- marketplace ;
- sync temps reel ;
- edition de scenes Unity depuis BlendUp ;
- remplacement de PureRef ;
- remplacement de ClickUp ;
- systeme de permissions serveur ;
- pipeline USD ;
- chat equipe integre ;
- planning global avance.
