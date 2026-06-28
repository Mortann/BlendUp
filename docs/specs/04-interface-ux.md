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
- creer un projet via assistant ;
- rouvrir un projet recent ;
- ouvrir le projet test pendant la production.

L'assistant de creation doit rester compact :

- nom projet ;
- dossier racine ;
- option pour preparer les dossiers Unity ;
- option pour ajouter un `.gitignore` adapte ;
- ouverture automatique du projet cree sur le dashboard.

L'application ne doit pas charger automatiquement un snapshot de demo comme si c'etait un vrai projet. Le snapshot reste seulement un secours de developpement quand Tauri n'est pas disponible.

## Dashboard Projet

Quand un projet est ouvert, la premiere vue doit etre un dashboard projet.

Le dashboard doit rester utile et compact. Il ne doit pas afficher les outils locaux : ces informations restent dans `Settings`.

- resume assets/problems/tasks/Unity ;
- prochain probleme important ;
- prochaine tache ouverte ;
- liens rapides vers Problems, Tasks, Settings ou l'asset concerne.

Dans le workspace ouvert, le logo BlendUp est en haut a gauche dans la barre laterale. Il sert de controle principal pour replier/deplier la navigation. Quand la navigation est ouverte, un clic sur une section navigue puis replie la barre laterale ; quand elle est repliee, un clic sur une icone navigue puis redeplie la barre. L'action de retour a l'accueil reste disponible par un bouton discret `Accueil`.

Differenciation actuelle :

- vue artiste : dashboard clair sur fond d'application noir, taches a faire, derniers assets travailles, acces References/Assets, Git et Problems en suivi secondaire ;
- vue dev : dashboard sombre sur fond d'application noir, Problems, Tasks et Git en priorite, Assets/References en retrait.

## Page Assets

Objectif : trouver et comprendre rapidement les assets.

Elements :

- liste ou grille compacte ;
- navigation par dossiers type explorateur ;
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

Implementation actuelle :

