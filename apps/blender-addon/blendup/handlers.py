"""Handler d'auto-export au save.

Quand l'utilisateur sauvegarde un `.blend` lie a un asset dont le mode d'export
est `auto`, on declenche l'export FBX. Les erreurs (validation bloquante,
echec d'export) sont journalisees mais n'interrompent jamais la sauvegarde.
"""

from __future__ import annotations

import bpy
from bpy.app.handlers import persistent

from . import bpy_adapter
from .core import assets
from .ops.export_ops import export_asset_for_scene


@persistent
def auto_export_on_save(_dummy):
    context = bpy.context
    scene = context.scene

    _root, _project, asset, _file = bpy_adapter.resolve_current(scene)
    if not asset:
        return
    if assets.get_export_mode(asset) != assets.EXPORT_MODE_AUTO:
        return

    success, message = export_asset_for_scene(context, scene, validate_first=True)
    prefix = "[BlendUp] auto-export" + (" OK" if success else " ignore")
    print(f"{prefix}: {message}")


def register():
    if auto_export_on_save not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(auto_export_on_save)


def unregister():
    if auto_export_on_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(auto_export_on_save)
