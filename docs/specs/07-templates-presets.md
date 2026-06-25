# Templates Et Presets

## Objectif

Les templates/presets doivent reduire les petites actions repetitives.

Ils doivent aider les artistes et devs a creer vite, proprement, et selon les conventions du projet.

## Principe

Un preset est une regle ou configuration reutilisable.

Un template est une base creee a partir d'un preset.

Exemple :

- preset `static_mesh_default` ;
- template Blender de collection static mesh ;
- export profile FBX associe ;
- prefab preset Unity associe ;
- budget qualite associe.

## Presets Projet

Les presets sont stockes dans :

```text
.blendup/presets/
```

Ils doivent etre versionnes avec Git.

## Types De Presets V1

### Asset Type Preset

Definit :

- nom type ;
- prefix nommage ;
- dossier source ;
- dossier export ;
- dossier prefab ;
- profil export par defaut ;
- budget qualite par defaut.

### Export Profile

Definit :

- format ;
- chemin ;
- axes ;
- scale ;
- apply transforms ;
- exporter selected only ;
- include animation ;
- include armature ;
- bake settings si besoin plus tard.

### Blender Template

Definit ou cree :

- collections ;
- objets vides ;
- material de base ;
- collider placeholder ;
- naming ;
- custom properties BlendUp.

Stockage recommande :

- configuration dans `.blendup/presets` ;
- fichiers `.blend` templates optionnels dans `Art/Blender/Templates`.

### Unity Prefab Preset

Definit :

- dossier prefab ;
- composants attendus ;
- tags/layers Unity ;
- collider type ;
- material mapping ;
- import settings simples.

Un prefab preset minimum en V1 doit rester prudent :

- creer le prefab si absent ;
- ajouter uniquement les composants configures ;
- distinguer composants obligatoires et recommandes ;
- ne pas supprimer un composant existant sans confirmation ;
- signaler les composants manquants.

### Material Preset

Definit :

- nom ;
- type shader ;
- nodes de base ;
- textures attendues ;
- conventions de texture.

Un material template minimum en V1 peut simplement creer :

- un nom conforme ;
- un material de base ;
- des emplacements pour textures principales ;
- une convention de nommage liee a l'asset.

## Templates V1 Recommandes

Commencer petit :

- `Static Mesh`
- `Static Prop With Collider`
- `Environment Piece`
- `Material Basic`
- `Reference Board`

Ces templates sont les templates de depart valides pour la V1.

Ne pas commencer par :

- character rig complet ;
- systeme LOD complexe ;
- template animation avance ;
- template scene/zone complet.

## Assistant De Creation D'Asset

L'assistant doit rester simple.

Etapes :

1. choisir type ;
2. saisir nom ;
3. choisir production/prototype ;
4. choisir proprietaire ;
5. choisir preset ;
6. voir chemins proposes ;
7. confirmer creation.

Il ne doit pas demander 30 options.

## Templates Blender

Actions utiles :

- creer collection principale ;
- creer sous-collections export/collider/reference si utile ;
- creer material de base ;
- ajouter custom property `blendupAssetId` ;
- nommer correctement les objets ;
- definir origine/pivot si possible.

## Templates Unity

Actions utiles :

- creer prefab si absent ;
- ajouter composants autorises ;
- configurer collider simple ;
- appliquer tag/layer si configure ;
- garder les changements manuels quand possible.

## Design System Configurable

Le "design system" projet peut inclure :

- types d'assets ;
- naming ;
- tags autorises ;
- statuts ;
- budgets qualite ;
- templates Blender ;
- composants Unity ;
- profils export ;
- dossiers ;
- branche Git.

Il doit etre modifiable depuis Project Settings.

## Eviter La Complexite

Les templates doivent rester des accelerateurs.

Ils ne doivent pas :

- empecher un travail manuel ;
- creer trop de magie ;
- masquer les changements ;
- imposer un workflow unique ;
- devenir obligatoires partout.

## Exemple De Preset Static Mesh

```json
{
  "schemaVersion": 1,
  "kind": "asset_type_preset",
  "id": "static_mesh",
  "displayName": "Static Mesh",
  "naming": {
    "prefix": "PROP",
    "pattern": "{prefix}_{name}_{index}"
  },
  "paths": {
    "blender": "Art/Blender/Props",
    "fbx": "Unity/Assets/Models/Props",
    "prefab": "Unity/Assets/Prefabs/Props"
  },
  "defaults": {
    "exportProfile": "static_mesh_default",
    "qualityBudget": "static_mesh_default",
    "autoExport": true,
    "importInUnity": true
  }
}
```
