# Validation, Nomenclature Et Budgets Qualite

## Objectif

BlendUp doit rendre les bonnes pratiques faciles a suivre.

La V1 doit principalement :

- avertir ;
- expliquer ;
- proposer des corrections ;
- corriger automatiquement les cas mineurs ;
- eviter de bloquer la creation sans raison.

## Philosophie

- Les warnings sont preferes aux erreurs bloquantes.
- Les assets prototype peuvent etre plus souples.
- Les assets production doivent etre plus controles.
- Les regles doivent etre configurables par projet.
- Les corrections automatiques doivent etre previsibles.

## Nomenclature Asset

Exemple de format possible :

```text
TYPE_Category_Name_Index
```

Exemples :

```text
PROP_Barrel_01
ENV_Rock_A
CHR_Knight_01
MAT_Wood_Dark
TEX_Wood_Dark_Albedo
UI_Icon_Inventory_Sword
```

Types possibles :

- `PROP`
- `ENV`
- `CHR`
- `MAT`
- `TEX`
- `UI`
- `FX`

Cette liste peut etre completee par projet.

Dans l'application, la liste est editable dans `Nomenclature`. Elle est stockee
dans `.blendup/presets/asset-types.json` avec les champs `id`, `displayName`,
`prefix`, `categoryNames` et `influence`.

Le type d'un asset est deduit de son emplacement :

```text
<racine asset>/<dossier type>/<dossier asset>/<fichier asset>.blend
```

Les racines sont definies dans `project.assets.roots` et modifiables dans les
parametres de la vue Assets. Deplacer un asset ou un dossier sous un autre
`dossier type` recalcule `asset.type` et le prefixe technique.

## Nomenclature Variants

Exemples :

```text
PROP_Barrel_01_Wood
PROP_Barrel_01_Metal
PROP_Barrel_01_Broken
```

Regles :

- variante lisible ;
- pas de `final`, `v2`, `new`, `copy` ;
- preference pour des suffixes signifiants.

## Nomenclature Blender

Exemples de suffixes :

```text
_MESH
_COL
_LOD0
_LOD1
_ARM
_RIG
_EMPTY
_SOCKET
```

Validations :

- objets exportables identifies ;
- colliders nommes ;
- LODs nommes ;
- materiaux nommes ;
- pas de noms temporaires du type `Cube.001` en production.

## Nomenclature Unity

Exemples :

```text
Unity/Assets/Models/Props/PROP_Barrel_01.fbx
Unity/Assets/Prefabs/Props/PROP_Barrel_01.prefab
Unity/Assets/Materials/Props/MAT_Wood_Dark.mat
```

Regles :

- FBX et prefab doivent correspondre a l'asset ;
- les prefabs ne doivent pas etre places directement dans Models ;
- les assets production doivent avoir un prefab si type le demande.

## Nomenclature Branches Git

BlendUp peut generer des noms de branches.

Exemples :

```text
asset/PROP_Barrel_01-modeling
asset/CHR_Knight_01-rig
task/BU-124-door-interactable
fix/asset_7a42-unity-import
review/PROP_Barrel_01-validation
```

Regles :

- prefix clair ;
- nom court ;
- asset ou tache identifiable ;
- pas d'espaces ;
- minuscules possibles selon convention projet.

## Corrections Automatiques

Corrections mineures possibles, configurables par projet :

- remplacer espaces par `_` ou `-` selon contexte ;
- supprimer caracteres interdits ;
- appliquer prefix type ;
- appliquer le prefixe configure par le dossier de type ;
- proposer suffixe variant ;
- renommer dossier cree par BlendUp ;
- creer chemin export manquant ;
- normaliser branche.

Corrections a eviter sans confirmation :

- renommer un fichier Blender existant ;
- renommer un prefab Unity existant ;
- deplacer un dossier ;
- modifier plusieurs references ;
- supprimer des fichiers.

## Budgets Qualite

Les budgets permettent d'avertir sans bloquer.

Les valeurs ci-dessous sont des valeurs V1 de depart. Elles doivent etre configurables par projet.

### Static Mesh

- triangles recommande : 10 000 max ;
- triangles warning : au-dessus de 10 000 ;
- triangles critique : au-dessus de 50 000 ;
- materials recommande : 1 a 3 ;
- materials warning : plus de 4 ;
- texture max recommande : 2048 px ;
- texture warning : plus de 4096 px ;
- collider : recommande, obligatoire si preset le demande ;
- UV : obligatoire pour un asset production ;
- origine/pivot : obligatoire pour export production ;
- scale appliquee : obligatoire pour export production.

### Prop

