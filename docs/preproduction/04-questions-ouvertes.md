# Questions Ouvertes

Ce document garde la trace des questions tranchees et des points qui restent a preciser.

## Questions Tranchees

### Versions Cibles

- [x] Version minimale de Blender : Blender 4.0.
- [x] Version minimale de Unity : Unity 6.0, version de reference `6000.0.77f1`.
- [x] Plateformes V1 : Windows en priorite, Linux si le cout reste raisonnable. Si le multi-plateforme ralentit trop la V1, Windows reste la cible obligatoire.

### Stack Application

- [x] Stack application : Tauri + TypeScript + React.
- [x] Electron ne sera pas compare en priorite. Tauri est considere suffisant pour la V1.
- [x] Systeme UI/composants : a definir comme un design system interne sobre, base sur des composants reutilisables.
- [x] Settings locaux utilisateur : stocker les reglages personnels hors Git, dans le dossier de configuration de l'application, et garder les reglages projet dans `.blendup`.

### Structure Projet

- [x] Structure par defaut validee : `Art/`, `Unity/`, `.blendup/`.
- [x] BlendUp ne doit pas chercher a adapter librement toutes les structures existantes en V1. La V1 suit la structure standard.
- [x] Les chemins stockes dans `.blendup` doivent etre relatifs au root projet.

### Nomenclature

- [x] Prefix initiaux valides : `PROP`, `ENV`, `CHR`, `MAT`, `TEX`, `UI`, avec possibilite d'en ajouter si besoin.
- [x] Convention de branches validee :
  - `asset/PROP_Barrel_01-modeling`
  - `asset/CHR_Knight_01-rig`
  - `task/BU-124-door-interactable`
  - `fix/asset_7a42-unity-import`
  - `review/PROP_Barrel_01-validation`
- [x] Suffixes Blender initiaux valides : `_MESH`, `_COL`, `_LOD0`, `_LOD1`, `_ARM`, `_RIG`, a completer.
- [x] Corrections automatiques autorisees : corrections mineures, configurables par projet.

### V1 Asset Types

- [x] Types prioritaires : `static_mesh`, `prop`, `environment_piece`.
- [x] Types a inclure en V1 avec support plus leger : `material`, `texture`, `ui_image`.

### Templates

- [x] Templates de depart : `Static Mesh`, `Static Prop With Collider`, `Environment Piece`, `Material Basic`, `Reference Board`.
- [x] Templates Blender : stockes comme presets versionnes dans `.blendup/presets`, avec eventuellement des fichiers `.blend` template dans `Art/Blender/Templates`.

### Unity

- [x] Le package Unity doit rester simple en V1.
- [x] En cas de composant manquant, BlendUp doit le signaler avec details et permettre de confirmer que le composant a ete retire volontairement.
- [x] Les composants attendus peuvent etre obligatoires ou recommandes selon la configuration.

### Blender

- [x] Auto-export par defaut au save.
- [x] L'auto-export doit pouvoir etre desactive par asset.

### Git / LFS

- [x] BlendUp cree automatiquement `.gitattributes` selon la configuration projet.
- [x] Si Git n'est pas installe, BlendUp explique comment l'installer.
- [x] Si Git LFS n'est pas installe, BlendUp explique comment l'installer.
- [x] Verrouillage V1 : verrouillage BlendUp doux, avec option Git LFS Lock plus tard ou si disponible.

### ClickUp

- [x] ClickUp ne fait pas partie de la V1.
- [x] La V1 utilise seulement un systeme de taches interne.
- [x] Le mapping ClickUp et les conflits ClickUp sont repousses a une version ulterieure.

### PureRef

- [x] BlendUp doit ouvrir les fichiers `.pur`.
- [x] BlendUp doit aussi pouvoir organiser des dossiers d'images de references.
- [x] Les references globales DA doivent etre separees des references par asset.
- [x] Une partie DA generale plus poussee est gardee pour une version future, avec possibilite de lien vers Pinterest ou equivalent.

### Donnees Et Migrations

- [x] Les schemas JSON proposes sont valides comme direction.
- [x] La strategie de migration proposee est validee.
- [x] La strategie de backup avant migration est validee.

## Clarifications Ajoutees

### Systeme UI / Composants

