# Installation Et Verification Locale

## Objectif

Ce document garde la procedure de remise en route locale de BlendUp.

Il doit etre mis a jour quand les prerequis, les commandes ou les checks changent.

## Prerequis Windows

- Node.js et npm.
- Rust installe via rustup.
- Visual Studio 2022 avec les outils C++.
- Windows SDK avec les librairies C, dont `kernel32.lib`.
- WebView2.

## Installation Npm

Depuis la racine du depot :

```powershell
npm install
```

Le depot utilise un workspace npm racine avec l'application desktop dans `apps/desktop`.

## Verification Frontend

Depuis la racine du depot :

```powershell
npm run typecheck
npm run build
```

Pour lancer le serveur local :

```powershell
npm run dev
```

Adresse locale attendue :

```text
http://127.0.0.1:5173/
```

## Verification Tauri / Rust

Depuis `apps/desktop/src-tauri` :

```powershell
cargo check
```

Si le terminal ne voit pas encore `cargo` juste apres l'installation de Rust, ouvrir un nouveau terminal.

Dans un terminal deja ouvert, ajouter temporairement le dossier Cargo au `PATH` :

```powershell
$env:PATH = "C:\Users\morit\.cargo\bin;$env:PATH"
```

Si `cargo check` trouve `link.exe` mais echoue sur `kernel32.lib`, installer ou reparer le Windows SDK.

## Verification Tauri Info

Depuis la racine du depot :

```powershell
npm --workspace @blendup/desktop run tauri -- info
```

L'environnement attendu doit afficher :

- WebView2 OK ;
- MSVC OK ;
- rustc OK ;
- cargo OK ;
- rustup OK ;
- Tauri 2 detecte ;
- React + Vite detectes.

## Settings Locaux

L'application native stocke les preferences utilisateur hors Git.

Sur Windows :

```text
%APPDATA%/BlendUp/user-settings.json
```

Ce fichier peut contenir :

- dernier projet ouvert ;
- projets recents ;
- chemin Blender ;
- chemin Unity ;
- chemin PureRef.

## Ouverture De Projet

Dans l'application native, l'ouverture de projet utilise le selecteur de dossier Tauri.

Fallback utile :

- saisir ou coller un chemin dans le champ projet ;
- cliquer sur `Ouvrir ce chemin`.

Dans le navigateur de developpement seul, le selecteur natif n'est pas disponible.

## Detection Des Outils

La vue `Settings` affiche la disponibilite des outils locaux.

Outils detectes actuellement :

- Blender ;
- Unity ;
- PureRef.

La detection peut remplir automatiquement les chemins absents au demarrage quand un outil est trouve.

## Etat Verifie Le 2026-06-27

- `npm install` : OK, 95 packages ajoutes, 0 vulnerabilite.
- `npm run typecheck` : OK.
- `npm run build` : OK.
- `cargo check` dans `apps/desktop/src-tauri` : OK.
- `tauri info` : OK apres ajout temporaire de `C:\Users\morit\.cargo\bin` au `PATH` du terminal Codex.
- `npm run dev` : OK, serveur Vite disponible sur `http://127.0.0.1:5173/`.
- Requete locale sur `http://127.0.0.1:5173/` : status 200.

## Remise En Route Effectuee Le 2026-06-27

- Installation des dependances npm.
- Installation de Rust via rustup `1.29.0`.
- Toolchain Rust installee : `rustc 1.96.0`, `cargo 1.96.0`.
- Installation du Windows SDK `10.0.18362.0` pour fournir `kernel32.lib`.

Note : le projet cible toujours Unity 6.0 avec reference minimale `6000.0.77f1`. Le projet test actuel utilise Unity `6000.3.5f2`.
