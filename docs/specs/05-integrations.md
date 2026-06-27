# Integrations

## Principe General

Les integrations doivent renforcer BlendUp sans le rendre dependant d'un outil externe.

Regle :

- Blender et Unity sont essentiels.
- Git est fortement recommande.
- Git LFS est fortement recommande.
- ClickUp est hors V1, mais possible plus tard.
- PureRef est optionnel.

BlendUp doit rester utilisable hors ligne.

## Blender

### Role

Blender est la source de verite artistique pour :

- mesh ;
- rig ;
- animation source ;
- collections ;
- materials sources ;
- objets exportables ;
- structure artistique.

Version cible V1 :

- Blender 4.0 minimum.

### Integration V1

Via add-on Python (implemente dans `apps/blender-addon`).

Fonctions V1 :

- detection du projet BlendUp ; [fait]
- detection de l'asset lie ; [fait]
- panneau BlendUp ; [fait]
- export FBX ; [fait]
- validation ; [fait]
- creation depuis templates ; [fait, version simple]
- retour de statut export. [fait, ecrit dans la fiche asset]

Reglages d'export : stockes dans les preferences de l'add-on Blender. Les reglages par defaut reprennent ceux du script d'export du backend pour garder une sortie coherente.

Ouverture de fiche depuis Blender : l'add-on ecrit `.blendup/temp/open-request.json` (et tente `blendup://asset/<id>`). L'ecoute cote application desktop reste a ajouter.

### Auto-export

Auto-export par defaut, mais configurable par asset.

Modes :

- `auto` : export au save ;
- `manual` : export uniquement sur demande ;
- `disabled` : pas d'export.

L'auto-export doit pouvoir etre desactive par asset.

### Validations Blender V1

Exemples :

- nom d'objet conforme ;
- nom de collection conforme ;
- unite/echelle correcte ;
- origine presente ;
- materiaux nommes correctement ;
- objets exportables identifies ;
- pas de texture manquante connue ;
- presence collider si requis ;
- respect du profil export.

### Limites V1

Ne pas tenter :

- UI complexe dans Blender ;
- gestion avancee rig/animation ;
- synchronisation temps reel ;
- modification massive des scenes Blender.

## Unity

### Role

Unity est la source de verite pour :

- prefabs ;
- composants runtime ;
- scripts ;
- import settings ;
- scenes ;
- logique gameplay.

Version cible V1 :

- Unity 6.0, version de reference `6000.0.77f1`.

### Integration V1

Via package Unity local.

Fonctions V1 :

- lire `.blendup/project.json` ;
- lire fiches assets ;
- detecter FBX ;
- creer/mettre a jour prefab ;
- appliquer composants/presets ;
- remonter statut import ;
- remonter warnings/errors ;
- remonter composants presents.

### Generation De Prefab

Regles :

- ne pas ecraser inutilement les reglages manuels ;
- garder les composants Unity existants si possible ;
- appliquer uniquement les composants autorises ;
- enregistrer les erreurs dans BlendUp ;
- eviter de supprimer des donnees sans confirmation ;
- rester simple en V1.

### Modifications Automatiques Autorisees V1

Le package Unity peut automatiquement :

- creer un prefab si le prefab attendu n'existe pas ;
- mettre a jour la reference vers le FBX importe ;
- creer ou mettre a jour la racine visuelle geree par BlendUp ;
- ajouter les composants configures si absents ;
- configurer des composants simples explicitement geres par preset ;
- appliquer tag/layer uniquement si le preset le demande ;
- creer un collider simple si le preset le demande ;
- enregistrer le statut d'import, warnings et erreurs dans `.blendup`.

Le package Unity ne doit pas automatiquement :

- supprimer un composant existant ;
- supprimer un enfant ajoute manuellement ;
- ecraser des valeurs modifiees manuellement par un dev ;
- changer un script non gere par BlendUp ;
- deplacer un prefab existant sans confirmation ;
- modifier une scene Unity ;
- remplacer un material assigne manuellement sans confirmation.

Approche recommandee :

- BlendUp gere une zone du prefab clairement identifiee ;
- les modifications manuelles hors de cette zone sont conservees ;
- les actions risquees deviennent des warnings ou demandent confirmation.

### Composants Autorises

Les devs peuvent definir une liste de composants/presets :

- `Interactable`
- `Pickup`
- `Door`
- `Destructible`
- `StaticCollider`

BlendUp ne doit pas deviner la logique. Il applique ce qui est configure.

Un composant attendu peut etre configure comme :

- obligatoire ;
- recommande.

Si un composant attendu manque, BlendUp doit :

- signaler le probleme avec details ;
- indiquer l'asset et le prefab concernes ;
- permettre a un dev de confirmer que le composant a ete retire volontairement.

Confirmation V1 :

- le warning affiche un bouton "Confirmer le retrait" ;
- le clic retire ou desactive l'attente du composant pour cet asset ;
- une entree est ajoutee dans le journal d'activite ;
- si le composant etait obligatoire, BlendUp demande une confirmation explicite.

