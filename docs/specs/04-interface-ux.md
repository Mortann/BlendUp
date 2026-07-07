# Interface UX

BlendUp est maintenant une application reservee aux artistes et a la direction artistique.

L'interface ne propose plus de profil separe pour un autre metier. Toute la navigation, les textes et les actions sont penses pour :

- les artistes qui creent, organisent et corrigent les assets ;
- le Directeur artistique qui valide, rouvre et arbitre les assets ;
- le suivi de production necessaire au travail artistique.

## Principes

- L'ecran principal doit ouvrir directement sur le travail utile, pas sur une page marketing.
- Le vocabulaire doit rester comprehensible par une equipe artistique.
- Les informations techniques restent visibles seulement quand elles aident a produire ou verifier un asset.
- Les actions destructives ou engageantes doivent rester explicites.
- La validation finale appartient au Directeur artistique.

## Navigation Principale

La barre laterale contient :

- Dashboard ;
- Assets ;
- References ;
- Taches ;
- Nomenclature ;
- Equipe ;
- Problems ;
- Git ;
- Settings.

Il n'y a plus de bascule de vue. Le logo BlendUp reste le controle principal de repli/depli de la navigation.

## Dashboard

Le dashboard est une synthese artiste :

- tache ouverte la plus importante ;
- reprise rapide des derniers assets ;
- acces aux references ;
- alertes bloquantes avant validation.

Il doit aider a reprendre le travail sans exposer un inventaire technique dense.

## Assets

La page Assets est l'experience centrale.

Elle fonctionne comme un explorateur artistique :

- dossiers racines du projet ;
- dossiers recents ;
- favoris ;
- filtres par etat artiste ;
- recherche globale ;
- creation de dossiers et d'assets ;
- renommage, duplication, deplacement et suppression ;
- visualisation de vignettes, rendus, textures et FBX exportes quand disponibles.

La fiche detail s'ouvre en overlay centre et affiche :

- vignette ou visuel de type ;
- etat artiste ;
- actions Blender et visualisation ;
- favoris, renommage, suppression ;
- equipe ;
- notes artiste ;
- contenu de l'asset ;
- variantes ;
- LODs ;
- checklist ;
- points a corriger ;
- historique.

## Etats Artiste

Les etats visibles sont :

- A faire ;
- En cours ;
- A valider ;
- A retravailler ;
- Valide.

Les personnes associees peuvent faire avancer un asset jusqu'a `A valider`.

Seul le Directeur artistique peut :

- passer un asset a `Valide` ;
- rouvrir un asset deja valide.

Ce verrou existe dans l'interface et dans la commande native `update_asset_status`.

## Equipe

Les roles locaux disponibles sont :

- Artiste ;
- Directeur artistique ;
- Owner.

L'Owner gere les comptes locaux. Le Directeur artistique est le role de validation.

## References

La page References organise :

- les dossiers de references ;
- les themes visuels ;
- les references associees a un asset ;
- les references globales.

Elle reste orientee direction visuelle.

## Nomenclature

La page Nomenclature permet de regler :

- les types d'assets ;
- les prefixes ;
- les dossiers associes ;
- les suffixes Blender ;
- les fragments interdits.

Le but est d'aider les artistes a nommer correctement sans devoir connaitre le modele interne.

## Problems

La page Problems liste les alertes utiles a la production artistique :

- fichiers manquants ;
- exports absents ;
- references incompletes ;
- contraintes de validation ;
- problemes remontes par les integrations.

Les actions doivent rester simples et contextualisees.

## Git

La page Git est presente comme suivi de sauvegarde et synchronisation projet.

Elle ne doit pas devenir un client Git complet. Elle affiche un etat lisible et des actions simples de demande de synchronisation.

## Etat D'Implementation

Implementation actuelle :

- navigation unique artiste ;
- suppression de la bascule de profil ;
- equipe locale limitee a Artiste, Directeur artistique et Owner ;
- fiche asset centre artiste ;
- validation protegee par role Directeur artistique ;
- vue Git simplifiee ;
- composants Assets decoupes dans `apps/desktop/src/views/assets/`.
