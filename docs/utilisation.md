# Utilisation

## Créer un projet

Depuis l'accueil, indique un nom, choisis un dossier vide et sélectionne Godot ou Unity. BlendUp crée automatiquement `Art` et le dossier `Assets` du moteur.

## Ajouter et exporter un asset

1. Place un fichier `.blend` n'importe où sous `Art`.
2. Actualise la vue Assets si elle est déjà ouverte.
3. Classe-le dans les dossiers, ajoute si besoin une miniature, des tags, des notes, des variantes ou des LOD.
4. Ouvre le fichier dans Blender ou lance directement son export.
5. Utilise **Exporter** dans l'en-tête pour traiter tous les assets manquants ou obsolètes.

L'explorateur propose une grille, une liste et une vue compacte. La recherche couvre le nom, le dossier et les tags. Les favoris, filtres et tris sont mémorisés localement. Un clic ouvre la fiche détaillée ; un double-clic ouvre le fichier dans Blender. Les assets peuvent être copiés, déplacés, dupliqués ou déposés sur un dossier.

## États

- **Prêt** : aucun export n'existe encore.
- **À jour** : l'export est au moins aussi récent que le fichier Blender.
- **À réexporter** : le fichier Blender a changé depuis l'export.
- **Erreur** : Blender n'a pas terminé le dernier export.

## Changer de moteur

Dans Paramètres, choisis Godot ou Unity. BlendUp crée la nouvelle destination et considère les assets comme non exportés pour ce moteur. L'ancien dossier reste intact.

## Dans Blender

Installe l'add-on situé dans `apps/blender-addon/blendup`. Après avoir ouvert un fichier sous `Art`, le panneau **BlendUp** de la vue 3D indique le projet, le moteur, la destination et l'état de l'export. Il permet aussi de contrôler les UV, matériaux, échelles et arêtes non-manifold. L'option d'export automatique se trouve dans les préférences de l'add-on.
