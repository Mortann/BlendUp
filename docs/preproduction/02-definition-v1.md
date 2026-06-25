# Definition De La V1

## Objectif De La V1

La V1 doit prouver que BlendUp apporte une valeur concrete au workflow Blender -> Unity d'une petite equipe.

Elle doit permettre de creer, suivre, valider et exporter des assets Blender vers Unity, puis de voir dans BlendUp l'etat de leur integration.

Le produit doit deja etre utilisable sur un vrai petit projet, meme si certaines integrations restent simples.

## Equipe Cible

La V1 est pensee pour une equipe de :

- 2 a 3 developpeurs ;
- 2 a 3 artistes ;
- un projet Unity versionne avec Git ;
- des assets principalement crees dans Blender ;
- des fichiers lourds suivis par Git LFS.

## Perimetre Principal

La V1 couvre en priorite :

- static meshes ;
- props ;
- petits elements d'environnement ;
- materials avec support simple ;
- textures avec support simple ;
- images UI avec support simple ;
- assets Blender simples exportes en FBX ;
- fiches assets ;
- references et notes ;
- validation de base ;
- generation ou mise a jour de prefabs Unity simples.

Les personnages animes, environnements complexes, dessins et assets avances sont importants pour la vision, mais ne doivent pas etre le coeur technique de la V1.

## Fonctionnalites V1

### Application BlendUp

- Creer ou ouvrir un projet BlendUp.
- Lier un dossier Art/Blender et un projet Unity.
- Creer une fiche asset avec ID stable.
- Lister les assets.
- Rechercher et filtrer les assets.
- Afficher une vue artiste.
- Afficher une vue dev.
- Afficher une fiche detaillee d'asset.
- Gerer les statuts.
- Gerer les proprietaires/responsables.
- Gerer les notes artiste/dev.
- Gerer les references.
- Gerer les tags.
- Afficher les problemes a resoudre.
- Lire et ecrire les donnees `.blendup`.

### Add-on Blender Minimal

- Connaitre le projet BlendUp courant.
- Afficher l'asset ouvert si le fichier Blender est lie a une fiche.
- Ouvrir la fiche asset dans BlendUp.
- Lancer un export manuel.
- Activer/desactiver l'auto-export par asset.
- Executer une validation de base avant export.
- Creer quelques elements depuis templates simples.

### Package Unity Minimal

- Lire les donnees BlendUp.
- Detecter les FBX exportes.
- Creer ou mettre a jour un prefab simple.
- Appliquer quelques presets Unity definis par projet.
- Remonter vers BlendUp l'etat d'import.
- Remonter les composants Unity presents sur le prefab.
- Remonter les erreurs ou warnings d'import.

### Git Et Git LFS

- Detecter si le projet est dans un depot Git.
- Afficher un etat Git simple.
- Prevoir une configuration Git LFS recommandee.
- Permettre une creation de branche assistee.
- Proposer une nomenclature automatique de branche.
- Prevoir un verrouillage BlendUp d'asset.
- Prevoir une option de verrouillage Git LFS si disponible.

### ClickUp

ClickUp ne fait pas partie de la V1.

V1 recommandee :

- modele de tache interne BlendUp ;
- pas de connexion API ClickUp ;
- pas de synchronisation ClickUp ;
- garder une architecture qui permettra une integration ClickUp plus tard.

### PureRef

Pour la V1, PureRef doit etre une integration legere :

- lier un fichier `.pur` a un asset ou a une categorie de references ;
- ouvrir le fichier PureRef depuis BlendUp ;
- ne pas remplacer PureRef ;
- ne pas chercher a editer profondement un board PureRef.

## Hors Perimetre V1

La V1 ne doit pas chercher a faire :

- synchronisation Unity -> Blender complete ;
- support avance des rigs et animations ;
- gestion complete des scenes Unity ;
- carte visuelle des zones ;
- gestion avancee de merge Git ;
- integration ClickUp ;
- remplacement complet de PureRef ;
- workflow USD ;
- dependances moteur tres avancees ;
- permissions strictes ou securite multi-utilisateur ;
- marketplace de templates.

## Definition D'Un Asset V1

Un asset V1 est une unite de production suivie par BlendUp.

Il doit pouvoir contenir :

- un ID stable ;
- un nom visible ;
- un type ;
- un statut ;
- un mode production ou brouillon ;
- un proprietaire art ;
- un referent dev optionnel ;
- un fichier source Blender ;
- un export FBX ;
- un prefab Unity ;
- des notes ;
- des references ;
- des tags ;
- des warnings ;
- un journal d'activite ;
- des variantes simples optionnelles.

## Mode Brouillon / Prototype

Un asset peut etre marque comme brouillon.

Effets :

- il peut ne pas etre exporte automatiquement ;
- il peut ne pas etre importe dans Unity ;
- il peut ignorer certaines validations non critiques ;
- il reste visible dans BlendUp ;
- il ne doit pas polluer la production.

Ce mode est important pour eviter que l'outil bloque la creation.

## Variantes V1

Les variantes doivent rester simples en V1.

Types retenus :

- variante visuelle ;
- variante mesh ;
- variante gameplay simple.

Une variante doit pouvoir avoir :

- un nom ;
- un statut ;
- un export different ou partage ;
- un prefab different ou partage ;
- des notes courtes.

La V1 ne doit pas tenter un systeme complexe de variants imbriques.

## Criteres De Succes V1

La V1 est reussie si :

- un artiste peut creer un asset proprement sans refaire toute la structure a la main ;
- un artiste peut exporter un static mesh Blender vers Unity ;
- Unity peut creer ou mettre a jour un prefab simple ;
- un dev peut voir les composants et l'etat d'integration ;
- les erreurs principales sont visibles dans BlendUp ;
- les noms et dossiers sont guides par les regles projet ;
- les donnees BlendUp sont versionnees et lisibles ;
- l'equipe gagne du temps par rapport a un workflow manuel.

## Priorite Des Fonctionnalites

### Priorite 1

- fiches assets ;
- projet `.blendup` ;
- source Blender ;
- export FBX ;
- prefab Unity ;
- validation de base ;
- nomenclature ;
- vue problemes ;
- statuts ;
- notes ;
- tags ;
- add-on Blender minimal ;
- package Unity minimal.

### Priorite 2

- templates simples ;
- support simple materials/textures/UI images ;
- thumbnails ;
- journal d'activite ;
- verrouillage BlendUp ;
- creation de branches ;
- profils d'export ;
- variants simples ;
- vue dev enrichie.

### Priorite 3

- PureRef automation legere ;
- Git LFS Lock ;
- budgets qualite plus detailles ;
- analyse Uses / Used by plus complete.

### Post-V1

- ClickUp sync ;
- gestion DA generale plus poussee ;
- liens Pinterest ou equivalent ;
- personnages et animations avances ;
- scenes/zones Unity.
