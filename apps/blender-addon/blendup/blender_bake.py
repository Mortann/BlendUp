"""Bake isolé HIGH → LOW. Seuls les résultats validés sont appliqués au LOW."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import shutil
import tempfile

import bpy
from mathutils import Vector

from .core.bake import PAIR_KEY, ROLE_KEY, bake_groups, texture_stem

CHANNELS = {"NORMAL": "Normal", "BASE_COLOR": "BaseColor", "ROUGHNESS": "Roughness", "METALLIC": "Metallic"}


@dataclass
class BakeOptions:
    resolution: int = 2048
    channels: tuple = ("NORMAL",)
    margin: int = 16
    extrusion: float = 0.01  # fraction of the LOW's world-space diagonal
    max_ray_distance: float = 0.0
    samples: int = 16
    rest_pose: bool = True
    outer_surface: bool = True


def discover_pairs(context, selected_only=False):
    groups = bake_groups(context.scene.objects)
    selected = set(context.selected_objects)
    pairs = [g for g in groups.values() if g["LOW"] and g["HIGH"]]
    if selected_only:
        pairs = [g for g in pairs if selected.intersection(g["LOW"] + g["HIGH"] + g["CAGE"])]
    return sorted(pairs, key=lambda g: g["name"].casefold())


def validate_pairs(pairs, options):
    if not pairs:
        raise ValueError("Aucune paire LOW / HIGH. Nomme les objets Asset_LOW et Asset_HIGH, ou sélectionne HIGH puis LOW actif et utilise « Organiser la paire ».")
    if options.resolution not in {256, 512, 1024, 2048, 4096}:
        raise ValueError("Résolution non prise en charge.")
    if not options.channels or any(channel not in CHANNELS for channel in options.channels):
        raise ValueError("Choisis au moins une carte à baker.")
    stems = set()
    for pair in pairs:
        if len(pair["LOW"]) != 1 or len(pair["CAGE"]) > 1:
            raise ValueError(f"{pair['name']} : il faut exactement un LOW et au maximum une CAGE par paire.")
        stem = texture_stem(pair["name"]).casefold()
        if stem in stems:
            raise ValueError("Deux paires produisent le même nom de texture. Renomme l'une d'elles.")
        stems.add(stem)
        low = pair["LOW"][0]
        if any(not o.is_editable for o in pair["LOW"] + pair["HIGH"] + pair["CAGE"]):
            raise ValueError(f"{pair['name']} : rends les objets liés locaux avant le bake.")
        if not low.data.polygons or not low.data.uv_layers:
            raise ValueError(f"{low.name} : déplie les UV du LOW avant le bake.")
        uv = next((u for u in low.data.uv_layers if u.active_render), low.data.uv_layers.active)
        low.data.calc_loop_triangles()
        for triangle in low.data.loop_triangles:
            a, b, c = (uv.data[i].uv for i in triangle.loops)
            if abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-12:
                raise ValueError(f"{low.name} : des faces ont des UV sans surface. Déplie-les avant le bake.")
        if any(not (-0.00001 <= v <= 1.00001) for loop in uv.data for v in loop.uv):
            raise ValueError(f"{low.name} : les UV doivent tenir dans la tuile 0–1 (UDIM non pris en charge).")
        if any(not obj.data.polygons for obj in pair["HIGH"]):
            raise ValueError(f"{pair['name']} : une source HIGH est vide.")


def organize_pair(context):
    low = context.view_layer.objects.active
    highs = [o for o in context.selected_objects if o.type == "MESH" and o != low]
    if not low or low.type != "MESH" or not highs:
        raise ValueError("Sélectionne le ou les HIGH, puis le LOW en dernier (objet actif).")
    from .core.bake import name_role
    key = name_role(low.name)[0]
    texture_stem(key)
    parents = list(low.users_collection)
    parent = parents[0] if parents else context.scene.collection
    root = next((c for c in context.scene.collection.children_recursive if c.get("blendup_bake_root") == key), None)
    if not root:
        root = bpy.data.collections.new(f"{key}_BAKE")
        root["blendup_bake_root"] = key
        parent.children.link(root)
    for role, objects in (("LOW", [low]), ("HIGH", highs), ("CAGE", [])):
        collection = next((c for c in root.children if c.get(ROLE_KEY) == role), None)
        if not collection:
            collection = bpy.data.collections.new(f"{key}_{role}")
            root.children.link(collection)
        collection[ROLE_KEY], collection[PAIR_KEY] = role, key
        for obj in objects:
            obj[ROLE_KEY], obj[PAIR_KEY] = role, key
            old_collections = list(obj.users_collection)
            if obj.name not in collection.objects:
                collection.objects.link(obj)
            for previous in old_collections:
                if previous != collection:
                    previous.objects.unlink(obj)
    return key


@contextmanager
def rest_rigs(objects, enabled):
    rigs = {m.object for o in objects for m in o.modifiers if m.type == "ARMATURE" and m.object}
    snapshots = [(r, r.data.pose_position) for r in rigs]
    try:
        if enabled:
            for rig, _ in snapshots:
                rig.data.pose_position = "REST"
            bpy.context.view_layer.update()
        yield
    finally:
        for rig, position in snapshots:
            rig.data.pose_position = position
        bpy.context.view_layer.update()


@contextmanager
def evaluable_sources(context, objects):
    """Evaluate hidden/excluded sources without changing collection restrictions."""
    temporary = bpy.data.collections.new(".BlendUpBakeSources")
    context.scene.collection.children.link(temporary)
    snapshots = []
    try:
        for obj in objects:
            snapshots.append((obj, obj.hide_viewport, obj.hide_get() if obj.name in context.view_layer.objects else False))
            temporary.objects.link(obj)
            obj.hide_viewport = False
        context.view_layer.update()
        for obj in objects:
            obj.hide_set(False)
        context.view_layer.update()
        yield
    finally:
        for obj, disabled, hidden in snapshots:
            obj.hide_set(hidden)
            obj.hide_viewport = disabled
        bpy.data.collections.remove(temporary)
        context.view_layer.update()


@contextmanager
def outer_surface(low, enabled):
    # Solidify reuses the outer UVs on its inner shell. Baking both shells into
    # the same pixels overwrites the outside with reversed normals.
    snapshots = [(m, m.show_viewport) for m in low.modifiers if m.type == "SOLIDIFY"]
    try:
        if enabled:
            for modifier, _ in snapshots:
                modifier.show_viewport = False
            bpy.context.view_layer.update()
        yield
    finally:
        for modifier, visible in snapshots:
            modifier.show_viewport = visible
        bpy.context.view_layer.update()


def clone_mesh(obj, scene, depsgraph, meshes):
    # Evaluate in the source layer, before entering the isolated bake scene.
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    meshes.append(mesh)
    clone = bpy.data.objects.new(f".BlendUpBake_{obj.name}", mesh)
    scene.collection.objects.link(clone)
    clone.matrix_world = obj.matrix_world.copy()
    # Evaluated mesh materials omit OBJECT-linked overrides.
    for slot, source_slot in zip(clone.material_slots, obj.material_slots):
        slot.link, slot.material = "OBJECT", source_slot.material
    return clone


def emission_source(material, channel):
    tree = material.node_tree
    output = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    principled = output.inputs["Surface"].links[0].from_node if output and output.inputs["Surface"].is_linked else None
    if not principled or principled.type != "BSDF_PRINCIPLED":
        raise ValueError(f"{material.name} : les cartes PBR demandent un Principled BSDF relié directement à Material Output.")
    source = principled.inputs[{"BASE_COLOR": "Base Color", "ROUGHNESS": "Roughness", "METALLIC": "Metallic"}[channel]]
    emission = tree.nodes.new("ShaderNodeEmission")
    if source.is_linked:
        tree.links.new(source.links[0].from_socket, emission.inputs["Color"])
    else:
        value = source.default_value
        emission.inputs["Color"].default_value = tuple(value) if channel == "BASE_COLOR" else (value, value, value, 1)
    tree.links.new(emission.outputs[0], output.inputs["Surface"])


def output_material(low, pair_name, images):
    """Copy each material so shared helmet/armor materials stay untouched."""
    originals = [slot.material for slot in low.material_slots] or [None]
    result = []
    for index, original in enumerate(originals):
        material = original.copy() if original else bpy.data.materials.new(f"{pair_name}_Baked")
        material.name = f"{pair_name}_Baked_{index + 1}"
        material.use_nodes = True
        tree = material.node_tree
        output = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
        if not output:
            output = tree.nodes.new("ShaderNodeOutputMaterial")
        shader = output.inputs["Surface"].links[0].from_node if output.inputs["Surface"].is_linked else None
        if not shader or shader.type != "BSDF_PRINCIPLED":
            shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
            tree.links.new(shader.outputs[0], output.inputs["Surface"])
        for offset, (channel, image) in enumerate(images.items()):
            node = tree.nodes.get(f"BlendUp_{channel}") or tree.nodes.new("ShaderNodeTexImage")
            node.name, node.label, node.image = f"BlendUp_{channel}", f"BlendUp · {CHANNELS[channel]}", image
            node.location = (shader.location.x - 600, shader.location.y - offset * 300)
            # Use the actual render UV set, including when another layer is active.
            uv_node = tree.nodes.get("BlendUp_UV") or tree.nodes.new("ShaderNodeUVMap")
            uv_node.name = "BlendUp_UV"
            uv_node.uv_map = next((u.name for u in low.data.uv_layers if u.active_render), low.data.uv_layers.active.name)
            uv_node.location = (shader.location.x - 850, shader.location.y)
            tree.links.new(uv_node.outputs["UV"], node.inputs["Vector"])
            if channel == "NORMAL":
                normal = tree.nodes.get("BlendUp_NormalMap") or tree.nodes.new("ShaderNodeNormalMap")
                normal.name, normal.space, normal.uv_map = "BlendUp_NormalMap", "TANGENT", uv_node.uv_map
                normal.inputs["Strength"].default_value = 1
                normal.location = (shader.location.x - 260, shader.location.y - offset * 300)
                tree.links.new(node.outputs["Color"], normal.inputs["Color"])
                tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
            else:
                tree.links.new(node.outputs["Color"], shader.inputs[{"BASE_COLOR": "Base Color", "ROUGHNESS": "Roughness", "METALLIC": "Metallic"}[channel]])
        material["blendup_baked"] = True
        result.append(material)
    return result


def bake_pairs(context, pairs, output_dir, options=None, progress=None):
    options = options or BakeOptions()
    validate_pairs(pairs, options)
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    prepared, created_images, created_materials = [], [], []
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    # Stage everything before replacing textures or assigning LOW materials.
    with tempfile.TemporaryDirectory(prefix=".blendup-bake-", dir=output_dir) as directory:
        staging = Path(directory)
        try:
            for pair_index, pair in enumerate(pairs):
                if progress:
                    progress(pair_index / len(pairs), pair["name"])
                low = pair["LOW"][0]
                scene = bpy.data.scenes.new(".BlendUpBake")
                meshes, materials = [], []
                images = {}
                try:
                    scene.render.engine = "CYCLES"
                    scene.cycles.samples = options.samples
                    scene.cycles.device = context.scene.cycles.device
                    scene.render.bake.margin = options.margin
                    scene.render.bake.use_selected_to_active = True
                    scene.render.bake.use_clear = True
                    scene.render.bake.normal_space = "TANGENT"
                    scene.render.bake.normal_r, scene.render.bake.normal_g, scene.render.bake.normal_b = "POS_X", "POS_Y", "POS_Z"
                    sources = [low, *pair["HIGH"], *pair["CAGE"]]
                    with evaluable_sources(context, sources), rest_rigs(sources, options.rest_pose), outer_surface(low, options.outer_surface):
                        graph = context.evaluated_depsgraph_get()
                        target = clone_mesh(low, scene, graph, meshes)
                        highs = [clone_mesh(o, scene, graph, meshes) for o in pair["HIGH"]]
                        cage = clone_mesh(pair["CAGE"][0], scene, graph, meshes) if pair["CAGE"] else None
                    if cage and (len(cage.data.vertices) != len(target.data.vertices) or len(cage.data.polygons) != len(target.data.polygons)):
                        raise ValueError(f"{pair['name']} : la CAGE doit avoir la topologie du LOW évalué.")
                    bounds = [target.matrix_world @ Vector(v) for v in target.bound_box]
                    diagonal = (Vector(tuple(max(v[i] for v in bounds) for i in range(3))) - Vector(tuple(min(v[i] for v in bounds) for i in range(3)))).length
                    scene.render.bake.cage_extrusion = max(diagonal * options.extrusion, 0.000001)
                    scene.render.bake.max_ray_distance = options.max_ray_distance
                    scene.render.bake.use_cage = cage is not None
                    if cage:
                        scene.render.bake.cage_object = cage
                    uv = next((u for u in target.data.uv_layers if u.active_render), target.data.uv_layers.active)
                    if uv is None:
                        raise ValueError(f"{low.name} : les modificateurs ont supprimé les UV.")
                    target.data.uv_layers.active = uv
                    target.data.materials.clear()
                    destination = bpy.data.materials.new(".BlendUpBakeTarget")
                    materials.append(destination)
                    destination.use_nodes = True
                    target.data.materials.append(destination)
                    for polygon in target.data.polygons:
                        polygon.material_index = 0
                    node = destination.node_tree.nodes.new("ShaderNodeTexImage")
                    destination.node_tree.nodes.active = node
                    source_materials = [(obj, [slot.material for slot in obj.material_slots]) for obj in highs]
                    for channel in options.channels:
                        image = bpy.data.images.new(f"{pair['name']}_{CHANNELS[channel]}", width=options.resolution, height=options.resolution, alpha=False)
                        created_images.append(image)
                        image.colorspace_settings.name = "sRGB" if channel == "BASE_COLOR" else "Non-Color"
                        image.generated_color = (0.5, 0.5, 1, 1) if channel == "NORMAL" else (0, 0, 0, 1)
                        node.image = image
                        # Copies per channel preserve source shaders, even for shared materials.
                        for obj, originals in source_materials:
                            obj.data.materials.clear()
                            for original in originals or [None]:
                                material = original.copy() if original else bpy.data.materials.new(".BlendUpBakeSource")
                                materials.append(material)
                                material.use_nodes = True
                                if channel != "NORMAL":
                                    emission_source(material, channel)
                                obj.data.materials.append(material)
                        with context.temp_override(scene=scene, view_layer=scene.view_layers[0], active_object=target, object=target, selected_objects=[target, *highs], selected_editable_objects=[target, *highs]):
                            for obj in scene.objects:
                                obj.select_set(False)
                            for obj in [target, *highs]:
                                obj.select_set(True)
                            scene.view_layers[0].objects.active = target
                            result = bpy.ops.object.bake(type="NORMAL" if channel == "NORMAL" else "EMIT", uv_layer=uv.name)
                            if result != {"FINISHED"}:
                                raise RuntimeError(f"Bake interrompu : {pair['name']} / {channel}")
                        filename = f"{texture_stem(pair['name'])}_{CHANNELS[channel]}.png"
                        image.filepath_raw = str(staging / filename)
                        image.file_format = "PNG"
                        image.save()
                        images[channel] = image
                    new_materials = output_material(low, pair["name"], images)
                    created_materials.extend(new_materials)
                    prepared.append((pair, images, new_materials))
                finally:
                    for obj in list(scene.objects):
                        bpy.data.objects.remove(obj, do_unlink=True)
                    bpy.data.scenes.remove(scene)
                    for mesh in meshes:
                        bpy.data.meshes.remove(mesh)
                    for material in materials:
                        bpy.data.materials.remove(material)

            files, replaced = [], []
            backup = output_dir / "backups" / stamp
            try:
                for pair, images, _ in prepared:
                    for channel, image in images.items():
                        staged = Path(image.filepath_raw)
                        final = output_dir / staged.name
                        saved = None
                        if final.exists():
                            backup.mkdir(parents=True, exist_ok=True)
                            saved = backup / final.name
                            shutil.copy2(final, saved)
                        replaced.append((final, saved))
                        staged.replace(final)
                        image.filepath = bpy.path.relpath(str(final)) if bpy.data.filepath else str(final)
                        files.append({"pair": pair["name"], "channel": channel, "path": str(final), "resolution": options.resolution})
            except Exception:
                for final, saved in reversed(replaced):
                    if saved:
                        shutil.copy2(saved, final)
                    else:
                        final.unlink(missing_ok=True)
                raise
            for pair, _, new_materials in prepared:
                low = pair["LOW"][0]
                # Object-linked slots preserve shared mesh data and other objects.
                if not low.material_slots:
                    low.data = low.data.copy()
                    low.data.materials.append(None)
                for slot, material in zip(low.material_slots, new_materials):
                    slot.link, slot.material = "OBJECT", material
                low[ROLE_KEY], low[PAIR_KEY] = "LOW", pair["name"]
                for role in ("HIGH", "CAGE"):
                    for obj in pair[role]:
                        obj[ROLE_KEY], obj[PAIR_KEY] = role, pair["name"]
            report = {"schemaVersion": 1, "createdAt": stamp, "source": bpy.data.filepath, "files": files, "restPose": options.rest_pose}
            (output_dir / "bake-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            return report
        except Exception:
            for material in created_materials:
                if material.users == 0:
                    bpy.data.materials.remove(material)
            for image in created_images:
                if image.users == 0:
                    bpy.data.images.remove(image)
            raise
