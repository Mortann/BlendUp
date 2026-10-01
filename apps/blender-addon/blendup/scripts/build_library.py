"""Background build: native Blender asset library and/or a linked Showcase scene.

Input is a BlendUp-owned JSON manifest. Never opens or saves a source .blend.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import sys
import uuid
import time
from contextlib import contextmanager

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from blendup_showcase import arrange
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location("blendup_showcase", Path(__file__).resolve().parents[1] / "core/showcase.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    arrange = module.arrange


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def geometry(collection, base=None, ancestors=()):
    """Include nested collection instances, with their original transforms."""
    if collection in ancestors:
        return
    base = Matrix.Identity(4) if base is None else base
    for obj in collection.all_objects:
        if obj.hide_render:
            continue
        if obj.type in {"MESH", "CURVE", "SURFACE", "FONT", "META", "VOLUME"}:
            yield obj, base @ obj.matrix_world
        if obj.instance_type == "COLLECTION" and obj.instance_collection:
            nested = obj.instance_collection
            transform = base @ obj.matrix_world @ Matrix.Translation(-nested.instance_offset)
            yield from geometry(nested, transform, (*ancestors, collection))


def load_asset(source, link=False):
    with bpy.data.libraries.load(str(source), link=link) as (available, loaded):
        loaded.scenes = available.scenes[:1]
    source_scene = loaded.scenes[0] if loaded.scenes else None
    if source_scene is None:
        raise ValueError("Le fichier ne contient pas de scène.")
    objects = [obj for obj in source_scene.objects if obj.type not in {"CAMERA", "LIGHT"} and not obj.hide_render]
    collection = bpy.data.collections.new("Asset")
    for obj in objects:
        collection.objects.link(obj)
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.update()
    points = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj, transform in geometry(collection):
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(transform @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        bpy.context.scene.collection.children.unlink(collection)
        bpy.data.collections.remove(collection)
        raise ValueError("Aucun objet visible à exposer.")
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return collection, (low, high)


def asset_preview(collection):
    """Small deterministic geometry preview; no render jobs, GPU or global thumbnail cache."""
    size = 96
    triangles = []
    right = Vector((1, 1, 0)).normalized()
    up = Vector((-1, 1, 2)).normalized()
    eye = Vector((1, -1, 1)).normalized()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj, transform in geometry(collection):
        if obj.type not in {"MESH", "CURVE", "SURFACE", "FONT", "META"}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if mesh is None:
            continue
        try:
            mesh.calc_loop_triangles()
            stride = max(1, math.ceil(len(mesh.loop_triangles) / 20000))
            vertices = [transform @ vertex.co for vertex in mesh.vertices]
            for tri in list(mesh.loop_triangles)[::stride]:
                points = [vertices[index] for index in tri.vertices]
                normal = (points[1] - points[0]).cross(points[2] - points[0]).normalized()
                light = 0.45 + 0.55 * abs(normal.dot(eye))
                color = (0.64, 0.7, 0.78)
                if tri.material_index < len(mesh.materials) and mesh.materials[tri.material_index]:
                    color = mesh.materials[tri.material_index].diffuse_color[:3]
                triangles.append(([(p.dot(right), p.dot(up), p.dot(eye)) for p in points], [min(1, max(0.05, c * light)) for c in color]))
        finally:
            evaluated.to_mesh_clear()
    if not triangles:
        return
    points = [p for tri, _color in triangles for p in tri]
    lo_x, hi_x = min(p[0] for p in points), max(p[0] for p in points)
    lo_y, hi_y = min(p[1] for p in points), max(p[1] for p in points)
    scale = (size - 12) / max(hi_x - lo_x, hi_y - lo_y, 0.01)
    center_x, center_y = (lo_x + hi_x) / 2, (lo_y + hi_y) / 2
    pixels = [0.075, 0.09, 0.11, 1.0] * (size * size)
    depth = [float("-inf")] * (size * size)
    for tri, color in triangles:
        a, b, c = [(size / 2 + (p[0] - center_x) * scale, size / 2 + (p[1] - center_y) * scale, p[2]) for p in tri]
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-9:
            continue
        for y in range(max(0, math.floor(min(a[1], b[1], c[1]))), min(size - 1, math.ceil(max(a[1], b[1], c[1]))) + 1):
            for x in range(max(0, math.floor(min(a[0], b[0], c[0]))), min(size - 1, math.ceil(max(a[0], b[0], c[0]))) + 1):
                u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
                v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
                w = 1 - u - v
                if min(u, v, w) >= -1e-6:
                    z = u * a[2] + v * b[2] + w * c[2]
                    index = y * size + x
                    if z > depth[index]:
                        depth[index] = z
                        pixels[index * 4:index * 4 + 4] = [*color, 1.0]
    preview = collection.preview_ensure()
    preview.image_size = (size, size)
    preview.image_pixels_float = pixels
    preview.is_image_custom = True


@contextmanager
def catalog_lock(root):
    """Serialize desktop and add-on builds; the OS releases this lock on process exit."""
    directory = Path(root) / ".blendup/library/blender"
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".build.lock").open("a+b") as lock:
        if lock.tell() == 0:
            lock.write(b"0")
            lock.flush()
        deadline = time.monotonic() + 120
        while True:
            lock.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise TimeoutError("Une autre synchronisation utilise déjà la bibliothèque. Réessaie après sa fin.")
                time.sleep(0.25)
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def build_catalog(manifest):
    with catalog_lock(manifest["root"]):
        _build_catalog(manifest)


def _build_catalog(manifest):
    root = Path(manifest["root"])
    cache = root / ".blendup/library/blender"
    cache.mkdir(parents=True, exist_ok=True)
    records = []
    failures = []
    def cache_key(asset):
        return uuid.uuid5(uuid.NAMESPACE_URL, manifest["projectId"] + "/" + asset["id"]).hex
    for asset in manifest["assets"]:
        target = cache / (cache_key(asset) + ".blend")
        record = cache / (cache_key(asset) + ".json")
        expected = {"version": 2, "signature": asset["sourceSignature"], "folder": asset["folder"], "name": asset["name"], "tags": asset.get("tags", [])}
        if target.exists() and record.exists():
            try:
                if json.loads(record.read_text(encoding="utf-8")) == expected:
                    records.append(asset)
                    continue
            except (OSError, ValueError):
                pass
        try:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            collection, _bounds = load_asset(root / asset["sourcePath"])
            collection.name = asset["name"]
            for obj in collection.all_objects:
                if obj.asset_data:
                    obj.asset_clear()
                if obj.data and obj.data.asset_data:
                    obj.data.asset_clear()
            collection.asset_mark()
            collection.asset_data.catalog_id = str(uuid.uuid5(uuid.NAMESPACE_URL, manifest["projectId"] + "/" + asset["folder"]))
            collection.asset_data.description = asset["folder"] + " · " + asset["sourcePath"]
            for tag in asset.get("tags", []):
                collection.asset_data.tags.new(tag)
            asset_preview(collection)
            temporary = cache / (cache_key(asset) + ".building.blend")
            bpy.data.libraries.write(str(temporary), {collection}, path_remap="RELATIVE_ALL", fake_user=True, compress=True)
            os.replace(temporary, target)
            save_json(record, expected)
            records.append(asset)
        except Exception as error:
            failures.append({"id": asset["id"], "name": asset["name"], "error": str(error)})
            # Do not leave a stale asset draggable after a failed refresh.
            target.unlink(missing_ok=True)
    allowed = {cache_key(asset) for asset in manifest["assets"]}
    for target in cache.glob("*.blend"):
        if target.stem not in allowed and not target.name.endswith(".building.blend"):
            target.unlink()
            target.with_suffix(".json").unlink(missing_ok=True)
    folders = sorted({asset["folder"] for asset in records})
    catalog = "# BlendUp generated asset catalogs\nVERSION 1\n\n"
    for folder in folders:
        catalog_id = uuid.uuid5(uuid.NAMESPACE_URL, manifest["projectId"] + "/" + folder)
        safe_folder = folder.replace(":", "_").replace("\n", " ").replace("\r", " ")
        catalog += f"{catalog_id}:{safe_folder}:{safe_folder.rsplit('/', 1)[-1]}\n"
    (cache / "blender_assets.cats.txt").write_text(catalog, encoding="utf-8")
    save_json(cache / "status.json", {"signature": manifest["signature"], "count": len(records), "errors": failures})


def build_showcase(manifest):
    root = Path(manifest["root"])
    target = Path(manifest["target"])
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    assets, bounds, errors = [], [], []
    for asset in manifest["assets"]:
        try:
            collection, bound = load_asset(root / asset["sourcePath"], link=True)
            collection.name = "Source_" + asset["name"]
            bpy.context.scene.collection.children.unlink(collection)
            assets.append((asset, collection))
            bounds.append(bound)
        except Exception as error:
            errors.append({"id": asset["id"], "name": asset["name"], "error": str(error)})
    offsets, floor = arrange(bounds, manifest.get("spacing", 1.5))
    placements = []
    for (asset, collection), offset, bound in zip(assets, offsets, bounds):
        instance = bpy.data.objects.new(asset["name"], None)
        instance.instance_type = "COLLECTION"
        instance.instance_collection = collection
        instance.location = offset
        bpy.context.scene.collection.objects.link(instance)
        placements.append({"id": asset["id"], "name": asset["name"], "offset": offset, "bounds": bound})
    bpy.ops.mesh.primitive_plane_add(size=2)
    ground = bpy.context.object
    ground.name = "Sol Showcase"
    ground.scale = (floor[0] / 2, floor[1] / 2, 1)
    material = bpy.data.materials.new("Sol neutre")
    material.diffuse_color = (0.24, 0.27, 0.3, 1)
    ground.data.materials.append(material)
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    bpy.context.object.rotation_euler = (math.radians(25), math.radians(-30), 0)
    bpy.context.object.data.energy = 2
    distance = max(*floor, max((high[2] - low[2] for low, high in bounds), default=1))
    bpy.ops.object.camera_add(location=(distance, -distance, distance))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = distance * 1.8
    bpy.context.scene.camera = camera
    bpy.context.scene.world = bpy.data.worlds.new("Showcase")
    bpy.context.scene.world.color = (0.3, 0.3, 0.3)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_distance = distance * 1.6
                area.spaces.active.region_3d.view_location = (0, 0, 0)
                area.spaces.active.clip_end = max(1000, distance * 10)
    temporary = target.with_name("Showcase.building.blend")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(temporary), relative_remap=True)
    os.replace(temporary, target)
    save_json(target.with_suffix(".json"), {"signature": manifest["signature"], "placements": placements, "floor": floor, "errors": errors})


if __name__ == "__main__":
    job = Path(sys.argv[sys.argv.index("--") + 1])
    manifest = json.loads(job.read_text(encoding="utf-8"))
    if manifest.get("mode") == "library":
        build_catalog(manifest)
    else:
        build_showcase(manifest)
