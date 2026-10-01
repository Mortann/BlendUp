# Utilisation

## Créer un projet

Depuis l'accueil, indique un nom, choisis un dossier et sélectionne **3D · Sans moteur**, **Godot** ou **Unity**. BlendUp crée `Art` pour les sources. Seuls les projets Godot et Unity créent également le dossier `Assets` du moteur.

## Projet 3D sans moteur

Ce mode sert à gérer une bibliothèque d'assets Blender : dossiers, recherche, favoris, notes, tags, miniatures, textures, rendus, variantes et LOD. Il ne nécessite aucun projet de jeu et ne signale pas d'exports absents ou obsolètes.

La fiche d'un asset propose **Générer l'aperçu**, puis **Actualiser l'aperçu**. Blender génère un GLB dans le cache local `.blendup/cache/previews`, sans modifier le fichier source. Après une modification dans Blender, actualise l'aperçu à la demande. Le cache peut être supprimé et régénéré ; les notes et images restent dans le projet.

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
- **3D** : asset local d'un projet sans moteur, sans obligation d'export.

## Changer de type de projet

Dans Paramètres, choisis 3D, Godot ou Unity. Passer en 3D retire le suivi des exports moteur. Relier Godot ou Unity crée la destination correspondante. Les sources, métadonnées, variantes, LOD et anciens dossiers moteur sont conservés. Les destinations des versions sont recalculées pour le type actif.

## Dans Blender

Installe l'add-on situé dans `apps/blender-addon/blendup.zip`. Après avoir ouvert un fichier sous `Art`, le panneau **BlendUp** indique le projet et permet de préparer les dossiers et de contrôler les maillages. En mode 3D, les actions d'export moteur sont masquées et l'export automatique reste inactif. Avec Godot ou Unity, le panneau indique aussi la destination et l'état de l'export.
