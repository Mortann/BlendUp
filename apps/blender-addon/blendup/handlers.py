from __future__ import annotations

import bpy
from bpy.app.handlers import persistent

from .ops.export_ops import export_current
from .prefs import preferences


_exporting = False


@persistent
def export_after_save(_filepath):
    global _exporting
    prefs = preferences()
    if _exporting or not prefs or not prefs.auto_export or not bpy.data.filepath:
        return
    _exporting = True
    try:
        asset = export_current()
        print(f"[BlendUp] Export automatique : {asset.output_relative}")
    except Exception as error:
        print(f"[BlendUp] Échec de l'export automatique : {error}")
    finally:
        _exporting = False


def register_handlers():
    if export_after_save not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(export_after_save)


def unregister_handlers():
    if export_after_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(export_after_save)
