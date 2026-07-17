# Utilisation

## Créer un projet

Depuis l'accueil, indique un nom, choisis un dossier vide et sélectionne Godot ou Unity. BlendUp crée automatiquement `Art` et le dossier `Assets` du moteur.

## Ajouter et exporter un asset

1. Place un fichier `.blend` n'importe où sous `Art`.
2. Actualise la vue Assets si elle est déjà ouverte.
3. Ouvre le fichier dans Blender ou lance directement son export.
4. Utilise **Exporter** dans l'en-tête pour traiter tous les assets manquants ou obsolètes.

## États

- **Prêt** : aucun export n'existe encore.
- **À jour** : l'export est au moins aussi récent que le fichier Blender.
- **À réexporter** : le fichier Blender a changé depuis l'export.
- **Erreur** : Blender n'a pas terminé le dernier export.

## Changer de moteur

Dans Paramètres, choisis Godot ou Unity. BlendUp crée la nouvelle destination et considère les assets comme non exportés pour ce moteur. L'ancien dossier reste intact.

