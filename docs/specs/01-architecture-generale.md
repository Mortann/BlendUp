# Architecture Generale

## Vue D'Ensemble

BlendUp est compose de trois parties principales :

```text
Application BlendUp
  <-> Donnees .blendup
  <-> Add-on Blender
  <-> Package Unity
```

Chaque partie a un role clair.

## Application BlendUp

L'application est le hub principal.

Responsabilites :

- ouvrir ou creer un projet BlendUp ;
- afficher les assets ;
- afficher les experience artiste ;
- gerer les fiches assets ;
- gerer notes, references, statuts, tags ;
- afficher les problemes ;
- modifier les reglages projet ;
- lire/ecrire les fichiers `.blendup` ;
- proposer des actions Git simples ;
- declencher des actions Blender/Unity quand possible.

L'application ne doit pas contenir toute la logique specifique Blender ou Unity. Elle doit coordonner les integrations.

## Add-on Blender

L'add-on Blender est un pont entre Blender et BlendUp.

Responsabilites V1 :

- detecter si le fichier `.blend` courant est associe a un asset BlendUp ;
- afficher un panneau BlendUp dans Blender ;
- ouvrir la fiche asset dans l'application ;
- lancer l'export FBX selon le profil de l'asset ;
- executer les validations Blender de base ;
- creer certains elements depuis templates ;
- informer BlendUp du dernier export.

L'add-on doit rester leger. Il ne doit pas devenir une application complete dans Blender.

## Package Unity

Le package Unity est un outil editor.

Responsabilites V1 :

- lire les donnees `.blendup` ;
- detecter les assets exportes ;
- creer ou mettre a jour les prefabs ;
- appliquer les presets Unity simples ;
- ajouter les composants definis dans la fiche asset ;
- remonter l'etat d'import ;
- remonter les erreurs/warnings ;
- remonter la liste des composants presents ;
- fournir une fenetre Unity minimale si utile.

Le package Unity ne doit pas prendre le controle de tout le projet. Il doit aider a garder les prefabs alignes avec BlendUp.

## Donnees .blendup

Les donnees `.blendup` sont le contrat commun.

Elles doivent etre :

- stockees dans le projet ;
- versionnees avec Git ;
- lisibles par l'application ;
- lisibles par Unity ;
- partiellement lisibles par Blender ;
- migrables ;
- assez simples pour etre inspectees a la main si besoin.

Format recommande pour la V1 :

- JSON pour les fichiers machine ;
- Markdown pour la documentation humaine ;
- dossiers organises par type de donnees.

## Structure Projet Recommandee

```text
ProjectRoot/
  Art/
    Blender/
    References/
    Textures/
    UI/
    Concepts/

  Unity/
    Assets/
    Packages/
    ProjectSettings/

  .blendup/
    project.json
    assets/
    tasks/
    refs/
    presets/
    naming/
    locks/
    logs/
    migrations/

  docs/
```

Pour la V1, cette structure est la structure standard. BlendUp ne cherche pas a adapter librement toutes les structures existantes.

Les chemins stockes dans `.blendup` doivent etre relatifs au root projet.

## Flux De Donnees

### Creation D'Asset

```text
Application BlendUp
  -> cree une fiche asset
  -> genere ID stable
  -> cree dossiers si necessaire
  -> cree ou reference un fichier Blender
  -> applique les presets
```

### Export

```text
Blender
  -> add-on BlendUp
  -> validation
  -> export FBX
  -> mise a jour metadata
  -> Unity detecte l'export
```

### Import Unity

```text
Unity
  -> package BlendUp lit la fiche asset
  -> importe le FBX
  -> cree/met a jour prefab
  -> applique composants/presets
  -> ecrit etat d'import dans .blendup
```

### Retour Vers BlendUp

```text
Unity
  -> composants presents
  -> erreurs/warnings
  -> prefab path
  -> import status
  -> BlendUp affiche dans la vue validation
```

## Communication Entre Outils

Pour la V1, la communication peut rester simple :

- fichiers `.blendup` comme source commune ;
- detection de changements de fichiers ;
- lancement d'application ou ouverture de fichier ;
- pas besoin de serveur temps reel complexe.

Un serveur local ou websocket pourra etre envisage plus tard si l'experience utilisateur l'exige.

## Choix Techniques V1 Actuels

Les choix techniques de la V1 sont maintenant valides et le premier scaffold existe dans le depot.

### Application Desktop

- Tauri 2 ;
- TypeScript ;
- React ;
- Vite ;
- backend Rust minimal via commandes Tauri.

Le backend lit les fichiers `.blendup`, calcule des problems simples, lit l'etat Git en lecture seule et lance un export FBX via Blender quand l'application tourne en natif. Il ecrit aussi des donnees : settings utilisateur locaux (hors Git), mise a jour de fiche asset apres export, et creation de projet assistee (`create_project`). Une commande `detect_local_tools` localise Blender, Unity et PureRef.

### Add-on Blender

Direction V1 :

- Python Blender API.

L'add-on dedie existe dans `apps/blender-addon`. Il fournit un panneau BlendUp dans la vue 3D, la detection projet/asset (recherche d'un parent contenant `.blendup/project.json` + chemin `paths.blenderSource`), l'export FBX manuel et l'auto-export au save, la validation de base, des templates simples, et l'ecriture de l'etat d'export dans la fiche asset au meme format JSON que le backend. Sa logique metier est isolee dans `blendup/core` (sans `bpy`) et couverte par des tests. Le backend Tauri garde en parallele son export FBX via script temporaire pour declencher un export hors Blender.

### Package Unity

Direction V1 :

- C# Editor scripts ;
- package Unity local ;
- AssetPostprocessor ;
- PrefabUtility.

Le package Unity dedie n'est pas encore implemente.

## Contraintes Importantes

- Ne pas imposer un format de projet trop rigide.
- Ne pas casser le workflow Git du projet.
- Eviter les integrations trop profondes au debut.
- Garder les fichiers `.blendup` stables.
- Toujours pouvoir travailler hors ligne.
- Toujours permettre un mode manuel quand l'automatique gene.
