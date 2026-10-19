"""Collections d'assets compactes et affichage LOW/HIGH, sans toucher aux meshes."""
from __future__ import annotations

import bpy

from .core.bake import PAIR_KEY, ROLE_KEY, ROLES, PREVIEW_LAYERS_KEY, bake_groups, object_role


def asset_roots(scene):
    return [collection for collection in scene.collection.children_recursive
            if collection.get("blendup_bake_root")]


def compact_asset_roots(context, keys=None):
    """Flatten only BlendUp role collections; preserve custom/shared children."""
    keys = {key.casefold() for key in keys} if keys is not None else None
    plans = []
    for root in asset_roots(context.scene):
        key = str(root["blendup_bake_root"])
        if keys is not None and key.casefold() not in keys:
            continue
        roles = [c for c in root.children if str(c.get(PAIR_KEY, "")).casefold() == key.casefold()
                 and c.get(ROLE_KEY) in ROLES]
        # Shared child collections and custom subtrees keep their structure.
        if any(c.users > 1 or c.children or c.library for c in roles):
            raise ValueError(f"{key} : une collection LOW/HIGH/CAGE est partagée, liée ou contient des sous-collections. Sépare-la avant de simplifier.")
        if not root.is_editable or any(not obj.is_editable for c in roles for obj in c.objects):
            raise ValueError(f"{key} : rends les collections et objets liés locaux avant de simplifier.")
        visibility = [(layer, obj, not obj.visible_get(view_layer=layer))
                      for layer in context.scene.view_layers for c in roles for obj in c.objects]
        plans.append((root, key, roles, visibility))

    for root, key, roles, visibility in plans:
        for collection in roles:
            for obj in list(collection.objects):
                # Explicit roles keep detection stable after removing containers.
                pair, role = object_role(obj)
                obj[PAIR_KEY], obj[ROLE_KEY] = pair, role
                if obj.name not in root.objects:
                    root.objects.link(obj)
                if collection.hide_render:
                    obj.hide_render = True
                if collection.hide_select:
                    obj.hide_select = True
                collection.objects.unlink(obj)
            # These are empty, unshared containers created by BlendUp.
            bpy.data.collections.remove(collection)
        root.name = key
        root["blendup_asset_layout"] = "COMPACT"
        for layer in context.scene.view_layers:
            layer.update()
        for layer, obj, hidden in visibility:
            if obj.name in layer.objects:
                obj.hide_set(hidden, view_layer=layer)
    return len(plans)


def show_asset_role(context, key, role="LOW"):
    if context.mode != "OBJECT":
        raise ValueError("Passe en mode Objet pour changer de version.")
    group = bake_groups(context.scene.objects).get(key.casefold())
    if not group or role not in ROLES or not group[role]:
        raise ValueError(f"{key} : aucune version {role}.")
    targets = sorted(group[role], key=lambda obj: obj.name.casefold())
    for obj in targets:
        if obj.name not in context.view_layer.objects:
            raise ValueError(f"{obj.name} : active sa collection dans le View Layer avant de l'afficher.")
    snapshots = [(obj, obj.hide_viewport, obj.hide_get()) for current_role in ROLES for obj in group[current_role]
                 if obj.name in context.view_layer.objects]
    exportable_lows = {obj for obj in group["LOW"] if obj.name in context.view_layer.objects
                       and obj.visible_get(view_layer=context.view_layer)}
    try:
        for current_role in ROLES:
            for obj in group[current_role]:
                if obj.name not in context.view_layer.objects:
                    continue
                if current_role == role:
                    obj.hide_viewport = False
                obj.hide_set(current_role != role)
        context.view_layer.update()
        if not all(obj.visible_get(view_layer=context.view_layer) for obj in targets):
            raise ValueError(f"{key} : affiche sa collection parente pour voir la version {role}.")
    except Exception:
        for obj, disabled, hidden in snapshots:
            obj.hide_viewport = disabled
            obj.hide_set(hidden)
        context.view_layer.update()
        raise
    for low in group["LOW"]:
        layers = set(low.get(PREVIEW_LAYERS_KEY, ()))
        if role == "LOW":
            layers.discard(context.view_layer.name)
        elif low in exportable_lows:
            layers.add(context.view_layer.name)
        if layers:
            low[PREVIEW_LAYERS_KEY] = sorted(layers)
        elif PREVIEW_LAYERS_KEY in low:
            del low[PREVIEW_LAYERS_KEY]
    for obj in context.view_layer.objects:
        obj.select_set(False)
    for obj in targets:
        obj.select_set(True)
    context.view_layer.objects.active = targets[0]
    return group
