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
- `docs/production/02-installation-verification.md`

## Etat actuel

Ce depot contient :

- la documentation de preproduction et de production ;
- une application desktop Tauri + React + TypeScript dans `apps/desktop` ;
- un backend Tauri/Rust minimal capable de lire un projet `.blendup` ;
- un projet test `BlendUpTest/` avec Unity, deux fiches assets et deux taches internes ;
- une premiere interface avec vues `Assets`, `Problems`, `Tasks` et `Git` lecture seule ;
- une premiere action d'export FBX via Blender depuis l'application native.

L'add-on Blender dedie et le package Unity dedie ne sont pas encore implementes.

## Installation Et Verification Rapide

Prerequis Windows :

- Node.js et npm ;
- Rust via rustup ;
- Visual Studio 2022 avec outils C++ ;
- Windows SDK avec les librairies C, dont `kernel32.lib` ;
- WebView2.

Commandes principales :

```powershell
npm install
npm run typecheck
npm run build
npm run dev
```

Pour verifier le backend Tauri/Rust :

```powershell
cd apps/desktop/src-tauri
cargo check
```

Si `cargo` n'est pas encore visible dans le terminal apres installation de Rust, ouvrir un nouveau terminal ou ajouter temporairement `C:\Users\morit\.cargo\bin` au `PATH`.

Le detail de la remise en route est documente dans `docs/production/02-installation-verification.md`.

## Principe De Maintenance

La documentation doit rester a jour pendant toute la production. Quand une decision change, quand le scope evolue, ou quand une implementation revele une contrainte, les fichiers `docs/` doivent etre ajustes au meme titre que le code.

Regle de travail pour la suite : toute modification fonctionnelle, technique ou de scope doit mettre a jour la documentation correspondante avant d'etre consideree terminee.
