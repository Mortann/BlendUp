# Exécutable de mise à jour Windows

Chaque prochaine release Windows propose deux fichiers :

- `BlendUp_<version>_x64-setup.exe` pour installer l'application ;
- `BlendUp_<version>_x64-update.exe` pour mettre à jour une installation existante, l'addon Blender et les addons Godot sélectionnés.

Le fichier de mise à jour contient l'installateur, l'application et l'archive Blender de la même version. Les fichiers Godot sont embarqués dans l'application. Il fonctionne sans télécharger d'autres fichiers BlendUp.

## Utilisation

À partir de BlendUp 0.2.4, l’application recherche la dernière version stable publiée sur le dépôt GitHub au démarrage, puis toutes les six heures. Les paramètres affichent la version installée et un bouton de vérification manuelle. La proposition peut être reportée pour la session ; une coupure réseau ne bloque pas le travail.

Le bouton **Mettre à jour** demande d’enregistrer le travail et de fermer les éditeurs, télécharge l’exécutable correspondant à la version proposée et vérifie sa taille et son empreinte SHA-256 avant de le lancer. BlendUp se ferme uniquement après un téléchargement valide et le démarrage de l’assistant. Un téléchargement incorrect est supprimé. Les versions en brouillon, de test, identiques ou plus anciennes ne sont pas proposées. Sous Linux, la proposition ouvre la page de la release pour télécharger le paquet adapté.

1. Enregistrer le travail puis fermer BlendUp, Blender et Godot. L'outil refuse de continuer si l'une de ces applications est ouverte et ne ferme pas les sessions de travail.
2. Lancer `*-update.exe`. Vérifier le dossier de BlendUp et le chemin de `blender.exe` ; les chemins habituels sont détectés automatiquement.
3. Choisir les projets Godot à mettre à jour. Les projets récents où l'addon BlendUp est déjà installé sont proposés. **Ajouter** permet de choisir la racine d'un autre projet BlendUp.
4. Lancer la mise à jour puis consulter le bilan. Rouvrir les éditeurs pour charger les nouveaux addons.

L'outil conserve les préférences Blender, l'état actif/inactif d'un addon déjà installé, `project.godot`, les autres plugins et les fichiers supplémentaires des projets. Une première installation de l'addon Blender l'active. L'addon Godot doit déjà être installé dans les projets sélectionnés ; sa mise à jour ne l'active pas s'il était désactivé.

Les fichiers remplacés, l'ancien exécutable, les préférences et les journaux sont sauvegardés dans `%LOCALAPPDATA%/BlendUp/update-backups/<date-identifiant>/`. En cas d'échec d'installation de l'addon Blender, ses fichiers et préférences sont restaurés. Une erreur Godot restaure les fichiers de ce projet. Une mise à jour partielle est annoncée comme telle ; les sauvegardes permettent de restaurer les composants individuellement.

## Construction

Construire l'application et son installateur NSIS, puis exécuter :

```powershell
python scripts/build_updater.py --installer apps/desktop/src-tauri/target/release/bundle/nsis/BlendUp_0.2.4_x64-setup.exe
```

`scripts/package_release.py` construit automatiquement ce second exécutable pour Windows et l'ajoute aux archives et aux empreintes. Le workflow de release le joint au brouillon GitHub. La version de l'exemple doit être remplacée lors de la préparation de la prochaine release.

Pour les essais automatiques, `/REQUEST="<fichier JSON>"` accepte `installDirectory`, `blenderPath`, `projectRoots` et un `backupDirectory` neuf. Ce mode doit être exécuté sur des profils et projets de test : il effectue les mêmes mutations que l'interface.
