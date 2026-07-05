"""Add-on Blender BlendUp.

Pont entre Blender et l'application BlendUp pour le pipeline V1 :
- detection du projet BlendUp et de la fiche asset liee au .blend courant ;
- panneau BlendUp dans la sidebar de la vue 3D ;
- export FBX manuel et auto-export au save (mode par asset) ;
- validation de base avant export ;
- creation depuis templates simples ;
- demande d'ouverture de la fiche dans l'application.

La logique metier vit dans `blendup.core` (sans `bpy`, donc testable).
"""

from __future__ import annotations

bl_info = {
    "name": "BlendUp",
    "author": "BlendUp",
    "version": (0, 1, 2),
    "blender": (4, 0, 0),
    "location": "Vue 3D > Sidebar (N) > BlendUp",
    "description": "Pont Blender <-> BlendUp : export FBX, validation, liaison assets.",
    "category": "Pipeline",
}

# Les sous-modules qui importent `bpy` ne sont charges qu'au moment du register.
# Cela garde `import blendup.core.*` utilisable hors de Blender (tests).


def register():
    from . import handlers, ops, prefs, ui

    prefs.register()
    ops.register()
    ui.register()
    handlers.register()


def unregister():
    from . import handlers, ops, prefs, ui

    handlers.unregister()
    ui.unregister()
    ops.unregister()
    prefs.unregister()


if __name__ == "__main__":
    register()
