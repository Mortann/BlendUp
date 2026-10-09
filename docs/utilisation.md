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

Ces raccourcis ne déclenchent aucune action sur les fichiers pendant la saisie dans un champ. Les notifications flottent en bas à gauche et se ferment automatiquement après 5 secondes (8 secondes pour une erreur). Les options de tri et d’affichage passent dans un menu lorsque la place manque ; les dossiers parents restent accessibles depuis le bouton `…` du chemin.

Dans **Paramètres → Application et lancement de Blender**, active **Ouvrir automatiquement les nouveaux assets dans Blender** pour ouvrir chaque asset dès sa création. Cette option est désactivée par défaut. La création du fichier se fait sans fenêtre de terminal ; l'option d'affichage de la fenêtre de commande concerne l'ouverture de Blender pour travailler sur le fichier.

Si Blender est installé via Steam, BlendUp utilise le lanceur Steam pour les nouvelles sessions interactives. Ferme une ancienne session lancée directement, puis rouvre un asset depuis BlendUp pour permettre à Steam de suivre cette session. Les exports et contrôles en arrière-plan utilisent directement Blender.

Les fichiers `.blend1`, `.blend2`, etc. sont les sauvegardes de Blender. Ils n’apparaissent pas comme assets et ne sont pas recopiés lors d’une duplication. Les sauvegardes déjà présentes sont conservées.

## Renommer les dossiers du projet

Dans **Paramètres → Type de projet**, modifie les chemins **Sources**, **Projet moteur** et **Exports**, puis clique sur **Enregistrer les dossiers**. Il s’agit du nom réel des dossiers, relatif au projet BlendUp. Ferme Blender et le moteur avant ce déplacement.

BlendUp déplace les fichiers et conserve les identifiants, notes, miniatures, variantes, LOD, rapports UV et exports. Les références `res://` de Godot sont mises à jour et les métadonnées Unity sont conservées. Unity impose une destination sous son dossier `Assets`. Les chemins absolus enregistrés dans les fichiers Blender ou dans d’autres outils doivent être adaptés dans ces outils.

Les sources et le moteur doivent rester séparés. Une destination existante est refusée pour éviter de remplacer des fichiers. Si le déplacement échoue, BlendUp restaure les chemins et les dossiers précédents.

## Lire les problèmes

Une fiche regroupe les problèmes d’un asset et de ses versions. Elle indique le chemin, la cause principale et le score UV avec son seuil. Recherche, gravité et type permettent de filtrer la liste. Les mesures complètes et traces Blender sont repliées sous **Mesures et détails techniques**.

Un ancien échec dû aux UV ne reste pas affiché après un contrôle à jour qui passe, ou après la désactivation du contrôle UV. Les autres erreurs d’export restent signalées. Après installation de l’add-on **0.5.1**, lance **Vérifier tous les assets** une fois pour renouveler les rapports créés par l’ancienne analyse.

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

Dans **Paramètres → Préparation et qualité dans Blender**, enregistre les options de ton projet. Elles sont désactivées par défaut et nécessitent l'add-on **BlendUp 0.5.1** ou plus récent dans Blender : réinstalle le ZIP mis à jour puis redémarre Blender.

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


## Showcases des dossiers

Dans l’explorateur, ouvre un dossier puis active **Showcase** dans la barre du haut, ou utilise **clic droit → Activer le Showcase** sur le dossier. Une carte violette apparaît après ses dossiers et assets. Elle comprend les assets principaux de tous les sous-dossiers ; les sauvegardes `.blend1`, variantes et LOD n’ajoutent pas de doublons.

BlendUp dispose les objets sur un sol neutre, conserve leur taille, les centre dans des cases adaptées à leurs dimensions et les pose sur le sol. Les options de la carte règlent l’espacement minimum. Un éclairage et une caméra permettent aussi de voir l’ensemble.

