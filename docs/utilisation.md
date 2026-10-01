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

Les flèches de la navigation permettent de replier les dossiers ; cet état est mémorisé pour chaque projet. Après une duplication ou un collage de copie, BlendUp propose de renommer le nouvel asset. Annuler conserve la copie avec son nom automatique.

Le menu contextuel permet aussi d'afficher le fichier `.blend` dans l'explorateur local, ou d'ouvrir un dossier. Les raccourcis apparaissent en gris dans ce menu :

| Action | Raccourci |
| --- | --- |
| Renommer l'asset ou le dossier sélectionné | F2 |
| Dupliquer l'asset | Ctrl+D |
| Copier / couper / coller l'asset | Ctrl+C / Ctrl+X / Ctrl+V |
| Mettre la sélection à la corbeille, après confirmation | Suppr |
| Ouvrir l'asset dans Blender | Entrée |
| Afficher la sélection dans les fichiers locaux | Ctrl+Entrée |
| Rechercher | Ctrl+F |
| Créer un asset / un dossier | Ctrl+N / Ctrl+Maj+N |
| Remonter au dossier parent | Alt+↑ |
| Fermer un dialogue ou la fiche détaillée | Échap |

Ces raccourcis ne déclenchent aucune action sur les fichiers pendant la saisie dans un champ. Les notifications se ferment automatiquement après 5 secondes (8 secondes pour une erreur) et peuvent toujours être fermées manuellement.

Dans **Paramètres → Application et lancement de Blender**, active **Ouvrir automatiquement les nouveaux assets dans Blender** pour ouvrir chaque asset dès sa création. Cette option est désactivée par défaut. La création du fichier se fait sans fenêtre de terminal ; l'option d'affichage de la fenêtre de commande concerne l'ouverture de Blender pour travailler sur le fichier.

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

## Préparation à chaque sauvegarde

Dans **Paramètres → Préparation et qualité dans Blender**, enregistre les options de ton projet. Elles sont désactivées par défaut et nécessitent l'add-on **BlendUp 0.5.0** ou plus récent dans Blender : réinstalle le ZIP mis à jour puis redémarre Blender.

- **Appliquer position, rotation et échelle** applique les trois transformations des objets maillages locaux, en conservant leur géométrie dans la scène.
- **Refaire automatiquement l'unwrap Angle Based** remplace les coordonnées de la couche UV de rendu, à partir des coutures existantes. Cette option peut donc remplacer un dépliage manuel. Elle ne crée pas de coutures.

La préparation s'exécute avant chaque sauvegarde d'un asset sous `Art`, y compris pour les variantes et LOD. Les maillages masqués sont également traités ; les maillages liés en lecture seule sont ignorés avec un avertissement. Le mode de travail, la sélection et la visibilité sont restaurés. Les traitements lancés en arrière-plan par BlendUp ne réenregistrent pas les sources.

## Score UV et blocage des exports

Active **Vérifier automatiquement les UV** et choisis un **score minimum de 1 à 100** (70 par défaut). Un score égal au seuil est accepté. La validation se fait après la sauvegarde dans Blender et juste avant chaque export GLB ou FBX, depuis l'application ou l'add-on. Elle porte sur les maillages de la scène, avec leurs modificateurs et leur couche UV de rendu.

Le score apparaît sur les assets, dans leur fiche et sur leurs variantes/LOD. Le bouton **Vérifier** contrôle l'original et ses versions sans modifier leurs sources ; **Vérifier tous les assets** contrôle la bibliothèque. Les scores insuffisants sont signalés dans **Problèmes**. Un export refusé conserve le dernier fichier moteur réussi. Les aperçus des projets 3D restent disponibles, même avec de mauvais UV.

BlendUp calcule un indicateur de qualité géométrique, pas une appréciation artistique :

| Mesure | Effet |
| --- | --- |
| UV absents, invalides ou faces dégénérées | Réduisent la proportion de triangles valides |
| Étirement | Compare les deux directions de déformation de chaque triangle |
| Densité | Mesure la régularité de la densité de texels au sein de chaque maillage |
| Chevauchements | Pénalisent la surface UV superposée, y compris entre objets |

Pour chaque maillage : `score = 100 × validité × (0,8 × qualité d'étirement + 0,2 × régularité de densité) × (1 − chevauchement)`. Le score de l'asset retient le maillage le plus faible. Les surfaces et densités sont pondérées par l'aire ; la validité tient aussi compte du nombre de triangles invalides. Les UV sur plusieurs tuiles, notamment UDIM, sont acceptés.

**Tolérer les chevauchements intentionnels** retire leur pénalité, par exemple pour des îlots superposés, des instances ou des matériaux utilisant des espaces UV distincts. Les intersections multiples sont estimées de façon conservatrice. Une analyse qui échoue ou dépasse la limite de complexité est signalée comme incomplète et bloque l'export lorsque le contrôle est actif.

Les diagnostics de coutures indiquent le nombre de coutures marquées, de coupures UV réelles, de coutures non ouvertes et de coupures non marquées. Leur emplacement souhaitable dépend de la forme, des textures et de l'usage : il n'entre pas dans le score.

Les rapports sont conservés dans `.blendup/uv-reports`. Un fichier modifié, une nouvelle version de l'analyse ou un changement de tolérance aux chevauchements rendent son rapport ancien. Changer seulement le seuil réévalue immédiatement les rapports existants. Chaque export refait néanmoins l'analyse sur la géométrie réelle.
