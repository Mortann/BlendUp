# Textures et bake HIGH → LOW

BlendUp 0.3.0 et l’extension Blender 0.7.0 ajoutent le panneau **Vue 3D → N → BlendUp → Textures · Bake**. Les réglages sont conservés dans chaque scène. Le défaut est **normales 2048 × 2048**, en espace tangent OpenGL (+Y), avec une marge de 16 pixels.

## Préparer les objets

Pour une paire, nommer les maillages `Plastron_LOW` et `Plastron_HIGH`. Le nom existant `Plastron` + `Plastron_High` est également reconnu. Plusieurs HIGH sont possibles, par exemple `Plastron_HIGH.001`. Chaque paire possède exactement un LOW, ses propres UV et éventuellement un objet `Plastron_CAGE`.

Pour organiser automatiquement : sélectionner le ou les HIGH, puis le LOW en dernier (objet actif), et cliquer **Organiser la paire**. Les objets gardent leurs noms, parents, transformations et modificateurs. Ils sont déplacés dans cette structure :

```text
Props/
└─ Plastron/              une collection par asset
   ├─ Plastron            objet LOW
   ├─ Plastron_High       objet HIGH, autres sources éventuelles
   └─ Plastron_Cage       cage facultative
```

Depuis BlendUp 0.3.1 / extension 0.7.1, cette structure compacte remplace les sous-collections LOW / HIGH / CAGE. Le lien est mémorisé sur les objets : ils peuvent ensuite être renommés. Une cage nommée `Plastron_CAGE` est reconnue automatiquement ; les objets des anciennes collections HIGH ou CAGE gardent leur rôle lors de la conversion.

### Une seule entrée par pièce dans l’Outliner

Dans **N → BlendUp → Assets dans la scène**, cliquer **Simplifier** pour convertir les anciennes structures `Nom_BAKE → Nom_LOW / Nom_HIGH / Nom_CAGE`. Cela conserve les noms des objets, maillages, transformations, matériaux, liens de bake et leur visibilité dans chaque View Layer. Les collections partagées ou liées, et celles contenant des sous-collections personnalisées, doivent être séparées avant la conversion. Les autres collections restent en place. La conversion est annulable par Ctrl+Z et n’enregistre pas le fichier automatiquement.

Le bouton **Assets** dans l’en-tête de l’Outliner (ou **Vue Assets** dans le panneau) affiche uniquement les collections : une ligne `Epaulière1_Droite` remplace les lignes techniques. Il agit sur les filtres de l’Outliner et ne masque aucun maillage dans la vue 3D. **Détails** réaffiche les objets.

La liste **Assets dans la scène** propose une recherche et les boutons **LOW**, **HIGH** et éventuellement **Cage** par pièce. Ils affichent et sélectionnent cette version dans le View Layer courant, en masquant les autres versions de la même pièce. Les autres assets restent tels quels. Le bouton portant le nom de l’asset sélectionne son LOW. Le mode Objet est nécessaire pour changer de version.

L’export et le contrôle UV continuent d’utiliser le LOW lorsque celui-ci est masqué uniquement par l’affichage HIGH/Cage de BlendUp. Les collections exclues ou masquées manuellement restent respectées. Sauvegarder le `.blend` pour conserver l’organisation et le mode d’affichage.

Les HIGH et CAGE associés à un LOW sont exclus des exports et des mesures UV. Un objet nommé `Temple_HIGH` sans paire reste un asset ordinaire. Le bake peut lire les sources masquées ou dans une collection exclue ; leur visibilité est restaurée après l’opération.

## Lancer le bake

1. Enregistrer le fichier `.blend`, déplier le LOW dans la tuile UV 0–1 et passer en mode Objet.
2. Choisir **Sélectionnées** ou **Toute la scène** et les cartes à produire.
3. Cliquer **Bake · créer et brancher**.
4. Vérifier le résultat, puis sauvegarder le `.blend` pour conserver les nouveaux matériaux.

Les cartes disponibles sont les normales, la couleur sans éclairage, la rugosité et le métal. Les cartes PBR demandent un Principled BSDF relié directement à la sortie du matériau HIGH. Les graphes procéduraux connectés à ses entrées sont bakés via une émission temporaire, sans modifier les matériaux sources.

Les fichiers sont rangés dans `textures/bakes/NomDuFichier/Plastron_Normal.png`, etc. Les variantes et LOD utilisent chacun le nom de leur fichier. Un rapport `bake-report.json` décrit les cartes produites. Lors d’un rebake, les fichiers précédents sont conservés dans `backups/DATE/`. Les résultats sont préparés dans un dossier temporaire avant de remplacer les textures.

Le LOW reçoit des copies de ses matériaux pour protéger les autres objets qui les partagent. La normal map utilise `Non-Color → Normal Map (Tangent) → Principled BSDF.Normal`. La couleur utilise sRGB ; rugosité et métal utilisent Non-Color. L’UV de rendu est explicitement branché. Les anciens nœuds restent disponibles dans la copie du matériau.

## Projection et armures

**Pose de repos** évalue temporairement les armatures au repos, puis rétablit leur état. Les modificateurs sont évalués avec leurs réglages de viewport ; conserver les mêmes réglages de subdivision pour l’export et le rendu du LOW.

**Surface externe (Solidify)** ignore temporairement Solidify sur le LOW pendant le bake. Cela évite que la coque intérieure partageant ses UV écrase les normales extérieures. Le modificateur est restauré et reste présent pour l’édition, le rendu et l’export. Pour baker également l’intérieur, lui donner des UV distincts et désactiver cette option.

**Extrusion (%)** définit le départ des rayons, relativement à la diagonale du LOW (1 % par défaut). **Distance max. des rayons** vaut zéro pour une distance illimitée. Adapter ces valeurs si le HIGH dépasse fortement du LOW ou utiliser une CAGE qui enveloppe les détails. La CAGE doit conserver la topologie du LOW évalué pour le bake.

Les UV superposés ou dégénérés peuvent produire des défauts ; le bake ne déplie pas automatiquement les objets. Les UDIM ne sont pas pris en charge. Un matériau baké est protégé de la préparation automatique UV/transformations à la sauvegarde, qui invaliderait son mapping. Après des modifications de géométrie, de normales ou d’UV, refaire le bake.

## Textures dans l’application

Dans les détails d’un asset, **Textures / Bake** contient l’aide et l’ouverture dans Blender, l’import d’images, la recherche, les filtres par usage, les dimensions, la taille disque et l’espace colorimétrique conseillé d’après le nom. Ces indications ne modifient pas les fichiers importés. Les miniatures se chargent à l’approche de la zone visible.

Cliquer une texture ouvre l’inspecteur, avec vue ajustée ou 100 %, fond à damier et ouverture dans l’application associée. **Échap** ferme l’inspecteur. Après un bake dans Blender, utiliser **Actualiser les textures**. Les sauvegardes sont masquées par défaut, avec une option pour les afficher. Certains formats tels qu’EXR ou TGA peuvent nécessiter un éditeur externe pour leur aperçu.
