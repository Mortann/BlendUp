"""Handler d'auto-export au save.

Quand l'utilisateur sauvegarde un `.blend` lie a un asset dont le mode d'export
est `auto`, on declenche l'export FBX. Les erreurs (validation bloquante,
echec d'export) sont journalisees mais n'interrompent jamais la sauvegarde.
"""

from __future__ import annotations

import os

import bpy
from bpy.app.handlers import persistent

from . import bpy_adapter
from .core import activity, assets, jsonio
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


@persistent
def thumbnail_on_save(_dummy):
    context = bpy.context
    scene = context.scene

    project_root, _project, asset, asset_file = bpy_adapter.resolve_current(scene)
    if not project_root or not asset or not asset_file:
        return

    asset_id = asset.get("id") or "asset"
    thumbnail_rel = os.path.join(".blendup", "thumbnails", f"{asset_id}.png")
    thumbnail_abs = os.path.join(project_root, thumbnail_rel)
    os.makedirs(os.path.dirname(thumbnail_abs), exist_ok=True)

    render = scene.render
    old_filepath = render.filepath
    old_x = render.resolution_x
    old_y = render.resolution_y
    old_percentage = render.resolution_percentage

    try:
        render.filepath = thumbnail_abs
        render.resolution_x = 512
        render.resolution_y = 320
        render.resolution_percentage = 100
        bpy.ops.render.opengl(write_still=True, view_context=False)
    except Exception as error:  # noqa: BLE001 - preview best effort
        print(f"[BlendUp] thumbnail ignore: {error}")
        return
    finally:
        render.filepath = old_filepath
        render.resolution_x = old_x
        render.resolution_y = old_y
        render.resolution_percentage = old_percentage

    asset.setdefault("paths", {})["thumbnail"] = thumbnail_rel.replace(os.sep, "/")
    asset["updatedAt"] = jsonio.iso_now()
    assets.save_asset(asset_file, asset)
    activity.append_activity(
        project_root,
        "Blender",
        "asset.thumbnail_updated",
        f"Visuel asset genere vers {thumbnail_rel.replace(os.sep, '/')}",
        asset_id,
    )


def register():
    if thumbnail_on_save not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(thumbnail_on_save)
    if auto_export_on_save not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(auto_export_on_save)


def unregister():
    if thumbnail_on_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(thumbnail_on_save)
    if auto_export_on_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(auto_export_on_save)
