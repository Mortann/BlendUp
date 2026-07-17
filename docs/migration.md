# Migration depuis l'ancienne version

BlendUp sait ouvrir les anciens fichiers `.blendup/project.json` de schéma 1. Un projet sans moteur explicite est interprété comme un projet Unity.

Les anciennes fiches assets, tâches, règles de nomenclature, journaux d'activité et données Git ne sont plus lues. Les assets viennent directement des fichiers `.blend` présents sous le chemin `artRoot`.

Lors du premier changement de moteur, la configuration du projet est enregistrée au schéma 2. Les anciens dossiers sont conservés afin de ne supprimer aucune donnée de jeu.

