# Risques Et Limites

## Objectif

Ce document liste les risques du projet et les manieres de les reduire.

BlendUp est pertinent, mais il peut devenir trop ambitieux si la V1 tente de tout couvrir.

## Risque 1 - Vouloir Tout Faire En V1

### Description

BlendUp touche a beaucoup de domaines :

- Blender ;
- Unity ;
- Git ;
- Git LFS ;
- PureRef ;
- asset management ;
- validation ;
- templates ;
- review.

Le risque est de creer un produit trop large, incomplet partout.

### Reduction

V1 centree sur :

- fiches assets ;
- static mesh ;
- export FBX ;
- prefab Unity simple ;
- validation ;
- metadata ;
- vue artiste/validation ;
- problemes.

Le reste doit etre prepare mais pas forcement implemente completement.

## Risque 2 - Generation Unity Trop Magique

### Description

Si BlendUp modifie trop automatiquement les prefabs, les devs peuvent perdre confiance.

### Reduction

- actions visibles ;
- logs ;
- dry run/export test ;
- ne pas supprimer sans confirmation ;
- appliquer uniquement des composants/presets explicitement configures ;
- garder les modifications manuelles quand possible.

## Risque 3 - Templates Trop Complexes

### Description

Les templates peuvent devenir un systeme lourd, difficile a comprendre.

### Reduction

V1 :

- 3 a 5 templates maximum ;
- options limitees ;
- presets lisibles ;
- assistant simple ;
- possibilite de faire manuel.

## Risque 4 - ClickUp Trop Central

### Description

Si ClickUp devient obligatoire, BlendUp depend d'un service externe.

### Reduction

- taches internes d'abord ;
- ClickUp hors V1 ;
- sync plus tard ;
- mode hors ligne garanti.

## Risque 5 - Git Trop Ambitieux

### Description

Un client Git complet est un projet a lui seul.

### Reduction

V1 :

- afficher etat simple ;
- creation branche ;
- nomenclature branche ;
- avertissements ;
- pas de merge avance ;
- pas de resolution de conflits lourde.

## Risque 6 - Verrouillage Trop Promis

### Description

Un verrou BlendUp ne peut pas empecher quelqu'un de modifier un fichier hors de BlendUp.

### Reduction

- presenter comme verrouillage d'equipe ;
- afficher clairement les limites ;
- option Git LFS Lock pour les fichiers binaires ;
- logs d'activite.

## Risque 7 - Support Trop Large Des Assets

### Description

Le projet vise tous les assets, mais chaque type a ses specificites.

### Reduction

Ordre recommande :

1. static mesh / prop ;
2. environment piece ;
3. material/texture ;
4. UI image ;
5. character / animation ;
6. scene/zone.

## Risque 8 - Donnees .blendup Instables

### Description

Si le schema change sans migration, les projets existants cassent.

### Reduction

- `schemaVersion` partout ;
- migrations simples ;
- documentation du modele ;
- tests de migration plus tard.

## Risque 9 - Interface Trop Chargee

### Description

Un hub peut vite devenir illisible.

### Reduction

- vues simples ;
- details dans panneaux ;
- filtres solides ;
- separer artiste/validation ;
- prioriser Problems ;
- cacher les infos avancees dans la vue detail.

## Risque 10 - Performance Sur Gros Projets

### Description

Avec beaucoup d'assets, scanner Unity/Blender peut devenir lent.

### Reduction

- ne pas scanner tout en permanence ;
- indexer les fichiers `.blendup` ;
- calculs a la demande ;
- caches de thumbnails ;
- analyse Uses/Used by progressive.

## Risque 11 - Round Trip Unity -> Blender

### Description

Synchroniser Unity vers Blender completement est fragile.

### Reduction

- ne pas le faire en V1 ;
- Unity remonte metadata vers BlendUp ;
- Blender reste source artistique.

## Risque 12 - Adoption Par L'Equipe

### Description

Si l'outil ajoute plus de contraintes que de confort, l'equipe l'abandonne.

### Reduction

- mode prototype ;
- corrections proposees ;
- onboarding simple ;
- benefice immediat sur creation/export ;
- pas de blocage excessif ;
- continuer a accepter le travail manuel.

## Signaux De Danger Pendant La Production

Si ces signes apparaissent, reduire le scope :

- l'add-on Blender devient trop gros ;
- Unity commence a ecraser des prefabs sans controle ;
- une integration externe prend plus de temps que l'export ;
- la V1 ne peut pas exporter un asset simple rapidement ;
- les reglages projet deviennent incomprehensibles ;
- la vue principale affiche trop d'informations.

## Base Saine

Le projet reste sain si :

- la V1 garde un noyau clair ;
- les integrations externes restent optionnelles ;
- les donnees sont propres ;
- la source de verite est claire ;
- les utilisateurs peuvent comprendre ce que fait BlendUp.
