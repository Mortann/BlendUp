# Workflows V1

## Workflow 1 - Creation D'Un Projet

Objectif : connecter BlendUp a un projet existant ou creer une structure de projet propre.

Etapes :

1. L'utilisateur ouvre BlendUp.
2. Il choisit "Creer un projet" ou "Connecter un projet existant".
3. Il selectionne le dossier racine.
4. BlendUp detecte ou demande :
   - dossier Unity ;
   - dossier Art/Blender ;
   - dossier References ;
   - presence Git ;
   - presence Git LFS ;
   - integration PureRef optionnelle.
5. BlendUp cree `.blendup/project.json`.
6. BlendUp cree les dossiers de base si necessaire.
7. BlendUp affiche la page projet.

Implementation actuelle :

- l'accueil propose un assistant de creation simple ;
- l'utilisateur renseigne un nom et un dossier racine ;
- BlendUp cree les dossiers `.blendup`, `Art`, `Art/Blender`, `Art/References`, `Art/Textures`, `Art/UI` ;
- les dossiers Unity de base peuvent etre prepares automatiquement ;
- BlendUp cree les presets de types d'assets, les conventions de nommage, le journal d'activite vide, le fichier de migrations vide et un `.gitignore` adapte si demande ;
- le projet cree est ouvert automatiquement sur le dashboard.

Resultat :

- projet ouvert ;
- structure `.blendup` presente ;
- chemins de base configures.

## Workflow 2 - Creation D'Un Asset Static Mesh

Objectif : creer rapidement un asset propre sans manipulations repetitives.

Etapes :

1. L'utilisateur clique sur "Nouvel asset".
2. Il choisit le type `Static Mesh`.
3. Il indique un nom lisible.
4. BlendUp propose un nom conforme a la nomenclature.
5. BlendUp genere un ID stable.
6. BlendUp cree la fiche asset.
7. BlendUp propose de creer :
   - fichier Blender depuis template ;
   - dossier references ;
   - chemin export FBX ;
   - chemin prefab Unity.
8. L'utilisateur valide.
9. L'asset apparait dans la liste.

Resultat :

- asset cree ;
- fichiers/dossiers de base prets ;
- statut `draft` ou `in_progress`.

## Workflow 3 - Ouverture Depuis BlendUp

Objectif : naviguer rapidement vers le bon outil.

Etapes :

1. L'utilisateur ouvre une fiche asset.
2. Il clique sur "Ouvrir dans Blender".
3. BlendUp lance Blender avec le fichier source.
4. L'add-on Blender detecte l'asset lie.
5. Le panneau BlendUp dans Blender affiche :
   - nom asset ;
   - statut ;
   - notes ;
   - export profile ;
   - validation rapide.

Resultat :

- l'artiste arrive directement au bon fichier ;
- l'asset reste contextualise.

## Workflow 4 - Export Automatique

Objectif : exporter sans friction quand l'asset est pret.

Etapes :

1. L'artiste travaille dans Blender.
2. Il sauvegarde ou declenche l'action BlendUp.
3. L'add-on verifie si `autoExport` est actif.
4. L'add-on lance les validations.
5. Si warnings non bloquants : export continue et warnings ecrits.
6. Si erreur bloquante : export stoppe et BlendUp affiche le probleme.
7. FBX exporte vers le chemin defini.
8. Metadata mise a jour.

Resultat :

- FBX a jour ;
- journal d'activite mis a jour ;
- Unity peut importer.

## Workflow 5 - Export Manuel

Objectif : garder le controle sur les assets sensibles.

Etapes :

1. L'utilisateur desactive auto-export sur l'asset.
2. Il clique sur "Exporter".
3. Les memes validations sont executees.
4. L'export ne se fait que sur action explicite.

Cas d'usage :

- personnage anime ;
- asset lourd ;
- asset pas encore pret ;
- gros environnement ;
- probleme de validation a corriger.

## Workflow 6 - Import Unity Et Prefab

Objectif : creer ou mettre a jour le prefab Unity.

Etapes :

1. Unity detecte un FBX modifie.
2. Le package BlendUp lit la fiche asset correspondante.
3. Unity importe le FBX.
4. Le package verifie si le prefab existe.
5. Si non, il cree un prefab.
6. Si oui, il met a jour le prefab selon les regles.
7. Le package applique les composants/presets autorises.
8. Le package remonte l'etat a BlendUp.

Resultat :

- prefab cree ou mis a jour ;
- composants attendus appliques si possible ;
- erreurs visibles dans BlendUp.

## Workflow 7 - Vue Dev D'Un Asset

Objectif : comprendre rapidement l'etat Unity.

La vue dev affiche :

- chemin FBX ;
- chemin prefab ;
- statut import Unity ;
- derniers warnings ;
- composants presents ;
- composants attendus ;
- notes dev ;
- scripts associes ;
- dernier import ;
- usages connus.

Actions possibles :

- ouvrir prefab dans Unity ;
- reconstruire prefab ;
- marquer besoin correction art ;
- ajouter note dev ;
- modifier composants attendus si autorise.

## Workflow 8 - Mode Brouillon

Objectif : laisser experimenter sans polluer Unity.

Etapes :

