# Publier une release GitHub

Le dépôt contient `.github/workflows/release.yml`. À chaque tag `v*`, GitHub Actions :

1. vérifie la concordance du tag et des versions, les types, le cœur Blender et le backend Rust ;
2. crée ou reprend un seul brouillon avant les builds et refuse de modifier une release déjà publiée ;
3. construit BlendUp sur Windows et Ubuntu ;
4. joint les installateurs Windows et Linux, les extensions Blender/Godot et les empreintes SHA-256 ;
5. conserve les archives sources et les fichiers de publication dans les artefacts Actions.

## Préparer les fichiers localement

Python 3.10 ou plus récent est nécessaire pour préparer les archives. Le script utilise uniquement la bibliothèque standard.

```powershell
npm run release:check
npm test
npm --workspace @blendup/desktop run tauri:build -- --bundles nsis
npm run release:package
```

Sur le poste de développement équipé de `.dev-tools`, utiliser son lanceur pour disposer des outils locaux sans modifier la politique PowerShell :

```powershell
.\.dev-tools\Start-BlendUp.cmd run release:check
.\.dev-tools\Start-BlendUp.cmd test
.\.dev-tools\Start-BlendUp.cmd --workspace @blendup/desktop run tauri:build -- --bundles nsis
.\.dev-tools\Start-BlendUp.cmd run release:package
```

Les fichiers sont placés dans `release/v0.2.0/`, accompagnés de l'archive globale `release/BlendUp-v0.2.0-release-windows.zip`. Les archives sources incluent le contenu actuel du dépôt, y compris les nouveaux fichiers non ignorés et les modifications non commitées. Les dépendances, caches, outils locaux et sorties de compilation sont exclus.

Le script exige un installateur déjà construit pour la plateforme courante. Les paquets Linux doivent être construits sous Linux, soit localement avec `npm --workspace @blendup/desktop run tauri:build -- --bundles deb,appimage`, soit avec le workflow GitHub. Ils ne sont pas produits par une compilation Windows.

Pour reconstruire uniquement les deux extensions : `python scripts/package_release.py --addons-only`.

## Checklist

1. Choisir la version, par exemple `0.2.0`.
2. Mettre la même version dans `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml` et `apps/desktop/src-tauri/tauri.conf.json`, puis actualiser les lockfiles (`npm install --package-lock-only` et `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`).
3. Si l'extension Blender change, maintenir la même version interne dans `apps/blender-addon/blendup/__init__.py` et `blender_manifest.toml`. Cette version peut différer de celle de l'application. Ajouter les notes dans `docs/releases/v0.2.0.md`.
4. Exécuter les commandes de préparation ci-dessus et vérifier les fichiers générés.
5. Enregistrer tous les changements de la version dans un commit, y compris les nouveaux fichiers. Vérifier `git status` avant d'envoyer la branche `dev`, puis l'intégrer dans `master` et créer le tag sur ce commit :

```text
git push origin dev
git switch master
git merge dev
git push origin master
git tag v0.2.0
git push origin v0.2.0
```

6. Dans l'onglet **Actions**, attendre la réussite des deux plateformes.
7. Ouvrir **Releases**, télécharger l'installateur Windows, le paquet Linux `.deb` et l'AppImage, puis les tester.
8. Vérifier les extensions `blendup.zip` et `blendup-godot.zip` et les fichiers `SHA256SUMS-windows.txt` / `SHA256SUMS-linux.txt` joints à la release.
9. Compléter les notes et publier le brouillon.

Le jeton `GITHUB_TOKEN` fourni automatiquement par GitHub suffit au workflow. Le dépôt doit autoriser les workflows à écrire dans le contenu ; le fichier demande explicitement la permission `contents: write`.

GitHub génère automatiquement **Source code (zip)** et **Source code (tar.gz)** à partir du commit du tag. Les archives `*-source` préparées localement sont utiles pour transmettre le projet ; elles ne remplacent pas l'envoi des changements dans le dépôt.

Références : [pipeline GitHub officiel de Tauri](https://v2.tauri.app/distribute/pipelines/github/) et [gestion des releases GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
