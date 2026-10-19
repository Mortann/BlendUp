"""Collections d'assets compactes et affichage LOW/HIGH, sans toucher aux meshes."""
from __future__ import annotations

import bpy

from .core.bake import PAIR_KEY, ROLE_KEY, ROLES, PREVIEW_LAYERS_KEY, bake_groups, object_role
from .core.bake import ASSET_KEY
from mathutils import Matrix


def asset_container(scene, key):
    return next((o for o in scene.objects if str(o.get(ASSET_KEY, "")).casefold() == key.casefold()), None)


def parent_signature(obj):
    return obj.parent, obj.parent_type, obj.parent_bone, tuple(obj.parent_vertices)


def organize_asset(context, key, low, highs):
    """Native, foldable Empty. Identity insertion keeps local animation channels."""
    group = bake_groups(context.scene.objects).get(key.casefold(), {})
    members = list(dict.fromkeys([low, *highs, *group.get("LOW", []), *group.get("HIGH", []), *group.get("CAGE", [])]))
    container = asset_container(context.scene, key)
    newcomers = [o for o in members if o.parent != container or container is None]
    signature = parent_signature(container or low)
    if signature[1] not in {"OBJECT", "BONE"} or any(parent_signature(o) != signature for o in newcomers):
        raise ValueError(f"{key} : les composants doivent avoir le même parent (et le même os). Aligne leurs parents avant de les regrouper.")
    if any(not o.is_editable for o in members):
        raise ValueError("Rends les objets liés locaux avant de les regrouper.")
    legacy = next((c for c in asset_roots(context.scene) if str(c["blendup_bake_root"]).casefold() == key.casefold()), None)
    if legacy and (legacy.users > 1 or any(o not in members for o in legacy.all_objects)
                   or any(c.get(ROLE_KEY) not in ROLES for c in legacy.children)):
        raise ValueError(f"{key} : la collection de bake est partagée ou contient d'autres objets. Sépare-les avant la conversion.")
    # Preflight first; the legacy converter also rejects shared/custom subtrees.
    compact_asset_roots(context, [key])
    snapshots = [(layer, o, not o.visible_get(view_layer=layer)) for layer in context.scene.view_layers for o in members]
    if legacy:
        parents = [c for c in [context.scene.collection, *context.scene.collection.children_recursive] if legacy.name in c.children]
        destination = parents[0]
    else:
        destination = next(iter(low.users_collection), context.scene.collection)
    if container is None:
        container = bpy.data.objects.new(key + " · Asset", None)
        container[ASSET_KEY] = key
        container.empty_display_type = "CUBE"
        container.empty_display_size = 0.05
        container.parent, container.parent_type, container.parent_bone = signature[:3]
        container.matrix_parent_inverse = Matrix.Identity(4)
        container.matrix_basis = Matrix.Identity(4)
        container.lock_location = container.lock_rotation = container.lock_scale = (True, True, True)
        destination.objects.link(container)
    for role, objects in (("LOW", [low]), ("HIGH", highs)):
        for obj in objects:
            obj[ROLE_KEY], obj[PAIR_KEY] = role, key
    for obj in members:
        if obj in newcomers:
            inverse, basis = obj.matrix_parent_inverse.copy(), obj.matrix_basis.copy()
            obj.parent, obj.parent_type, obj.parent_bone = container, "OBJECT", ""
            obj.matrix_parent_inverse, obj.matrix_basis = inverse, basis
        old_collections = list(obj.users_collection)
        if obj.name not in destination.objects:
            destination.objects.link(obj)
        if legacy:
            if legacy.hide_render:
                obj.hide_render = True
            if legacy.hide_select:
                obj.hide_select = True
        for previous in old_collections:
            if previous != destination:
                previous.objects.unlink(obj)
    if legacy:
        bpy.data.collections.remove(legacy)
    for layer in context.scene.view_layers:
        layer.update()
    for layer, obj, hidden in snapshots:
        if obj.name in layer.objects:
            obj.hide_set(hidden, view_layer=layer)
    return container