- la barre laterale peut se replier pour laisser plus de place a la page projet ;
- en vue artiste, les dossiers assets sont affiches comme une bibliotheque navigable ;
- les details artiste s'ouvrent dans un panneau flottant au-dessus de la bibliotheque, pas dans une colonne permanente ;
- la vue asset propose recherche, tri et modes grille/liste ;
- le bouton `Exporter FBX` n'est pas affiche dans la fiche artiste : l'export quotidien doit venir du workflow Blender ;
- `Ouvrir dans Blender` appelle une commande native qui ouvre le fichier `.blend` associe via l'application par defaut du systeme ;
- la navigation se fait en mode explorateur parent/enfant sur les vrais dossiers du projet, et l'emplacement courant est memorise (localStorage, par projet) entre les sessions ;
- un panneau d'acces rapides a gauche regroupe favoris et collections (favoris, a valider, a retravailler) ; les favoris sont personnels a chaque utilisateur (locaux, par projet) ;
- chaque asset affiche un visuel (thumbnail si disponible, sinon une carte generee par type) avec, dessous, son nom, son etat artiste et les personnes associees ;
- l'etat artiste (A faire / En cours / A valider / A retravailler / Valide) se change depuis la fiche ; seul le `Directeur artistique` peut valider ou rouvrir un asset valide (verrou applique aussi cote natif) ;
- clic droit sur un asset : renommer, ajouter/retirer des favoris, supprimer (corbeille) ; clic droit sur un dossier : ouvrir ;
- glisser-deposer un asset ou un dossier vers un autre dossier le deplace reellement sur le disque ;
- le panneau de gauche presente : Recent (5 derniers dossiers ouverts), General (tous les dossiers + A valider / A retravailler), Favoris, Taches (optionnel), et un bouton Parametres en bas ;
- le bouton Parametres ouvre un panneau (mode d'affichage par defaut, taille des vignettes, tri par defaut, masquer les dossiers vides, afficher la partie Taches) ;
- la fiche detail s'ouvre centree au milieu de la page (overlay) et permet d'assigner les membres de l'equipe (artiste / dev / reviewer) ;
- la barre de notification s'affiche en surimpression (overlay) sans pousser la page ;
- un asset represente un dossier (contenant le `.blend`, `references/`, `textures/`) et son nom est synchronise avec BlendUp comme source de verite.

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
- exporter depuis le workflow adapte au role ;
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

Implementation actuelle :

- la page est organisee en colonnes par gravite (`critical`, `error`, `warning`, `info`) pour eviter une liste infinie ;
- les problemes graves sont visuellement prioritaires ;
- les filtres par gravite/source et la recherche restent disponibles ;
- un panneau de detail reste visible a cote du tableau.

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

Implementation actuelle :

- affichage en tableau de production type kanban ;
- colonnes `A faire`, `En cours`, `Review`, `Termine`, `Bloque` ;
- ajout, edition, suppression et deplacement de taches au niveau interface ;
- sous-taches simples ;
- assignation a une personne par champ libre ;
- les changements de taches dans l'interface sont encore locaux cote frontend tant que les commandes d'ecriture `.blendup/tasks` ne sont pas ajoutees.

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

Implementation actuelle :

- page `References` disponible dans la navigation ;
- en vue artiste, elle est prioritaire et utilise une surface claire ;
- en vue dev, elle reste accessible mais secondaire ;
- affichage des dossiers detectes depuis les chemins references et des references liees aux assets ;
- ajout local de references avec theme et asset optionnel ;
- recherche et tri par dossier, asset ou theme ;
- l'ouverture automatique des boards PureRef lies a un asset reste l'etape suivante cote integration.

## Nomenclature

La nomenclature doit etre accessible sans passer par les settings locaux.

Implementation actuelle :

- page `Nomenclature` dediee ;
- vue artiste centree sur prefixes assets, suffixes Blender, exemples et fragments interdits ;
- vue dev avec les chemins projet et exemples de branches Git en plus ;
- les donnees affichees reprennent les conventions V1 generees dans `.blendup/naming`.

## Equipe Et Comptes Simples

La V1 utilise des comptes locaux tres simples, sans mot de passe.

Objectif :

- permettre a chaque personne de choisir son identite ;
- associer des roles independants ;
- preparer l'historique par personne sans ajouter de systeme de securite lourd.

Implementation actuelle :

- page `Equipe` dediee ;
- roles disponibles : artiste, dev, directeur artistique ;
- un owner local peut ajouter, supprimer et modifier les roles des comptes ;
- l'owner represente le createur du projet et ne peut pas transferer ce role pour l'instant ;
- l'identite active est stockee localement par projet dans `localStorage` ;
- ces comptes ne sont pas encore versionnes dans `.blendup` et ne remplacent pas une vraie authentification.

## Project Settings

Sections :

- chemins projet ;
- integrations ;
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

## Etat D'Implementation - Vues Artiste/Dev

Implemente (V1, 2026-06-27/28) :

- bascule artiste/dev dans la barre laterale avec controle compact ;
- barre laterale repliable automatiquement apres navigation, avec redeploiement au clic suivant ;
- logo BlendUp en haut a gauche comme controle de repli/depli ;
- role gere par `apps/desktop/src/blendup/roles.ts` (type `Role`, capacites par role) ;
- defaut du role depuis `project.defaultView` ; role actif persiste localement (hors Git) ;
- fiche asset adaptee au role : ordre des sections et emphase des notes ;
- garde-fous doux sur les actions : l'export FBX n'est plus l'action principale de la fiche artiste, et l'ouverture Blender passe par le fichier `.blend`.

Limite V1 : deux roles seulement (artiste/dev). Les roles lead/admin des "permissions douces" ne sont pas implementes pour l'instant.

## Differenciation Artiste/Dev (implemente, 2026-06-27)

Les deux vues ne different pas seulement par l'emphase : elles ont un contenu et un theme distincts.

- Vue artiste : surface claire adoucie sur shell noir, navigation Assets/References prioritaire, bibliotheque par dossiers, details en panneau flottant, fiche epuree orientee Blender.
- Vue dev : surface sombre sur shell noir, navigation Problems/Tasks/Git prioritaire, Assets/References en retrait, fiche dense orientee Unity.
- Couleurs principales : noir, blanc, bleu nuit. Les accents verts/teal ne sont plus utilises.

Les capacites par role sont centralisees dans `apps/desktop/src/blendup/roles.ts` (couleur d'accent, orientation, flags d'affichage, actions autorisees). L'export FBX est reserve a la vue artiste.
