"""One material per bake family, with an atlas and a separate UV layer."""
from datetime import datetime
from math import ceil, sqrt
from pathlib import Path
import shutil

import bpy
import numpy as np

from .core.bake import object_role, texture_stem

ATLAS_UV = "BlendUp_BakeAtlas"
IMAGE_KEY = "blendup_bake_image_"


def remove_unused_bakes(materials):
    # Depsgraph references can keep Material.users above zero after a bake.
    # user_map checks persistent datablocks and protects meshes, scenes and fake users.
    if not materials:
        return
    for material, users in bpy.data.user_map(subset=set(materials)).items():
        if not users and not material.use_fake_user and material.get("blendup_baked"):
            bpy.data.materials.remove(material)


def source_images(low):
    material = low.active_material
    result = {}
    for channel in ("NORMAL", "BASE_COLOR", "ROUGHNESS", "METALLIC"):
        image = low.get(IMAGE_KEY + channel)
        if image is None and material and material.use_nodes and not material.get("blendup_atlas_source"):
            node = material.node_tree.nodes.get("BlendUp_" + channel)
            image = node.image if node and node.type == "TEX_IMAGE" else None
        if image is not None:
            result[channel] = image
    return result


def atlas_members(context, lows, source):
    members = set(lows)
    members.update(o for o in context.scene.objects if o.type == "MESH" and object_role(o)[1] == "LOW"
                   and o.active_material and o.active_material.get("blendup_atlas_source") == source.name)
    return sorted(members, key=lambda o: object_role(o)[0].casefold())


def validate_material_group(context, lows, source, require_images=True):
    if source is None or source.get("blendup_baked") or not source.use_nodes:
        raise ValueError("Choisis le matériau source non baké du groupe, par exemple M_Armure.")
    members = atlas_members(context, lows, source)
    if not members:
        raise ValueError("Sélectionne les LOW ou HIGH des paires à regrouper.")
    if len(members) > 16:
        raise ValueError("Un groupe accepte au maximum 16 pièces. Sépare les familles de matériaux.")
    channels = None
    for low in members:
        if not low.is_editable or not low.data.is_editable or not low.data.uv_layers:
            raise ValueError(f"{low.name} : le LOW doit être local et posséder des UV.")
        distinct = {s.material for s in low.material_slots if s.material}
        if len(distinct) > 1:
            raise ValueError(f"{low.name} utilise plusieurs matériaux différents. Sépare ses surfaces avant de les regrouper.")
        images = source_images(low)
        if require_images:
            if not images or any(min(image.size) == 0 or max(image.size) > 4096 for image in images.values()):
                raise ValueError(f"{low.name} : réalise d'abord un bake (cartes jusqu'à 4K).")
            if channels is not None and set(images) != channels:
                raise ValueError("Toutes les pièces du groupe doivent avoir les mêmes cartes bakées. Rebake le groupe avec les mêmes options.")
            channels = set(images)
    return members