- **Blender** ouvre `.blendup/showcases/<id>/Showcase.blend`, avec des instances liées aux sources.
- Dans un projet Godot, **Godot** ouvre automatiquement `BlendUp/Showcases/<id>.tscn` dans le moteur. Lors du premier lancement, choisis l’exécutable si nécessaire. Le panneau Godot permet ensuite de réutiliser la session ouverte.
- La scène Godot référence uniquement les GLB à jour. Les exports absents, anciens ou bloqués sont comptés sur la carte ; corrige-les et exporte-les pour les ajouter. La scène Blender reste indépendante du contrôle des exports.
- Les scènes se régénèrent après un changement de sources, d’exports ou d’options lorsque BlendUp est ouvert. **Régénérer** permet de relancer manuellement une génération échouée.

Ces scènes sont générées : fais-en une copie si tu veux modifier durablement leur disposition. Désactiver l’option retire la carte et arrête les mises à jour ; les fichiers déjà générés sont conservés. Le réglage suit les déplacements et renommages des dossiers et du dossier sources.

## Bibliothèques Blender et Godot

Dans **Paramètres → Bibliothèque dans les éditeurs** :

1. Réinstalle `apps/blender-addon/blendup.zip` (version **0.6.1**) et redémarre Blender. Clique **Synchroniser la bibliothèque Blender**, ou utilise le bouton **Synchroniser** du panneau Blender.
2. Dans Blender, ouvre un asset ou un Showcase et va dans `N → BlendUp → Bibliothèque du projet`. La liste permet une recherche et un placement au curseur. Le navigateur natif fournit le glisser-déposer. L’import lié est proposé par défaut ; la liste peut aussi importer une copie.
3. Pour un projet Godot, clique **Installer et activer le panneau Godot** puis rouvre Godot. Le dock **BlendUp** présente les assets du projet associé, leurs aperçus, la recherche et un filtre par dossier. Glisse un asset dans la vue 3D ou utilise **Placer** / le double-clic. Le placement est annulable et reste lié au GLB.

Le panneau Godot n’utilise pas les exports bloqués ou modifiés. Il relit l’index et les imports automatiquement. Les sauvegardes via l’add-on Blender actualisent cet index même quand BlendUp est fermé. Les instances liées suivent les mécanismes habituels de rechargement des bibliothèques Blender et des scènes Godot.

Le plugin est installé sous `<projet moteur>/addons/blendup`. Les autres plugins activés sont conservés. Les fichiers de plugin remplacés sont sauvegardés en `.backup`. Les sources du plugin se trouvent dans `apps/godot-addon/addons/blendup` pour une installation manuelle.

## Animations des personnages

Après un export, sélectionne le personnage et ouvre **3D / Animations**. Choisis un clip pour afficher sa première pose, puis utilise lecture/pause, la barre de temps, la vitesse et la boucle. **Pose de repos** revient au modèle non animé ; **Squelette** affiche les os. Les durées sont en secondes. L'aperçu lit les animations du GLB ou du FBX exporté ; réexporte après une modification dans Blender. Les projets sans moteur utilisent leur aperçu GLB local.

L'application et l'add-on 0.6.1 utilisent le même pipeline. Chaque action du rig devient un clip séparé, y compris les actions conservées sans action active et celles d'une piste NLA contenant plusieurs bandes. Les plages propres aux actions et la cadence Blender sont conservées ; chaque clip commence à zéro seconde. Les réglages Rigify non animés restent à leur valeur enregistrée. Les contrôles visuels et le métarig inutilisé sont exclus ; les poses de bibliothèque marquées comme assets sur une seule image sont ignorées.

Avec Rigify, les os de déformation sont échantillonnés à chaque image et leur hiérarchie d'export est aplatie pour éviter les déformations liées à l'héritage d'échelle. Les B-Bones courbes ne sont pas représentés comme des segments supplémentaires dans les formats moteur : vérifie les zones fortement courbées dans l'aperçu. Pour plusieurs rigs aux mêmes noms d'os, associe les actions au rig voulu dans Blender ; les actions sans association ambiguë sont signalées dans le journal. Le fichier source, les pistes NLA, les réglages et la sélection sont restaurés après l'export. Un export échoué conserve le fichier moteur précédent.

Les réglages Showcases et intégrations sont dans `.blendup/showcases.json` et `.blendup/integrations.json`. L’index, la bibliothèque Blender et les scènes Blender générées sont des caches ignorés par Git ; les scènes Godot et son plugin peuvent être versionnés. Le chemin local de l’exécutable Godot est mémorisé dans `.blendup/local-tools.json` (également ignoré).
