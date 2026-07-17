# Publier une release GitHub

Le dépôt contient `.github/workflows/release.yml`. À chaque tag `v*`, GitHub Actions :

1. vérifie les types, le cœur Blender et le backend Rust ;
2. construit BlendUp sur Windows et Ubuntu ;
3. crée une release GitHub en brouillon ;
4. joint les installateurs Windows et Linux.

## Checklist

1. Choisir la version, par exemple `0.1.2`.
2. Mettre la même version dans `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml` et `apps/desktop/src-tauri/tauri.conf.json`.
3. Mettre à jour la version de l'add-on dans `apps/blender-addon/blendup/__init__.py` si celui-ci a changé, puis reconstruire `blendup.zip`.
4. Exécuter localement `npm test` et `npm run tauri:build`.
5. Depuis la branche `dev`, envoyer les changements, les intégrer dans `master`, puis créer et envoyer le tag :

```text
git push origin dev
git switch master
git merge dev
git push origin master
git tag v0.1.2
git push origin v0.1.2
```

6. Dans l'onglet **Actions**, attendre la réussite des deux plateformes.
7. Ouvrir **Releases**, télécharger l'installateur Windows, le paquet Linux `.deb` et l'AppImage, puis les tester.
8. Vérifier que `blendup.zip` a bien été joint automatiquement à la release.
9. Compléter les notes et publier le brouillon.

Le jeton `GITHUB_TOKEN` fourni automatiquement par GitHub suffit au workflow. Le dépôt doit autoriser les workflows à écrire dans le contenu ; le fichier demande explicitement la permission `contents: write`.

Références : [pipeline GitHub officiel de Tauri](https://v2.tauri.app/distribute/pipelines/github/) et [gestion des releases GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