### Limites V1

Ne pas tenter :

- analyse complete de toutes les scenes ;
- modification automatique de gameplay complexe ;
- generation avancee de LOD ;
- support complet d'animations personnages.

## Git

### Role

Git versionne :

- donnees `.blendup` ;
- code Unity ;
- config projet ;
- fichiers texte ;
- metadata ;
- potentiellement pointeurs LFS.

### Integration V1

Fonctions utiles :

- detecter depot ;
- afficher branche active ;
- afficher changements simples ;
- proposer creation de branche ;
- proposer nomenclature de branche ;
- detecter fichiers modifies lies a un asset ;
- avertir en cas de conflit probable ;
- creer automatiquement `.gitattributes` selon la configuration Git LFS.

Si Git n'est pas installe, BlendUp doit afficher une aide d'installation.

Si Git LFS n'est pas installe, BlendUp doit afficher une aide d'installation.

### Ce Que BlendUp Ne Doit Pas Faire En V1

- remplacer les outils Git des devs ;
- gerer merges complexes ;
- rebase interactif ;
- resolution de conflits avancee ;
- workflow Git impose.

## Git LFS

### Role

Git LFS est necessaire pour :

- `.blend` ;
- `.fbx` ;
- textures ;
- images haute resolution ;
- fichiers PureRef ;
- audio si necessaire.

### Integration V1

Fonctions :

- detecter presence Git LFS ;
- creer `.gitattributes` recommande automatiquement ;
- avertir si gros fichier non suivi par LFS ;
- preparer l'option Git LFS Lock.

### Extensions Recommandees

Contenu V1 genere automatiquement :

```text
# Blender / DCC
*.blend filter=lfs diff=lfs merge=lfs -text
*.blend1 filter=lfs diff=lfs merge=lfs -text

# 3D exports
*.fbx filter=lfs diff=lfs merge=lfs -text
*.obj filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text
*.gltf filter=lfs diff=lfs merge=lfs -text

# Images / textures
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.tga filter=lfs diff=lfs merge=lfs -text
*.tif filter=lfs diff=lfs merge=lfs -text
*.tiff filter=lfs diff=lfs merge=lfs -text
*.exr filter=lfs diff=lfs merge=lfs -text
*.hdr filter=lfs diff=lfs merge=lfs -text
*.psd filter=lfs diff=lfs merge=lfs -text

# References
*.pur filter=lfs diff=lfs merge=lfs -text

# Audio, if needed
*.wav filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
```

Unity `.meta` files must stay normal text files and must not be put in LFS.

## Verrouillage

### Verrou BlendUp

Verrouillage doux :

- un asset peut etre marque verrouille ;
- les autres voient qui travaille dessus ;
- BlendUp peut desactiver certaines actions ;
- le verrou est stocke dans `.blendup/locks`.

Si deux utilisateurs creent un verrou en meme temps :

- BlendUp affiche une erreur ;
- BlendUp indique qui possede deja le verrou, sur quelle branche, et depuis quand ;
- BlendUp ne remplace pas le verrou automatiquement ;
- l'utilisateur peut annuler, ouvrir en lecture seule, ou demander au responsable de deverrouiller ;
- un lead/admin projet pourra forcer le deverrouillage si l'equipe le decide.

### Git LFS Lock

Option plus stricte :

- utile pour gros fichiers binaires ;
- depend de la configuration Git LFS ;
- peut etre ajoute plus tard ou active si disponible.

## ClickUp

### Role

ClickUp pourra gerer les taches externes dans une version ulterieure si l'equipe l'utilise.

### Strategie

BlendUp doit avoir son modele de tache interne.

ClickUp est hors V1 :

- pas le coeur du produit ;
- pas de connexion API en V1 ;
- pas de sync en V1 ;
- pas bloquant hors ligne.

### V1 Minimaliste

Fonctions retenues :

- creer une tache interne depuis BlendUp ;
- lier une tache interne a un asset ;
- garder une architecture compatible avec ClickUp plus tard.

### V1.1 Ou V2

Fonctions plus avancees :

- creation bidirectionnelle ;
- mise a jour statut ;
- assignation ;
- gestion conflits ;
- sync en arriere-plan.

## PureRef

### Role

PureRef gere les boards visuels de references.

### Strategie

BlendUp organise les references, PureRef reste l'outil de visualisation.

### V1

Fonctions :

- lier un fichier `.pur` ;
- ouvrir le fichier depuis BlendUp ;
- lier des dossiers de references ;
- associer refs a assets ou tags DA ;
- separer references globales DA et references par asset.

### Plus Tard

- generer un board depuis une selection d'images ;
- exporter un apercu ;
- verifier qu'un board existe ;
- integration ligne de commande si fiable ;
- partie DA generale plus poussee ;
- lien Pinterest ou equivalent si pertinent.

## Mode Hors Ligne

BlendUp doit rester utilisable sans :

- connexion internet ;
- ClickUp ;
- service externe ;
- serveur central.

Les donnees locales restent la source de travail. Les sync externes reprennent plus tard.
