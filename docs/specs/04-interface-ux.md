# Interface Et UX

## Direction UI

BlendUp doit etre sobre, dense mais lisible, concu pour travailler souvent.

L'interface doit eviter :

- page marketing ;
- hero inutile ;
- gros visuels decoratifs ;
- dashboard spectaculaire mais peu utile ;
- cartes trop grandes ;
- actions cachees.

Elle doit favoriser :

- recherche rapide ;
- filtres ;
- thumbnails ;
- panneaux de detail ;
- statuts clairs ;
- actions proches du contexte ;
- warnings comprehensibles ;
- bascule artiste/dev.

## Librairie UI

La V1 utilise HeroUI comme librairie de composants React.

Raison :

- composants React prets a l'emploi ;
- theming/customisation ;
- base coherente pour aller vite ;
- compatible avec une application Tauri + React.

BlendUp doit garder un petit design system interne au-dessus de HeroUI pour eviter de disperser les styles.

## Design System V1

### Palette De Base

Palette sobre, orientee outil de production :

- fond principal : gris tres sombre ou gris clair selon theme ;
- surface : contraste doux avec le fond ;
- texte principal : contraste fort ;
- texte secondaire : contraste moyen ;
- accent principal : bleu ou cyan sobre pour actions actives ;
- succes : vert ;
- warning : jaune/orange ;
- erreur : rouge ;
- prototype/brouillon : violet ou gris marque.

La V1 peut commencer avec un theme sombre prioritaire et un theme clair ensuite si peu couteux.

### Tailles Et Densite

Objectif : interface dense mais confortable.

- barre laterale compacte ;
- listes avec lignes de 40 a 52 px ;
- tables lisibles sans etre enormes ;
- boutons d'action principaux visibles ;
- actions secondaires dans menus contextuels ;
- panneaux de details sur la droite ou en vue dediee.

### Composants De Base

Composants V1 :

- Button ;
- IconButton ;
- Input ;
- Select ;
- Tabs ;
- Table/List ;
- Tag/Chip ;
- Badge de statut ;
- Modal ;
- Drawer ou panneau lateral ;
- Tooltip ;
- Toast ;
- Checkbox/Switch ;
- Progress/Status indicator.

### Tableaux Et Listes

Les tableaux/listes doivent etre faits pour scanner rapidement :

- colonnes stables ;
- tri ;
- filtres visibles ;
- statut colore ;
- icone warning ;
- recherche ;
- selection ;
- actions contextuelles.

La liste d'assets doit rester plus importante qu'un dashboard decoratif.

## Navigation Principale

Sections V1 recommandees :

- Assets
- Problems
- Tasks
- References
- Project Settings

Sections optionnelles V1 :

- Activity
- Git

## Accueil Sans Projet

Quand aucun projet n'est charge, BlendUp doit afficher un ecran d'accueil sobre.

Actions V1 :

- ouvrir un projet via selecteur de dossier natif ;
- ouvrir un projet par chemin si besoin ;
- rouvrir un projet recent ;
- ouvrir le projet test pendant la production ;
- reserver l'action creer un projet pour l'assistant de creation.

L'application ne doit pas charger automatiquement un snapshot de demo comme si c'etait un vrai projet. Le snapshot reste seulement un secours de developpement quand Tauri n'est pas disponible.

## Dashboard Projet

Quand un projet est ouvert, la premiere vue doit etre un dashboard projet.

Le dashboard doit rester utile et compact :

- resume assets/problems/tasks/Unity ;
- prochain probleme important ;
- prochaine tache ouverte ;
- disponibilite des outils locaux ;
- liens rapides vers Problems, Tasks, Settings ou l'asset concerne.

Le logo BlendUp en haut a gauche ramene au dashboard du projet ouvert.

## Page Assets

Objectif : trouver et comprendre rapidement les assets.

Elements :

- liste ou grille compacte ;
- thumbnail ;
- nom ;
- type ;
- statut ;
- proprietaire ;
- tags ;
- indicateur Unity ;
- indicateur warnings ;
- indicateur verrouillage.

Filtres :

- type ;
- statut ;
- production/prototype ;
- proprietaire ;
- tags ;
- warnings ;
- import Unity ;
- verrouillage ;
- tache liee.

Recherche :

- nom ;
- ID ;
- tag ;
- chemin ;
- commentaire ;
- composant Unity connu.

## Fiche Asset

La fiche asset est la vue centrale.

Sections recommandees :

- Resume
- Fichiers
- Export
- Unity
- References
- Notes
- Variants
- Uses / Used By
- Activity
- Problems

### Resume

- thumbnail ;
- nom ;
- ID ;
- type ;
- statut ;
- mode production/prototype ;
- proprietaires ;
- tags ;
- actions principales.

