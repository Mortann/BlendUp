# BlendUp

BlendUp est un projet d'application de preproduction et de pipeline d'assets pour petites equipes Unity/Blender.

L'objectif n'est pas de remplacer Blender, Unity, Git, ClickUp ou PureRef. L'objectif est de creer une couche commune qui rend le chemin entre creation artistique, integration technique et suivi de production plus lisible, plus fiable et plus rapide.

Flux central vise pour la V1 :

```text
Blender source
  -> Export FBX
  -> Import Unity
  -> Prefab Unity
  -> Metadata BlendUp
```

La V1 se concentre volontairement sur un perimetre realiste :

- gerer des fiches assets avec ID stable ;
- relier chaque asset a ses fichiers Blender, exports FBX, prefabs Unity, references, notes et statuts ;
- assister la nomenclature et les validations ;
- fournir un add-on Blender leger ;
- fournir un package Unity leger ;
- proposer une application separee sobre avec vue artiste et vue dev ;
- garder Git, Git LFS et PureRef comme integrations utiles mais non obligatoires ;
- garder ClickUp pour une version future, apres le systeme de taches interne.

## Documentation

Les documents de preproduction sont dans `docs/`.

Point d'entree recommande :

- `docs/00-index.md`
- `docs/preproduction/01-vision-produit.md`
- `docs/preproduction/02-definition-v1.md`
- `docs/specs/01-architecture-generale.md`
- `docs/specs/02-modele-donnees.md`

## Etat actuel

Ce depot contient pour l'instant la preproduction du projet. Le code applicatif, l'add-on Blender et le package Unity ne sont pas encore implementes.

## Principe De Maintenance

La documentation de preproduction doit rester a jour pendant toute la production. Quand une decision change, quand le scope evolue, ou quand une implementation revele une contrainte, les fichiers `docs/` doivent etre ajustes au meme titre que le code.