def create_high(context):
    low = context.view_layer.objects.active
    if not low or low.type != "MESH" or not low.is_editable:
        raise ValueError("Sélectionne un LOW local en mode Objet.")
    key, role = object_role(low)
    group = bake_groups(context.scene.objects).get(key.casefold())
    if role in {"HIGH", "CAGE"} or (group and group["HIGH"]):
        raise ValueError("Cette pièce possède déjà un HIGH. Sélectionne son LOW pour travailler sur une nouvelle paire.")
    high = low.copy()
    high.data = low.data.copy()
    high.name = key + "_HIGH"
    next(iter(low.users_collection), context.scene.collection).objects.link(high)
    # Geometry is independent; keep deformation and source material, remove bake overrides.
    for slot in high.material_slots:
        source = slot.material.get("blendup_source_material", "") if slot.material else ""
        if source and bpy.data.materials.get(source):
            slot.link, slot.material = "OBJECT", bpy.data.materials[source]
    high[ROLE_KEY], high[PAIR_KEY] = "HIGH", key
    try:
        organize_asset(context, key, low, [high])
    except Exception:
        mesh = high.data
        bpy.data.objects.remove(high, do_unlink=True)
        bpy.data.meshes.remove(mesh)
        raise
    show_asset_role(context, key, "HIGH")
    return high


def align_high_parent(context, key):
    """Explicit opt-in: HIGHs follow the LOW parent from now on, keeping this pose."""
    group = bake_groups(context.scene.objects).get(key.casefold())
    if not group or len(group["LOW"]) != 1 or not group["HIGH"]:
        raise ValueError("Choisis une paire avec exactement un LOW.")
    low = group["LOW"][0]
    container = asset_container(context.scene, key)
    reference = container or low
    targets = [o for o in group["HIGH"] + group["CAGE"] if parent_signature(o) != parent_signature(low)]
    if any((o.animation_data and (o.animation_data.action or o.animation_data.nla_tracks or o.animation_data.drivers))
           or o.constraints or not o.is_editable for o in targets):
        raise ValueError("Un HIGH possède une animation, des contraintes ou est lié. Aligne son parent manuellement.")
    snapshots = [(o, parent_signature(o), o.matrix_parent_inverse.copy(), o.matrix_basis.copy()) for o in targets]
    try:
        for obj in targets:
            world = obj.matrix_world.copy()
            obj.parent, obj.parent_type, obj.parent_bone = parent_signature(reference)[:3]
            obj.matrix_parent_inverse = Matrix.Identity(4)
            context.view_layer.update()
            obj.matrix_world = world
        context.view_layer.update()
        return organize_asset(context, key, low, group["HIGH"])
    except Exception:
        for obj, signature, inverse, basis in snapshots:
            obj.parent, obj.parent_type, obj.parent_bone = signature[:3]
            obj.parent_vertices = signature[3]
            obj.matrix_parent_inverse, obj.matrix_basis = inverse, basis
        context.view_layer.update()
        raise


def select_asset_role(context, key, role="ALL"):
    """Add/remove a role from selection. Other roles remain visible and selected."""
    group = bake_groups(context.scene.objects).get(key.casefold())
    if not group:
        raise ValueError("Paire introuvable.")
    targets = [o for r in (ROLES if role == "ALL" else [role]) for o in group[r]]
    if not targets or any(o.name not in context.view_layer.objects or o.hide_select for o in targets):
        raise ValueError("Active les collections et autorise la sélection des composants.")
    select = role == "ALL" or not all(o.select_get() for o in targets)
    if select:
        reveal_targets(context, targets)
    for obj in targets:
        obj.select_set(select)
    if select:
        context.view_layer.objects.active = (group["LOW"] or targets)[0] if role == "ALL" else targets[0]
    return group


def reveal_targets(context, targets):
    snapshots = [(o, o.hide_viewport, o.hide_get()) for o in targets]
    for obj in targets:
        obj.hide_viewport = False
        obj.hide_set(False)
    context.view_layer.update()
    if not all(o.visible_get() for o in targets):
        for obj, disabled, hidden in snapshots:
            obj.hide_viewport = disabled
            obj.hide_set(hidden)
        raise ValueError("Affiche la collection parente avant d'afficher ces composants.")
    for obj in targets:
        if object_role(obj)[1] == "LOW" and PREVIEW_LAYERS_KEY in obj:
            layers = set(obj[PREVIEW_LAYERS_KEY]) - {context.view_layer.name}
            if layers:
                obj[PREVIEW_LAYERS_KEY] = sorted(layers)
            else:
                del obj[PREVIEW_LAYERS_KEY]


def toggle_asset_visibility(context, key, role):
    group = bake_groups(context.scene.objects).get(key.casefold())
    if not group or not group[role]:
        raise ValueError("Version introuvable.")
    targets = group[role]
    if any(o.name not in context.view_layer.objects for o in targets):
        raise ValueError("Active la collection dans le View Layer.")
    hide = any(o.visible_get() for o in targets)
    if hide:
        for obj in targets:
            if role == "LOW":
                layers = set(obj.get(PREVIEW_LAYERS_KEY, ())) | {context.view_layer.name}
                obj[PREVIEW_LAYERS_KEY] = sorted(layers)
            obj.hide_set(True)
    else:
        reveal_targets(context, targets)


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