Actions principales :

- ouvrir dans Blender ;
- ouvrir dans Unity ;
- exporter ;
- export test ;
- verrouiller/deverrouiller ;
- creer branche ;
- lancer validation.

### Fichiers

Afficher :

- source Blender ;
- export FBX ;
- prefab Unity ;
- thumbnail ;
- dossier references ;
- board PureRef.

Actions :

- ouvrir ;
- reveler dans l'explorateur ;
- changer chemin ;
- verifier existence.

### Export

Afficher :

- profil export ;
- auto-export on/off ;
- import Unity on/off ;
- dernier export ;
- statut dernier export ;
- warnings Blender.

### Unity

Afficher :

- statut import ;
- prefab ;
- composants attendus ;
- composants presents ;
- scripts connus ;
- dernier import ;
- erreurs Unity.

### References

Afficher :

- images liees ;
- dossiers ;
- fichier PureRef ;
- notes DA ;
- liens externes si besoin.

### Notes

Deux zones separees :

- notes artiste ;
- notes dev.

But :

- eviter de melanger "a corriger en modelisation" et "a corriger en integration".

### Uses / Used By

Afficher en V1 :

- references utilisees ;
- taches liees ;
- prefab lie ;
- composants Unity ;
- variants ;
- autres assets lies manuellement.

Plus tard :

- scenes Unity ;
- materials reels ;
- textures detectees ;
- prefabs qui reference cet asset.

## Vue Artiste

Met en avant :

- thumbnail ;
- reference ;
- statut art ;
- tache ;
- fichier Blender ;
- validation ;
- export ;
- notes artiste ;
- warnings comprehensibles.

Actions rapides :

- ouvrir Blender ;
- ouvrir PureRef ;
- creer variant ;
- exporter ;
- export test ;
- corriger nom propose ;
- changer statut.

## Vue Dev

Met en avant :

- prefab ;
- import Unity ;
- composants ;
- scripts ;
- warnings Unity ;
- statut integration ;
- notes dev ;
- composants attendus ;
- assets non importes ;
- assets en production avec probleme.

Actions rapides :

- ouvrir Unity ;
- ouvrir prefab ;
- rebuild prefab ;
- ajouter note dev ;
- marquer besoin correction art ;
- definir composants attendus ;
- voir usages connus.

## Problems

Page importante de la V1.

Objectif :

- avoir une boite claire de tous les problemes du projet.

Colonnes possibles :

- severite ;
- asset ;
- type de probleme ;
- source ;
- responsable ;
- action proposee.

Types :

- `missing_file`
- `naming_warning`
- `unity_import_error`
- `quality_budget_warning`
- `lock_warning`
- `task_sync_warning`
- `reference_missing`

## Tasks

La V1 peut rester simple.

Afficher :

- taches internes ;
- assets lies ;
- proprietaire ;
- statut.

Ne pas integrer ClickUp en V1. Les taches restent internes.

## References

Vue utile pour organiser la DA.

Afficher :

- dossiers de refs ;
- boards PureRef ;
- refs liees a des assets ;
- refs globales ;
- tags DA.

Important :

- BlendUp organise ;
- PureRef reste l'outil visuel.

## Project Settings

Sections :

- chemins projet ;
- integrations ;
- nomenclature ;
- templates ;
- types d'assets ;
- budgets qualite ;
- composants Unity autorises ;
- Git/Git LFS ;
- roles et permissions douces.

## Settings Locaux Machine

Les chemins propres a une machine ne doivent pas etre stockes dans `.blendup`.

Settings locaux V1 :

- dernier projet ouvert ;
- projets recents ;
- chemin local vers Blender ;
- chemin local vers Unity ;
- chemin local vers PureRef.

Ces reglages sont stockes hors Git dans le dossier de configuration utilisateur de l'application.

Dans l'interface, les chemins locaux doivent etre dans `Settings`, pas dans la barre principale.

BlendUp doit aussi aider l'utilisateur a limiter la configuration manuelle :

- detection automatique de Blender, Unity et PureRef quand possible ;
- validation visible des chemins renseignes ;
- bouton de detection manuelle dans `Settings`.

## Permissions Douces

La V1 ne doit pas faire un vrai systeme d'autorisations securise.

Elle peut cependant adapter l'interface :

- artiste ;
- dev ;
- lead ;
- admin projet.

Exemples :

- un artiste peut voir les composants Unity mais pas modifier les presets dev par erreur ;
- un dev peut modifier les composants attendus ;
- un lead peut changer les conventions.

Ces permissions doivent etre presentees comme des garde-fous, pas comme de la securite.