def group_baked_materials(context, lows, source, output_dir):
    """Prepare images, material and copied meshes before replacing any LOW."""
    members = validate_material_group(context, lows, source)
    from .blender_bake import output_material
    images_by_low = {low: source_images(low) for low in members}
    grid = ceil(sqrt(len(members)))
    tile = max(max(image.size) for images in images_by_low.values() for image in images.values())
    size, padding = grid * tile, 4
    if size > 8192:
        raise ValueError("L'atlas dépasserait 8192 px. Réduis la résolution du bake ou sépare le groupe.")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    created_images, meshes, new_materials, pending_files = [], [], [], []
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    old_materials = {low.active_material for low in members}
    old_atlases = {n.image for m in old_materials if m and m.get("blendup_atlas_source")
                   for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.name.startswith("BlendUp_") and n.image}
    try:
        atlas_images = {}
        for channel in next(iter(images_by_low.values())):
            pixels = np.zeros((size, size, 4), dtype=np.float32)
            pixels[:, :, 3] = 1
            if channel == "NORMAL":
                pixels[:, :, :3] = (0.5, 0.5, 1)
            for index, low in enumerate(members):
                image = images_by_low[low][channel]
                temporary = image.copy()
                try:
                    temporary.scale(tile - padding * 2, tile - padding * 2)
                    data = np.empty((tile - padding * 2) ** 2 * 4, dtype=np.float32)
                    temporary.pixels.foreach_get(data)
                    data = np.pad(data.reshape(tile - padding * 2, tile - padding * 2, 4), ((padding, padding), (padding, padding), (0, 0)), mode="edge")
                    x, y = index % grid * tile, index // grid * tile
                    pixels[y:y + tile, x:x + tile] = data
                finally:
                    bpy.data.images.remove(temporary)
            atlas = bpy.data.images.new(source.name + " Bake " + channel, width=size, height=size, alpha=False)
            created_images.append(atlas)
            atlas.colorspace_settings.name = "sRGB" if channel == "BASE_COLOR" else "Non-Color"
            atlas.pixels.foreach_set(pixels.ravel())
            atlas.update()
            final = output_dir / f"{texture_stem(source.name)}_Atlas_{channel}.png"
            staged = output_dir / ("." + stamp + "-" + final.name)
            atlas.filepath_raw, atlas.file_format = str(staged), "PNG"
            atlas.save()
            pending_files.append((staged, final))
            atlas_images[channel] = atlas
        # A temporary object gives the shared material its explicit atlas UV node.
        temporary_mesh = bpy.data.meshes.new(".BlendUpAtlasMaterial")
        temporary_object = bpy.data.objects.new(".BlendUpAtlasMaterial", temporary_mesh)
        try:
            temporary_mesh.uv_layers.new(name=ATLAS_UV)
            temporary_mesh.materials.append(source)
            new_materials = output_material(temporary_object, source.name, atlas_images)
        finally:
            bpy.data.objects.remove(temporary_object)
            bpy.data.meshes.remove(temporary_mesh)
        material = new_materials[0]
        material["blendup_atlas_source"] = source.name
        for index, low in enumerate(members):
            mesh = low.data.copy()
            meshes.append((low, mesh))
            source_uv = next((u for u in mesh.uv_layers if u.active_render), mesh.uv_layers.active)
            if source_uv.name == ATLAS_UV:
                raise ValueError(f"{low.name} : garde les UV d'origine comme UV de rendu avant de regrouper.")
            uv_name = source_uv.name
            uv = mesh.uv_layers.get(ATLAS_UV) or mesh.uv_layers.new(name=ATLAS_UV)
            # Adding a UV layer can invalidate RNA handles; retrieve the source again.
            source_uv = mesh.uv_layers[uv_name]
            for original, mapped in zip(source_uv.data, uv.data):
                mapped.uv = ((index % grid * tile + padding + original.uv.x * (tile - 2 * padding)) / size,
                             (index // grid * tile + padding + original.uv.y * (tile - 2 * padding)) / size)
            mesh.uv_layers[uv_name].active_render = True
        # Back up every destination before replacing; restore if file commit fails.
        replaced = []
        try:
            for staged, final in pending_files:
                saved = None
                if final.exists():
                    saved = output_dir / "backups" / stamp / final.name
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(final, saved)
                replaced.append((final, saved))
                staged.replace(final)
            for atlas, (_, final) in zip(created_images, pending_files):
                atlas.filepath = bpy.path.relpath(str(final)) if bpy.data.filepath else str(final)
        except Exception:
            for final, saved in reversed(replaced):
                if saved:
                    shutil.copy2(saved, final)
                else:
                    final.unlink(missing_ok=True)
            raise
        for low, mesh in meshes:
            low.data = mesh
            if not mesh.materials:
                mesh.materials.append(None)
            for slot in low.material_slots:
                slot.link, slot.material = "OBJECT", material
            for channel, image in images_by_low[low].items():
                low[IMAGE_KEY + channel] = image
        # Keep untouched/shared originals. Remove only unused BlendUp bake copies.
        desired_name = source.name + " Bake"
        context.view_layer.update()
        remove_unused_bakes({m for m in old_materials if m and m != source})
        for old in old_atlases:
            if not old.users and not old.use_fake_user:
                bpy.data.images.remove(old)
        material.name = desired_name
        return material, size, len(members)
    except Exception:
        for _, mesh in meshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for material in new_materials:
            if material.users == 0:
                bpy.data.materials.remove(material)
        for image in created_images:
            if image.users == 0:
                bpy.data.images.remove(image)
        raise
    finally:
        for staged, _ in pending_files:
            staged.unlink(missing_ok=True)
