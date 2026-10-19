# Textures et bake HIGH → LOW

BlendUp 0.3.0 et l’extension Blender 0.7.0 ajoutent le panneau **Vue 3D → N → BlendUp → Textures · Bake**. Les réglages sont conservés dans chaque scène. Le défaut est **normales 2048 × 2048**, en espace tangent OpenGL (+Y), avec une marge de 16 pixels.

## Préparer les objets

Pour une paire, nommer les maillages `Plastron_LOW` et `Plastron_HIGH`. Le nom existant `Plastron` + `Plastron_High` est également reconnu. Plusieurs HIGH sont possibles, par exemple `Plastron_HIGH.001`. Chaque paire possède exactement un LOW, ses propres UV et éventuellement un objet `Plastron_CAGE`.

**Créer le HIGH** dans **N → BlendUp → Assets de bake** duplique le LOW actif avec un maillage indépendant, le nomme, organise la paire et sélectionne le HIGH. Aucun niveau de subdivision n’est imposé : ajouter les détails selon le besoin.

Pour deux versions déjà créées : sélectionner les HIGH puis le LOW en dernier (ou utiliser **Tous** dans la liste) et cliquer **Organiser la paire**. Depuis BlendUp 0.4.1 / extension 0.8.1, seule cette paire est regroupée sous un objet vide Blender :

```text
Props/
└─ Epaulière1_Droite · Asset     objet vide dépliable
   ├─ Epaulière1_Droite         LOW
   ├─ Epaulière1_Droite_High    HIGH
   └─ Epaulière1_Droite_Cage    cage facultative
```

Il s’agit d’un Empty natif servant de conteneur, pas d’un nouveau type de données Blender. Les transformations du conteneur sont verrouillées pour limiter les déplacements involontaires. Il n’est pas exporté. Déplier sa flèche donne accès aux vrais objets, avec tous leurs outils Blender.

Les anciennes collections techniques de **cette paire** sont remplacées ; le reste de la scène garde sa structure. Les conteneurs partagés, liés ou contenant des objets et sous-collections personnalisés sont refusés avant conversion. Les maillages, matériaux, canaux d’animation et transformations des composants sont conservés. Les restrictions de visibilité des anciennes collections sont reportées sur les objets dans chaque View Layer. Les composants sont réunis dans la collection du LOW (ou le parent de son ancienne collection de bake).

Les composants doivent avoir le même parent, éventuellement le même os. Sinon, **Rattacher HIGH au parent du LOW** est proposé dans la liste. Cette action explicite conserve la position actuelle du HIGH et lui fait suivre le parent du LOW à l’avenir ; elle refuse les HIGH avec animation ou contraintes. Elle organise ensuite la paire. C’est notamment utile pour un HIGH statique face à un LOW rattaché au rig.

### Sélection et visibilité indépendantes

Dans **Assets de bake**, **LOW**, **HIGH** et **CAGE** ajoutent ou retirent la version de la sélection, sans désélectionner les autres versions. Une version masquée est réaffichée lorsqu’on la sélectionne. **Tous** sélectionne les composants et rend le LOW actif. Les yeux changent seulement la visibilité de leur version ; **Voir seul** affiche et sélectionne une seule version de la paire.

L’ancien mode global **Vue Assets / Détails**, qui filtrait tous les objets de l’Outliner, et le bouton **Simplifier** sont supprimés. L’organisation ne change aucun filtre de l’Outliner. Les fichiers de bake sauvegardés avec l’ancien filtre Assets retrouvent leurs objets à l’ouverture. Les assets restent dépliables en permanence, sans changer de mode d’affichage.

Les opérations sont annulables par Ctrl+Z et n’enregistrent pas le fichier automatiquement. L’export et le contrôle UV utilisent le LOW lorsqu’il est masqué par les commandes de visibilité BlendUp. Les restrictions manuelles et les collections exclues restent respectées. Sauvegarder le `.blend` pour conserver l’organisation.

Les HIGH et CAGE associés à un LOW sont exclus des exports et des mesures UV. Un objet nommé `Temple_HIGH` sans paire reste un asset ordinaire. Le bake peut lire les sources masquées ou dans une collection exclue ; leur visibilité est restaurée après l’opération.

## Lancer le bake

1. Enregistrer le fichier `.blend`, déplier le LOW dans la tuile UV 0–1 et passer en mode Objet.
2. Choisir **Sélectionnées** ou **Toute la scène** et les cartes à produire.
3. Cliquer **Bake · créer et brancher**.
4. Vérifier le résultat, puis sauvegarder le `.blend` pour conserver les nouveaux matériaux.

Les cartes disponibles sont les normales, la couleur sans éclairage, la rugosité et le métal. Les cartes PBR demandent un Principled BSDF relié directement à la sortie du matériau HIGH. Les graphes procéduraux connectés à ses entrées sont bakés via une émission temporaire, sans modifier les matériaux sources.

