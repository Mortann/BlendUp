# Compiler et installer BlendUp

BlendUp utilise Tauri 2. Il faut compiler chaque système sur le système correspondant : Windows pour les installateurs Windows, Linux pour les paquets Linux.

## Windows 10 ou 11

### Prérequis

1. Installe **Node.js LTS**.
2. Installe **Rust stable** avec `rustup` et la cible MSVC.
3. Installe **Microsoft C++ Build Tools**, charge de travail « Développement Desktop en C++ ».
4. Vérifie que **Microsoft Edge WebView2 Runtime** est présent. Il est normalement déjà installé sur Windows 10 récent et Windows 11.
5. Pour créer le MSI avec la cible `all`, active la fonctionnalité facultative Windows **VBSCRIPT** si l'outil WiX la réclame.

Référence : [prérequis officiels Tauri](https://v2.tauri.app/start/prerequisites/).

### Construire

Ouvre PowerShell à la racine du dépôt :

```powershell
npm.cmd install
npm.cmd test
npm.cmd run tauri:build
```

Sous PowerShell, `npm.cmd` évite le blocage de `npm.ps1` lorsque l'exécution des scripts est désactivée. Après l'installation de Rust et des outils C++, ouvre un nouveau terminal pour prendre en compte leur ajout au `PATH`.

Les installateurs sont générés dans :

```text
apps/desktop/src-tauri/target/release/bundle/msi/
apps/desktop/src-tauri/target/release/bundle/nsis/
```

Le fichier `*-setup.exe` (NSIS) est le plus simple à transmettre pour une première version. Le `.msi` convient mieux à un déploiement administré. Windows peut afficher un avertissement SmartScreen tant que l'application n'est pas signée avec un certificat de signature de code.

## Linux (Ubuntu/Debian)

### Prérequis

Installe Node.js LTS et Rust stable, puis les bibliothèques demandées par Tauri :

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Pour la création d'AppImage dans GitHub Actions, `patchelf` est également installé par le workflow.

### Construire

```bash
npm install
npm test
npm run tauri:build
```

Les paquets disponibles sont placés sous :

```text
apps/desktop/src-tauri/target/release/bundle/
```

Selon les outils présents sur la distribution, Tauri y produit notamment un `.deb`, un `.rpm` et/ou une `.AppImage`. Pour Ubuntu/Debian, installe le `.deb`. Pour un essai portable, rends l'AppImage exécutable puis lance-la :

```bash
chmod +x BlendUp_*.AppImage
./BlendUp_*.AppImage
```

## Développement sans installateur

Sous Windows (PowerShell) :

```powershell
npm.cmd run tauri:dev
```

Sous Linux :

```text
npm run tauri:dev
```

Cette commande lance l'application de bureau complète. `npm run dev` lance uniquement l'interface dans le navigateur ; les opérations sur les projets et les fichiers nécessitent Tauri.

## Add-on Blender

Le fichier distribuable est déjà présent dans `apps/blender-addon/blendup.zip`. Il doit accompagner chaque release. Le test complet avec Blender peut être lancé sous Windows avec :

```powershell
& "C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" --background --factory-startup --python apps/blender-addon/tests/blender_smoke.py -- apps/blender-addon
```
