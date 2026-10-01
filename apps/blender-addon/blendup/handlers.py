from __future__ import annotations

import os
from pathlib import Path

import bpy
from bpy.app.handlers import persistent

from .core.bridge import acknowledge_open, clear_open_request, read_open_request, requested_blend_file
from .core.project import find_project_root
from .ops.export_ops import current_asset, export_current
from .prefs import preferences


_exporting = False
_last_open_request_id = ""
_BRIDGE_INTERVAL = 0.25


@persistent
def export_after_save(_filepath):
    global _exporting
    if os.environ.get("BLENDUP_LOD_GENERATION") == "1":
        return
    prefs = preferences()
    if _exporting or not prefs or not prefs.auto_export or not bpy.data.filepath:
        return
    _exporting = True
    try:
        if current_asset().project.engine == "none":
            return
        asset = export_current()
        print(f"[BlendUp] Export automatique : {asset.output_relative}")
    except Exception as error:
        print(f"[BlendUp] Échec de l'export automatique : {error}")
    finally:
        _exporting = False


@persistent
def open_requested_blend_file():
    """Ouvre dans cette session le fichier demandé par l'application BlendUp."""
    global _last_open_request_id
    if not bpy.data.filepath:
        return _BRIDGE_INTERVAL
    root = find_project_root(bpy.data.filepath)
    if root is None:
        return _BRIDGE_INTERVAL
    request = read_open_request(root)
    if request is None or request.id == _last_open_request_id:
        return _BRIDGE_INTERVAL

    _last_open_request_id = request.id
    if request.expired:
        acknowledge_open(root, request.id, False)
        clear_open_request(root, request.id)
        return _BRIDGE_INTERVAL
    try:
        target = requested_blend_file(root, request)
    except ValueError as error:
        print(f"[BlendUp] Demande d'ouverture refusée : {error}")
        acknowledge_open(root, request.id, False)
        clear_open_request(root, request.id)
        return _BRIDGE_INTERVAL

    current = Path(bpy.data.filepath).resolve()
    if target != current and bpy.data.is_dirty:
        print("[BlendUp] Le fichier courant contient des changements non enregistrés ; ouverture dans une nouvelle session.")
        acknowledge_open(root, request.id, False)
        clear_open_request(root, request.id)
        return _BRIDGE_INTERVAL

    acknowledge_open(root, request.id, True)
    clear_open_request(root, request.id)
    if target != current:
        bpy.ops.wm.open_mainfile(filepath=str(target))
    return _BRIDGE_INTERVAL


def register_handlers():
    if export_after_save not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(export_after_save)
    if not bpy.app.timers.is_registered(open_requested_blend_file):
        bpy.app.timers.register(open_requested_blend_file, first_interval=0.15, persistent=True)


def unregister_handlers():
    if export_after_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(export_after_save)
    if bpy.app.timers.is_registered(open_requested_blend_file):
        bpy.app.timers.unregister(open_requested_blend_file)