1. L'utilisateur marque l'asset comme `prototype`.
2. Il peut choisir `importInUnity: false`.
3. L'asset reste visible dans BlendUp.
4. Les exports peuvent etre desactives ou envoyes dans un dossier temporaire.
5. Les validations sont plus souples.

Resultat :

- travail exploratoire possible ;
- la production reste propre.

## Workflow 9 - Verrouillage D'Un Asset

Objectif : eviter les conflits sur les gros fichiers.

Etapes :

1. L'utilisateur clique sur "Travailler sur cet asset".
2. BlendUp propose une branche selon la nomenclature.
3. BlendUp propose de verrouiller l'asset.
4. Un fichier `.blendup/locks/asset_x.lock.json` est cree.
5. Les autres utilisateurs voient l'asset comme verrouille.
6. Si Git LFS Lock est configure, BlendUp peut proposer le verrouillage LFS.

Limites :

- le verrou BlendUp est une protection d'equipe ;
- il n'empeche pas techniquement une modification hors BlendUp ;
- Git LFS Lock peut apporter une protection plus stricte.

## Workflow 10 - Problemes A Resoudre

Objectif : concentrer les corrections importantes.

BlendUp affiche une liste des problemes :

- fichier Blender manquant ;
- export FBX manquant ;
- prefab manquant ;
- import Unity en erreur ;
- nom non conforme ;
- budget qualite depasse ;
- reference manquante ;
- asset verrouille depuis trop longtemps ;
- tache interne incoherente ;
- asset production marque comme non importe.

Actions :

- ouvrir asset ;
- filtrer par type ;
- assigner responsable ;
- ignorer temporairement ;
- lancer correction proposee si disponible.

## Workflow 11 - Review Simple

Objectif : suivre l'avancement sans workflow lourd.

Etats possibles :

- en travail art ;
- pret pour export ;
- exporte ;
- integre Unity ;
- besoin correction art ;
- besoin correction dev ;
- valide.

En vue artiste, les etats sont reduits a : A faire, En cours, A valider, A retravailler, Valide.

Validation :

- les personnes associees a l'asset peuvent faire avancer l'etat jusqu'a `A valider` ;
- seul le `Directeur artistique` peut passer un asset a `Valide` ou rouvrir un asset deja valide ;
- ce verrou est double cote natif (commande `update_asset_status`) pour ne pas etre contournable depuis l'interface.

Le systeme doit rester simple et configurable plus tard.

## Workflow 12 - Export Test

Objectif : verifier sans modifier Unity.

Etapes :

1. L'utilisateur lance "Export test".
2. BlendUp/Blender execute validations.
3. L'export est simule ou envoye vers un dossier temporaire.
4. Les warnings sont affiches.
5. Le prefab Unity n'est pas modifie.

Utilite :

- verifier un asset avant merge ;
- tester un profil d'export ;
- rassurer un artiste avant modification d'un prefab utilise.

## Workflow 13 - Export Manuel Depuis BlendUp

Objectif : lancer un export FBX directement depuis l'application desktop.

Etapes :

1. L'utilisateur ouvre un projet BlendUp.
2. Il selectionne un asset.
3. Il renseigne le chemin de Blender si BlendUp ne le detecte pas automatiquement.
4. Il clique sur `Exporter FBX`.
5. BlendUp verifie :
   - la fiche asset ;
   - le fichier Blender source ;
   - le chemin FBX de sortie ;
   - la disponibilite de Blender.
6. BlendUp lance Blender en arriere-plan.
7. Blender exporte le fichier FBX.
8. BlendUp met a jour la fiche asset :
   - `lastExportAt` ;
   - `lastExportStatus` ;
   - `status` vers `exported` si l'export reussit.
9. BlendUp recharge le projet et met a jour les problems.

Resultat :

- premier flux Blender vers FBX utilisable ;
- erreurs visibles dans l'interface ;
- pas encore d'import prefab Unity automatique.

## Workflow 14 - Taches Internes

Objectif : suivre un minimum de production sans ClickUp en V1.

Etapes :

1. BlendUp lit les fichiers `.blendup/tasks/*.json`.
2. Chaque tache peut etre liee a un ou plusieurs assets via `assetIds`.
3. La vue Tasks affiche :
   - statut ;
   - priorite ;
   - owner ;
   - description ;
   - assets lies.
4. L'utilisateur peut filtrer par statut ou priorite.
5. L'utilisateur peut ouvrir un asset lie depuis la tache.
6. BlendUp signale dans Problems une tache qui reference un asset introuvable.

Resultat :

- suivi local simple ;
- contexte de production relie aux assets ;
- base compatible avec une future synchronisation ClickUp post-V1.

## Workflow 15 - Vue Git Lecture Seule

Objectif : donner un apercu du depot sans risquer de casser le workflow Git des devs.

Etapes :

1. BlendUp lit l'etat Git du dossier projet.
2. L'app affiche :
   - branche courante ;
   - disponibilite de Git ;
   - nombre de fichiers modifies/non suivis ;
   - liste des fichiers.
3. L'utilisateur peut filtrer les fichiers affiches.

Limites V1 :

- pas de push ;
- pas de pull ;
- pas de merge ;
- pas de resolution de conflit.

Resultat :

- les artistes peuvent voir si le projet a des changements ;
- les devs gardent leur workflow Git habituel ;
- BlendUp reste prudent sur les actions destructives ou complexes.
