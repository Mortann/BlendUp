# Vision Produit

## Resume

BlendUp est une application separee qui sert de hub de production pour les assets d'un projet Unity cree principalement avec Blender.

Elle relie :

- les sources artistiques Blender ;
- les exports destines a Unity ;
- les prefabs Unity ;
- les references visuelles ;
- les notes artistes/devs ;
- les statuts de production ;
- les regles de nomenclature ;
- les taches ;
- les informations Git utiles.

Le but est d'aider une petite equipe a travailler proprement sans imposer un pipeline lourd de gros studio.

## Probleme A Resoudre

Dans un projet Unity/Blender, les frictions apparaissent rapidement :

- fichiers Blender disperses ;
- exports FBX faits a la main ;
- noms incoherents ;
- assets temporaires qui finissent en production ;
- prefabs Unity casses ou incomplets ;
- references visuelles perdues dans des dossiers ;
- notes artistes/devs eparpillees ;
- taches non reliees aux assets ;
- gros fichiers difficiles a gerer avec Git ;
- manque de visibilite sur l'etat reel d'un asset.

Le projet peut rester gerable avec 10 assets, mais devient vite fragile avec 100, 300 ou 500 assets.

## Objectif Principal

Faire de BlendUp la couche commune entre creation artistique et integration Unity.

BlendUp doit repondre a trois questions simples :

1. Qu'est-ce que cet asset ?
2. Ou sont ses fichiers et son etat ?
3. Que faut-il faire pour qu'il arrive proprement dans Unity ?

## Utilisateurs Cibles

### Artistes

Ils doivent pouvoir :

- retrouver leurs assets ;
- ouvrir rapidement le bon fichier Blender ;
- voir les references et notes ;
- creer des assets avec les bons templates ;
- exporter sans refaire toujours les memes actions ;
- comprendre les erreurs de validation ;
- envoyer leur travail sans devoir maitriser tout Git.

### Developpeurs

Ils doivent pouvoir :

- voir les assets disponibles ou a integrer ;
- savoir quel prefab correspond a quel asset ;
- definir les composants Unity autorises ;
- voir les erreurs d'import ;
- verifier les scripts/composants attaches ;
- remonter des informations vers BlendUp ;
- continuer a utiliser Git avec leurs outils habituels.

### Leads / responsables

Ils doivent pouvoir :

- suivre l'avancement ;
- voir les assets bloques ;
- verifier les conventions projet ;
- organiser les priorites ;
- eviter les pertes d'informations entre art et dev.

## Positionnement

BlendUp n'est pas :

- un remplacement de Blender ;
- un remplacement de Unity ;
- un clone de ClickUp ;
- un remplacement de PureRef ;
- un client Git complet ;
- un pipeline USD ;
- un asset store ;
- un outil de scene editing.

BlendUp est :

- un hub d'assets ;
- une interface de pipeline ;
- une source de metadata projet ;
- un assistant de creation et validation ;
- une passerelle Blender -> Unity ;
- une interface de coordination pour petite equipe.

## Principe De Source De Verite

Pour eviter les conflits, chaque type d'information doit avoir une source de verite claire.

| Information | Source de verite |
| --- | --- |
| Geometrie, rig, mesh, collections artistiques | Blender |
| Prefab, composants runtime, scripts Unity, scenes | Unity |
| Notes, statuts, references, taches liees, conventions | BlendUp |
| Historique de fichiers, branches, commits | Git |
| Gros fichiers versionnes | Git LFS |
| Taches externes synchronisees | ClickUp, post-V1 si active |

La V1 ne cherche pas a faire une synchronisation complete dans les deux sens. Le flux principal reste Blender -> Unity. Le retour Unity -> BlendUp sert a remonter des informations d'integration.

## Principes Produit

- Simple avant complet.
- Visible avant automatique.
- Avertir avant bloquer.
- Les conventions doivent etre configurables.
- Les fichiers BlendUp doivent etre versionnes dans Git.
- Les artistes ne doivent pas etre forces a comprendre toute la technique.
- Les developpeurs ne doivent pas etre forces a abandonner leurs outils.
- Les assets doivent avoir un ID stable independant du nom.
- Les templates doivent faire gagner du temps sans devenir rigides.
- Les integrations externes doivent rester optionnelles.

## Ton De L'Application

L'interface doit etre sobre, pratique et epuree.

Elle doit ressembler a un outil de production, pas a une page marketing. Elle doit privilegier :

- lisibilite ;
- filtres solides ;
- panneaux de details ;
- statuts clairs ;
- actions rapides ;
- warnings comprehensibles ;
- thumbnails utiles.

## Vision Long Terme

A terme, BlendUp pourrait devenir un outil complet de suivi d'assets pour Unity, avec :

- plusieurs types d'assets ;
- gestion de variantes ;
- sync ClickUp avancee post-V1 ;
- generation de previews ;
- validation plus fine ;
- analyse de dependances ;
- suivi de scenes/zones ;
- templates projet riches ;
- systeme de review plus complet.

Mais la V1 doit rester centree sur un pipeline d'assets realiste.
