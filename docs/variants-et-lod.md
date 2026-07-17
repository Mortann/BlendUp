# Variantes et LOD

## Variantes

Une variante est une vraie copie du fichier Blender principal. Elle reste dans le dossier de l'asset pour partager facilement les chemins relatifs vers `textures`, `references` et `renders`.

Exemple pour l'asset `Table` et la variante « Bois rouge » :

```text
Art/Props/Table/Table.variant.bois_rouge.blend
Godot/Assets/Props/Table/variants/bois_rouge.glb
```

Depuis l'onglet **Variantes**, il est possible de créer la copie, l'ouvrir dans Blender, l'exporter ou la supprimer. **Tout exporter** traite la version principale puis toutes les variantes et tous les LOD.

## LOD Blender

Le bouton **Générer les LOD manquants** crée trois copies :

| Niveau | Géométrie conservée | Usage de départ |
|---|---:|---|
| LOD1 | 50 % | moyenne distance |
| LOD2 | 25 % | longue distance |
| LOD3 | 12,5 % | très longue distance |

Chaque copie reçoit un modificateur **Decimate** non appliqué. Le résultat reste donc modifiable dans Blender avant l'export. Les pourcentages sont des valeurs de départ : un personnage animé, un objet fin ou une silhouette importante demande souvent une correction manuelle.

## Utilisation dans Godot

Godot génère déjà automatiquement des niveaux de détail lors de l'import d'une scène 3D GLB. Pour la plupart des objets, exporter seulement le fichier principal suffit donc.

Les LOD BlendUp sont utiles lorsqu'un contrôle artistique précis est nécessaire. Après **Tout exporter**, BlendUp crée :

- `Assets/BlendUp/blendup_lod_group.gd`, le composant commun de sélection par distance ;
- `<Asset>_lod.tscn`, une scène prête à être glissée dans la scène Godot.

Les distances initiales sont 20, 45 et 90 unités. Elles sont exposées dans l'inspecteur Godot via `lod_distances` et peuvent être adaptées au jeu.

Pour un décor très complexe, les **Visibility Ranges / HLOD** de Godot restent une autre solution utile. Documentation officielle : [Mesh LOD](https://docs.godotengine.org/en/stable/tutorials/3d/mesh_lod.html) et [Visibility ranges](https://docs.godotengine.org/en/stable/tutorials/3d/visibility_ranges.html).
