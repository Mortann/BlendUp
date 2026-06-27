"""Operateurs de liaison Blender <-> fiche asset BlendUp."""

from __future__ import annotations

import webbrowser

import bpy
from bpy.props import EnumProperty
from bpy.types import Operator

from .. import bpy_adapter, prefs
from ..core import assets, links, project


def _asset_items(self, context):
    """Liste dynamique des assets du projet courant pour le menu de liaison."""
    items = []
    scene = context.scene
    blend_path = bpy_adapter.current_blend_path()
    if not blend_path:
        return [("", "Fichier non sauvegarde", "")]
    root = project.find_project_root(blend_path)
    if not root:
        return [("", "Aucun projet BlendUp", "")]
    for asset_file in assets.iter_asset_files(root):
        try:
            asset = assets.load_asset(asset_file)
        except (OSError, ValueError):
            continue
        asset_id = asset.get("id") or ""
        label = asset.get("displayName") or asset_id
        items.append((asset_id, label, asset.get("type") or ""))
    return items or [("", "Aucun asset", "")]


class BLENDUP_OT_detect_asset(Operator):
    bl_idname = "blendup.detect_asset"
    bl_label = "Detecter l'asset"
    bl_description = "Retrouver le projet et la fiche asset lies a ce fichier .blend"
    bl_options = {"REGISTER"}

    def execute(self, context):
        project_root, _project, asset, _file = bpy_adapter.resolve_current(context.scene)
        if not project_root:
            self.report({"WARNING"}, "Aucun projet BlendUp trouve pour ce fichier.")
            return {"CANCELLED"}
        if not asset:
            self.report({"WARNING"}, "Projet trouve, mais aucune fiche asset liee.")
            return {"CANCELLED"}
        self.report({"INFO"}, f"Asset lie: {asset.get('displayName')}")
        return {"FINISHED"}


class BLENDUP_OT_link_to_asset(Operator):
    bl_idname = "blendup.link_to_asset"
    bl_label = "Lier a un asset"
    bl_description = "Associer ce fichier .blend a une fiche asset du projet"
    bl_options = {"REGISTER", "UNDO"}

    asset_id: EnumProperty(name="Asset", items=_asset_items)

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

    def draw(self, context):
        self.layout.prop(self, "asset_id")

    def execute(self, context):
        if not self.asset_id:
            self.report({"ERROR"}, "Aucun asset selectionne.")
            return {"CANCELLED"}
        bpy_adapter.set_scene_asset_id(context.scene, self.asset_id)
        self.report({"INFO"}, f"Scene liee a l'asset {self.asset_id}.")
        return {"FINISHED"}


class BLENDUP_OT_open_card(Operator):
    bl_idname = "blendup.open_card"
    bl_label = "Ouvrir la fiche dans BlendUp"
    bl_description = "Demander a l'application BlendUp d'ouvrir la fiche de cet asset"
    bl_options = {"REGISTER"}

    def execute(self, context):
        project_root, _project, asset, _file = bpy_adapter.resolve_current(context.scene)
        if not project_root or not asset:
            self.report({"ERROR"}, "Aucune fiche asset liee a ouvrir.")
            return {"CANCELLED"}

        asset_id = asset.get("id")
        links.write_open_request(project_root, asset_id)

        if prefs.get_prefs(context).enable_deep_link:
            try:
                webbrowser.open(links.deep_link(asset_id))
            except Exception:  # noqa: BLE001 - le lien profond est best-effort
                pass

        self.report(
            {"INFO"},
            "Requete d'ouverture envoyee a BlendUp (.blendup/temp/open-request.json).",
        )
        return {"FINISHED"}


classes = (
    BLENDUP_OT_detect_asset,
    BLENDUP_OT_link_to_asset,
    BLENDUP_OT_open_card,
)
