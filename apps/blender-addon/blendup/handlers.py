from __future__ import annotations

import os
import json
import time
from pathlib import Path

import bpy
from bpy.app.handlers import persistent

from .core.bridge import acknowledge_open, clear_open_request, read_open_request, requested_blend_file, session_directory
from .core.project import find_project_root
from .ops.export_ops import current_asset, export_current
from .prefs import preferences
from .blender_uv import check_and_record, prepare_before_save, project_policy, uv_validation_ignored
from .blender_export import preserved_context


_exporting = False
_last_open_request_id = ""
_BRIDGE_INTERVAL = 0.25
_preparing = False
_preparation_warnings = []
_last_session_update = 0


def background_task():
    return os.environ.get("BLENDUP_BACKGROUND_TASK") == "1" or os.environ.get("BLENDUP_LOD_GENERATION") == "1"


@persistent
def prepare_on_save(filepath):
    global _preparing, _preparation_warnings
    if _preparing or background_task(): return
    _preparation_warnings = []
    try:
        from .core.project import locate_asset
        path = filepath if isinstance(filepath, str) and filepath else bpy.data.filepath
        if not path: return
        asset = locate_asset(path)
        policy = project_policy(asset.project.root)
    except (ValueError, OSError):
        # Ordinary Blender files outside Art are not managed by BlendUp.
        return
    try:
        _preparing = True
        with preserved_context(bpy.context):
            _preparation_warnings = prepare_before_save(policy)
    except Exception as error:
        import traceback
        traceback.print_exc()
        _preparation_warnings = [f"Préparation automatique impossible : {error}"]
        print(f"[BlendUp] {_preparation_warnings[0]}")
    finally:
        _preparing = False


@persistent
def export_after_save(_filepath):
    with preserved_context(bpy.context):
        _export_after_save()


def _export_after_save():
    global _exporting
    if background_task():
        return
    prefs = preferences()
    if _exporting or not bpy.data.filepath:
        return
    _exporting = True
    try:
        asset = current_asset()
        policy = project_policy(asset.project.root)
        report = None
        if policy.validate_uvs and not uv_validation_ignored(asset.project.root, asset.source):
            report = check_and_record(asset.project.root, asset.source, source_is_saved=True)
            if _preparation_warnings:
                from .blender_uv import write_report
                report["preparationWarnings"] = list(_preparation_warnings)
                write_report(asset.project.root, asset.source, report, unsaved_changes=False)
            print(f"[BlendUp] Score UV : {report['score']}/100")
        if not prefs or not prefs.auto_export or asset.project.engine == "none":
            return
        asset = export_current(uv_report=report)
        print(f"[BlendUp] Export automatique : {asset.output_relative}")
    except Exception as error:
        print(f"[BlendUp] Échec de l'export automatique : {error}")
    finally:
        _exporting = False
        root = find_project_root(bpy.data.filepath)
        if root:
            try:
                from .core.library import publish_index
                publish_index(root)
            except Exception as error:
                print(f"[BlendUp] Actualisation de la bibliothèque impossible : {error}")


@persistent
def open_requested_blend_file():
    """Ouvre dans cette session le fichier demandé par l'application BlendUp."""
    global _last_open_request_id, _last_session_update
    if background_task(): return _BRIDGE_INTERVAL
    root = find_project_root(bpy.data.filepath) if bpy.data.filepath else None
    directory = session_directory() / str(os.getpid())
    # Background exporters must never advertise themselves as interactive editors.
    if not bpy.app.background and time.monotonic() - _last_session_update > 1:
        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / "session.tmp"
        temporary.write_text(json.dumps({"processId": os.getpid(), "projectRoot": str(root) if root else "", "updatedAtMs": int(time.time() * 1000)}), encoding="utf-8")
        temporary.replace(directory / "session.json")
        _last_session_update = time.monotonic()
    request = read_open_request(root or "", directory)
    if request:
        root = Path(request.project_root).resolve()
        if not (root / ".blendup/project.json").is_file():
            acknowledge_open(root, request.id, False, directory=directory)
            clear_open_request(root, request.id, directory)
            return _BRIDGE_INTERVAL
    else:
        directory = None
        request = read_open_request(root) if root else None
    if request is None or request.id == _last_open_request_id:
        return _BRIDGE_INTERVAL

    _last_open_request_id = request.id
    if request.expired:
        acknowledge_open(root, request.id, False, directory=directory)
        clear_open_request(root, request.id, directory)
        return _BRIDGE_INTERVAL
    try:
        target = requested_blend_file(root, request)
    except ValueError as error:
        print(f"[BlendUp] Demande d'ouverture refusée : {error}")
        acknowledge_open(root, request.id, False, directory=directory)
        clear_open_request(root, request.id, directory)
        return _BRIDGE_INTERVAL

    current = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    try:
        if target != current:
            if bpy.app.background:
                if bpy.data.is_dirty:
                    raise ValueError("Une confirmation de sauvegarde nécessite une fenêtre Blender.")
                result = bpy.ops.wm.open_mainfile(filepath=str(target))
            else:
                # INVOKE runs Blender's Save / Don't Save / Cancel flow, including Save As.
                window = bpy.context.window or next(iter(bpy.context.window_manager.windows), None)
                with bpy.context.temp_override(window=window):
                    result = bpy.ops.wm.open_mainfile("INVOKE_DEFAULT", filepath=str(target), display_file_selector=False)
            accepted = bool(result & {"FINISHED", "RUNNING_MODAL", "INTERFACE"})
        else:
            accepted = True
        acknowledge_open(root, request.id, accepted, process_id=os.getpid(), directory=directory)
    except Exception as error:
        print(f"[BlendUp] Ouverture impossible : {error}")
        acknowledge_open(root, request.id, False, process_id=os.getpid(), directory=directory)
    clear_open_request(root, request.id, directory)
    return _BRIDGE_INTERVAL


def register_handlers():
    if prepare_on_save not in bpy.app.handlers.save_pre:
        bpy.app.handlers.save_pre.append(prepare_on_save)
    if export_after_save not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(export_after_save)
    if not bpy.app.timers.is_registered(open_requested_blend_file):
        bpy.app.timers.register(open_requested_blend_file, first_interval=0.15, persistent=True)


def unregister_handlers():
    directory = session_directory() / str(os.getpid())
    try:
        for name in ("session.json", "session.tmp", "open-request.json", "open-ack.json", "open-ack.tmp"):
            (directory / name).unlink(missing_ok=True)
        directory.rmdir()
    except OSError:
        pass
    if prepare_on_save in bpy.app.handlers.save_pre:
        bpy.app.handlers.save_pre.remove(prepare_on_save)
    if export_after_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(export_after_save)
    if bpy.app.timers.is_registered(open_requested_blend_file):
        bpy.app.timers.unregister(open_requested_blend_file)