- triangles recommande : 15 000 max ;
- materials recommande : 1 a 4 ;
- texture max recommande : 2048 px ;
- collider : recommande ;
- prefab Unity : obligatoire si `importInUnity` est actif ;
- thumbnail : warning si absent.

### Character

- rig present ;
- naming bones ;
- animation clips ;
- texture budget ;
- nombre de materials ;
- skinning warnings.

Le character reste hors coeur V1. Ces budgets sont indicatifs et seront detailles plus tard.

### Environment Piece

- triangles recommande : 30 000 max ;
- triangles warning : au-dessus de 30 000 ;
- triangles critique : au-dessus de 100 000 ;
- materials recommande : 1 a 5 ;
- texture max recommande : 4096 px ;
- pivot/origin : obligatoire ;
- dimensions : warning si non renseignees ;
- collider : recommande ;
- LOD : warning si marque comme gros asset mais aucun LOD.

### Material

- nom conforme `MAT_*` ;
- shader/type renseigne ;
- textures attendues renseignees si applicable ;
- texture manquante : warning ;
- material non utilise : info.

### Texture

- nom conforme `TEX_*` ;
- resolution max recommande : 4096 px ;
- resolution critique : au-dessus de 8192 px ;
- format attendu : png, tga, jpg, psd selon usage ;
- fichier source manquant : warning ou error selon production ;
- taille fichier excessive : warning.

### UI Image

- nom conforme `UI_*` ;
- format recommande : png ;
- resolution max recommande : 2048 px ;
- alpha verifie si necessaire ;
- dossier Unity cible renseigne ;
- compression Unity plus tard.

## Severites

Proposition :

- `info` : simple indication ;
- `warning` : a corriger, mais pas bloquant ;
- `error` : bloque export/import ;
- `critical` : risque de casser references ou production.

## Validations Bloquantes Et Warnings

Une validation est un controle automatique avant export ou apres import.

Exemples :

- le nom respecte-t-il la convention ?
- le fichier Blender existe-t-il ?
- le FBX est-il au bon endroit ?
- le prefab Unity a-t-il ete cree ?
- le composant obligatoire est-il present ?
- la texture referencee existe-t-elle ?

Une validation bloquante empeche l'action parce qu'elle risque de produire un resultat casse.

Une validation warning signale un probleme mais laisse continuer.

### Bloquants V1

- fichier source introuvable ;
- chemin export invalide ;
- asset verrouille par quelqu'un d'autre ;
- aucun objet exportable pour un asset Blender exportable ;
- fichier `.blendup` invalide ou impossible a lire ;
- ID asset manquant ;
- chemin hors root projet ;
- export FBX impossible ;
- prefab production attendu mais impossible a creer ;
- composant Unity obligatoire manquant apres import ;
- composant Unity obligatoire introuvable dans le projet ;
- tentative d'import Unity d'un asset marque `importInUnity: false`.

### Warnings V1

- nom non conforme mais corrigible ;
- material non conforme ;
- texture manquante sur un asset prototype ;
- budget qualite depasse ;
- collider absent alors qu'il est recommande ;
- thumbnail manquant ;
- reference manquante ;
- board PureRef manquant ;
- owner non assigne ;
- tache interne non liee ;
- statut incoherent avec le dernier export ;
- auto-export actif sur un asset lourd ;
- prefab absent pour un asset prototype ;
- composant Unity recommande manquant ;
- material non utilise ;
- texture trop grande ;
- nombre de materials eleve ;
- LOD manquant sur un asset marque comme lourd.

## Difference Prototype / Production

Prototype :

- warnings plus souples ;
- pas forcement de prefab ;
- pas forcement d'import Unity ;
- nomenclature recommandee mais pas stricte.

Production :

- regles plus strictes ;
- prefab attendu ;
- references propres ;
- nommage propre ;
- budgets visibles ;
- statut review obligatoire.

## Validation Blender Avant Export

Doit verifier :

- fichier associe a un asset ;
- asset non verrouille par quelqu'un d'autre ;
- mode export autorise ;
- objets exportables presents ;
- nommage ;
- echelle ;
- origine ;
- materials ;
- chemin export.

## Validation Unity Apres Import

Doit verifier :

- FBX importe ;
- prefab existe ;
- prefab correspond a l'asset ;
- composants attendus ;
- erreurs import ;
- warnings ;
- chemins corrects.

## Vue Problems

Tous les resultats importants doivent remonter vers la vue Problems.

Un probleme doit contenir :

- ID ;
- asset lie ;
- source ;
- severite ;
- message clair ;
- action conseillee ;
- date ;
- responsable si connu.
