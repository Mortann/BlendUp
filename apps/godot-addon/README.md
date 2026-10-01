# BlendUp pour Godot 4

Installation recommandée : dans BlendUp, **Paramètres → Bibliothèque dans les éditeurs → Installer et activer le panneau Godot**, puis rouvre le projet Godot. Le plugin trouve automatiquement le projet BlendUp associé au dossier moteur.

Le dock **BlendUp** propose recherche par nom/tag, filtre de dossiers récursif, aperçus et glisser-déposer des GLB dans la vue 3D ou l’arbre de scène. **Placer** et le double-clic ajoutent une instance annulable à la scène ouverte. Les exports manquants, modifiés ou bloqués restent signalés et ne sont pas plaçables.

Pour une installation manuelle, copie `addons/blendup` dans le dossier Godot, puis active **BlendUp** dans **Projet → Paramètres → Extensions**. Ouvre une fois le projet dans BlendUp pour initialiser `.blendup/library/index.json`. Ensuite, le dock actualise automatiquement l’index ; les sauvegardes via l’add-on Blender publient ses mises à jour même si BlendUp est fermé.

Les Showcases sont générés par BlendUp sous `BlendUp/Showcases`. Le plugin permet d’ouvrir la scène demandée dans l’éditeur déjà lancé, sans changer les autres scènes ouvertes.

Validation automatisée : `tests/smoke.gd` charge un Showcase réel, vérifie les instances et leur position sur le sol, ainsi que les données du glisser-déposer et le refus des exports bloqués. Le test Rust `showcases_and_library_work_in_real_editors` pilote Blender et Godot avec `BLENDUP_TEST_BLENDER` et `BLENDUP_TEST_GODOT`.
