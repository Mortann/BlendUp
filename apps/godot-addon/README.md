# BlendUp pour Godot 4

Installation recommandée : dans BlendUp, **Paramètres → Bibliothèque dans les éditeurs → Installer et activer le panneau Godot**, puis rouvre le projet Godot. Le plugin trouve automatiquement le projet BlendUp associé au dossier moteur.

Le dock **BlendUp** propose recherche par nom/tag, filtre de dossiers récursif, aperçus et glisser-déposer dans la vue 3D ou l’arbre de scène. Sélectionne un asset pour choisir sa variante avant placement. **Placer** et le double-clic ajoutent une instance annulable à la scène ouverte. Les exports manquants, modifiés ou bloqués restent signalés et ne sont pas plaçables.

Après placement, sélectionne la racine de l’instance et choisis **Variante** dans l’inspecteur. Chaque instance garde son propre choix, ses transformations et ses enfants de gameplay ; les changements utilisent l’historique d’annulation Godot. Les variantes sont identifiées par leur ID, même si leur nom ou leur ordre change. Si une variante est supprimée ou devient indisponible, l’inspecteur le signale sans lui substituer un autre modèle.

Le plugin génère des définitions partagées et de petites scènes de placement dans `BlendUp/Instances`. Conserve ce dossier et les scripts `addons/blendup/asset_definition.gd` et `asset_instance.gd` dans le projet. Les définitions référencent directement les scènes exportées : elles fonctionnent dans le jeu exporté, sans application BlendUp ni plugin éditeur actif. Les réexports mettent à jour les instances ; ajoute tes collisions et autres enfants sur la racine BlendUp stable. Attache tes scripts de gameplay à ces enfants, ou fais-les étendre `asset_instance.gd` pour les mettre sur la racine. Le contenu `Model` est généré et remplacé lors d’un changement de variante.

Pour mettre à jour une installation existante : **Paramètres → Bibliothèque dans les éditeurs → Mettre à jour le panneau Godot**, puis rouvre le projet. Les GLB déjà placés avec l’ancien panneau restent des instances ordinaires ; les nouveaux placements disposent du sélecteur.

Pour une installation manuelle, copie `addons/blendup` dans le dossier Godot, puis active **BlendUp** dans **Projet → Paramètres → Extensions**. Ouvre une fois le projet dans BlendUp pour initialiser `.blendup/library/index.json`. Ensuite, le dock actualise automatiquement l’index ; les sauvegardes via l’add-on Blender publient ses mises à jour même si BlendUp est fermé.

Les Showcases sont générés par BlendUp sous `BlendUp/Showcases`. Le plugin permet d’ouvrir la scène demandée dans l’éditeur déjà lancé, sans changer les autres scènes ouvertes.

Validation automatisée : `tests/smoke.gd` vérifie un Showcase réel ; `tests/variants_smoke.gd` vérifie le changement de variante, les transformations, les enfants, la sauvegarde et le fonctionnement au runtime ; `tests/editor_smoke.gd` teste le dock et le véritable inspecteur avec annulation. Le test Rust `showcases_and_library_work_in_real_editors` pilote Blender et Godot avec `BLENDUP_TEST_BLENDER` et `BLENDUP_TEST_GODOT`.
