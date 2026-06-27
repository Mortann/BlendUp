"""Cœur logique de l'add-on BlendUp.

Ces modules ne dependent PAS de `bpy`. Ils peuvent donc etre importes et
testes en dehors de Blender (voir `apps/blender-addon/tests`). Toute la logique
qui touche au systeme de fichiers `.blendup` (detection de projet, lecture/
ecriture des fiches assets, nomenclature, validation) vit ici.

La couche Blender (`ops`, `ui`, `prefs`, `handlers`) se contente de collecter
des donnees depuis `bpy` et d'appeler ces fonctions.
"""