Les fichiers sont rangés dans `textures/bakes/NomDuFichier/Plastron_Normal.png`, etc. Les variantes et LOD utilisent chacun le nom de leur fichier. Un rapport `bake-report.json` décrit les cartes produites. Lors d’un rebake, les fichiers précédents sont conservés dans `backups/DATE/`. Les résultats sont préparés dans un dossier temporaire avant de remplacer les textures.

Le LOW reçoit des copies de ses matériaux pour protéger les autres objets qui les partagent. La normal map utilise `Non-Color → Normal Map (Tangent) → Principled BSDF.Normal`. La couleur utilise sRGB ; rugosité et métal utilisent Non-Color. L’UV de rendu est explicitement branché. Les anciens nœuds restent disponibles dans la copie du matériau.

## Un matériau commun pour plusieurs pièces

Dans **Textures · Bake → Matériau commun**, choisir le matériau source du groupe, par exemple `M_Armure`. Le prochain bake prépare un **atlas** et un matériau partagé `M_Armure Bake` pour les LOW des paires choisies. Pour des cartes déjà calculées, cliquer **Regrouper les bakes existants** : aucun nouveau bake Cycles n’est nécessaire.

Chaque pièce conserve ses cartes individuelles et ses UV de rendu d’origine. Une seconde couche `BlendUp_BakeAtlas` place ses cartes dans une case de l’atlas. Le matériau partagé utilise cette couche pour les cartes bakées. Les nœuds du matériau source continuent d’utiliser les UV d’origine. Les HIGH et le matériau source restent inchangés. Choisir le matériau source commun définit aussi l’aspect commun des surfaces des LOW.

Le regroupement inclut les membres déjà rattachés à ce matériau, même lors de la mise à jour d’une seule pièce. Les cartes doivent être identiques entre les membres (par exemple normales uniquement). Les anciens matériaux de bake sont retirés seulement s’ils ne sont plus utilisés et n’ont pas de faux utilisateur ; les autres matériaux sont conservés.

Une famille accepte jusqu’à 16 pièces, un atlas de 8192 px maximum et des cartes individuelles jusqu’à 4K. Le nombre de cases dépend des pièces : six normales 2K donnent un atlas 6144 × 6144. Une petite bordure protège les cases des interpolations. Les fichiers `Nom_Atlas_NORMAL.png`, etc., sont enregistrés à côté des bakes, avec sauvegarde des versions remplacées. Les LOW qui utilisent plusieurs matériaux différents doivent être séparés en surfaces avant ce regroupement. Laisser **Matériau source** vide conserve les matériaux individuels.

## Projection et armures

**Pose de repos** évalue temporairement les armatures au repos, puis rétablit leur état. Les modificateurs sont évalués avec leurs réglages de viewport ; conserver les mêmes réglages de subdivision pour l’export et le rendu du LOW.

**Surface externe (Solidify)** ignore temporairement Solidify sur le LOW pendant le bake. Cela évite que la coque intérieure partageant ses UV écrase les normales extérieures. Le modificateur est restauré et reste présent pour l’édition, le rendu et l’export. Pour baker également l’intérieur, lui donner des UV distincts et désactiver cette option.

**Extrusion (%)** définit le départ des rayons, relativement à la diagonale du LOW (1 % par défaut). **Distance max. des rayons** vaut zéro pour une distance illimitée. Adapter ces valeurs si le HIGH dépasse fortement du LOW ou utiliser une CAGE qui enveloppe les détails. La CAGE doit conserver la topologie du LOW évalué pour le bake.

Les UV superposés ou dégénérés peuvent produire des défauts ; le bake ne déplie pas automatiquement les objets. Les UDIM ne sont pas pris en charge. Un matériau baké est protégé de la préparation automatique UV/transformations à la sauvegarde, qui invaliderait son mapping. Après des modifications de géométrie, de normales ou d’UV, refaire le bake.

## Textures dans l’application

Dans les détails d’un asset, **Textures / Bake** contient l’aide et l’ouverture dans Blender, l’import d’images, la recherche, les filtres par usage, les dimensions, la taille disque et l’espace colorimétrique conseillé d’après le nom. Ces indications ne modifient pas les fichiers importés. Les miniatures se chargent à l’approche de la zone visible.

Cliquer une texture ouvre l’inspecteur, avec vue ajustée ou 100 %, fond à damier et ouverture dans l’application associée. **Échap** ferme l’inspecteur. Après un bake dans Blender, utiliser **Actualiser les textures**. Les sauvegardes sont masquées par défaut, avec une option pour les afficher. Certains formats tels qu’EXR ou TGA peuvent nécessiter un éditeur externe pour leur aperçu.
