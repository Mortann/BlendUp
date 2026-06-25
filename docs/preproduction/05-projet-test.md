# Projet Test

## Objectif

Le dossier `BlendUpTest/` sert de projet exemple pour tester BlendUp pendant la production.

Il doit permettre de verifier progressivement :

- la structure standard `Art/`, `Unity/`, `.blendup/` ;
- la creation de fiches assets ;
- l'export Blender vers FBX ;
- l'import Unity ;
- la creation ou mise a jour de prefabs ;
- les validations ;
- la vue Problems ;
- les tests Git/Git LFS ;
- les workflows de verrouillage.

## Emplacement

```text
BlendUpTest/
  .blendup/
  Art/
  Unity/
```

## Etat Actuel

- Le dossier de test existe.
- Le dossier `.blendup/` existe.
- Le dossier `Art/` existe.
- Le projet Unity existe.
- La version Unity detectee dans `Unity/ProjectSettings/ProjectVersion.txt` est `6000.3.5f2`.
- Le fichier `.blendup/project.json` existe.
- Les premiers fichiers de presets/nomenclature existent.
- Un `.gitignore` existe pour ignorer les dossiers Unity generes.

La version minimale cible du produit reste Unity `6000.0.77f1`. Le projet test utilise une version plus recente, ce qui est acceptable pour les tests tant que la compatibilite minimale reste documentee.

## Regles De Versionnement

Le projet test doit ignorer les dossiers Unity generes :

- `Unity/Library/`
- `Unity/Temp/`
- `Unity/Logs/`
- `Unity/UserSettings/`
- fichiers `.csproj`, `.sln`, `.slnx`

Un `.gitignore` a ete ajoute dans `BlendUpTest/`.

## Prochaine Structure A Completer

Structure recommandee pour les premiers tests :

```text
BlendUpTest/
  .blendup/
    project.json
    assets/
    presets/
    naming/
    locks/
    logs/

  Art/
    Blender/
      Props/
      Environment/
      Templates/
    References/
      Global/
      Props/
    Textures/
    UI/

  Unity/
    Assets/
      Models/
      Prefabs/
      Materials/
      BlendUp/
```

## Assets Tests A Creer

- [x] `PROP_CubeCrate_01` : static prop simple avec collider.
- [x] `ENV_Rock_01` : environment piece simple.
- [ ] `MAT_Test_Wood` ou `TEX_Test_Wood_Albedo` : test material/texture simple.

## Tests A Faire

- [x] Creer `.blendup/project.json`.
- [ ] Creer 3 fiches assets test.
- [x] Creer les fiches assets de `PROP_CubeCrate_01` et `ENV_Rock_01`.
- [ ] Tester la validation de nomenclature.
- [ ] Tester un export FBX manuel.
- [ ] Tester un export FBX automatique au save.
- [ ] Tester l'import Unity.
- [ ] Tester la creation de prefab.
- [ ] Tester la mise a jour de prefab.
- [ ] Tester un warning de composant recommande manquant.
- [ ] Tester un bloquant de fichier source manquant.
- [ ] Tester la vue Problems.