Cela designe la base visuelle reutilisable de l'application : boutons, champs, menus, tableaux, tags, statuts, panneaux, modales, layout, couleurs, espacements. L'objectif est que BlendUp reste coherent et sobre sans redessiner chaque ecran a la main.

Decision V1 :

- utiliser HeroUI comme librairie de composants React ;
- creer un petit design system BlendUp au-dessus de HeroUI ;
- garder une interface sobre, dense et lisible ;
- eviter une personnalisation visuelle trop lourde en V1.

### Settings Locaux Utilisateur

Il y a deux types de reglages :

- reglages projet, versionnes dans `.blendup` : conventions, chemins, presets, types d'assets ;
- reglages personnels, non versionnes : derniere fenetre ouverte, theme, chemin local vers Blender/Unity/PureRef, preferences d'affichage.

Recommandation V1 : les reglages personnels doivent etre stockes dans le dossier de configuration de l'application Tauri, pas dans Git.

### Material Template Minimum

Un material template minimum est un modele de materiau cree rapidement avec :

- nom conforme ;
- type de shader de base ;
- slots/textures attendus ;
- nodes de base cote Blender ;
- conventions de texture.

La V1 peut rester simple : un materiau de base avec nommage propre et emplacements pour textures principales.

### Prefab Preset Minimum

Un prefab preset minimum est une configuration Unity appliquee a un prefab genere :

- dossier cible ;
- composants recommandes ou obligatoires ;
- tag/layer si configure ;
- collider simple si demande ;
- regles pour ne pas ecraser les modifications manuelles.

La V1 doit rester prudente : creation/mise a jour simple, pas de logique gameplay automatique.

### Association FBX / Asset

BlendUp associe un FBX a une fiche asset principalement par le chemin stocke dans la fiche :

```text
asset.paths.fbxExport
```

En complement, l'export peut contenir une metadata ou un fichier sidecar avec l'ID stable de l'asset. Le chemin reste la methode V1 principale, l'ID stable sert de securite.

### Validations

Une validation est un controle automatique avant export ou apres import.

Exemples :

- le nom respecte-t-il la convention ?
- le fichier Blender existe-t-il ?
- le FBX est-il au bon endroit ?
- le prefab Unity a-t-il ete cree ?
- le composant obligatoire est-il present ?
- la texture referencee existe-t-elle ?

Une validation bloquante empeche l'action car elle risque de produire un resultat casse. Une validation warning signale un probleme mais laisse continuer.

### Add-on Blender Et Projet BlendUp

Recommandation V1 : l'add-on retrouve le projet BlendUp par metadata dans le fichier `.blend`, puis par recherche d'un dossier parent contenant `.blendup/project.json`.

Cela permet :

- d'ouvrir directement le bon projet si le fichier est lie ;
- de fonctionner meme si le fichier est deplace dans la structure standard ;
- d'eviter une configuration manuelle trop fragile.

## Questions Encore A Trancher

### Systeme UI

- [x] Choisir la librairie de composants React : HeroUI.
- [x] Definir la palette, les tailles, les composants de base et le style des tableaux/listes : proposition V1 ajoutee dans `specs/04-interface-ux.md`.

### Validations V1 Exactes

- [x] Definir la liste precise des validations bloquantes : proposition V1 ajoutee dans `specs/06-validation-nomenclature.md`.
- [x] Definir la liste precise des validations warning : proposition V1 ajoutee dans `specs/06-validation-nomenclature.md`.
- [x] Definir les budgets qualite par type d'asset : budgets coherents de depart ajoutes dans `specs/06-validation-nomenclature.md`.

### Unity

- [x] Definir exactement quelles modifications Unity sont autorisees automatiquement sur un prefab existant : proposition V1 ajoutee dans `specs/05-integrations.md`.
- [x] Definir comment le dev confirme qu'un composant attendu a ete retire volontairement : bouton sur le warning.

### Git / LFS

- [x] Definir le contenu exact du `.gitattributes` genere : proposition V1 ajoutee dans `specs/05-integrations.md`.
- [x] Definir le comportement du verrouillage si deux utilisateurs creent un verrou en meme temps : afficher une erreur et expliquer la situation.

### Tests Et Projet Exemple

- [x] Creer un mini projet Unity/Blender exemple : `BlendUpTest/`.
- [ ] Creer 3 assets test.
- [ ] Tester export/import.
- [ ] Tester prefab update.
- [ ] Tester warnings et Problems.
