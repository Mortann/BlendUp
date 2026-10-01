"""Blender adapter shared by save handlers and headless desktop checks."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import time

import bpy

try:
    from .core.uv_quality import ALGORITHM_VERSION, UvPolicy, UvTriangle, measure_uv_quality, passes_uv_gate, uv_gate_message
except ImportError:  # Also embedded as standalone modules by the desktop application.
    from blendup_uv_quality import ALGORITHM_VERSION, UvPolicy, UvTriangle, measure_uv_quality, passes_uv_gate, uv_gate_message


def project_policy(root: Path) -> UvPolicy:
    raw = json.loads((root / ".blendup/project.json").read_text(encoding="utf-8"))
    return UvPolicy.from_dict(raw.get("blender"))


def _seam_diagnostics(mesh, layer) -> dict:
    sides = {}
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for first, second in zip(loops, loops[1:] + loops[:1]):
            a, b = mesh.loops[first].vertex_index, mesh.loops[second].vertex_index
            sides.setdefault(mesh.loops[first].edge_index, []).append({a: tuple(layer.data[first].uv), b: tuple(layer.data[second].uv)})
    marked, cuts, unused, unmarked = 0, 0, 0, 0
    for edge in mesh.edges:
        pair = sides.get(edge.index, [])
        if edge.use_seam: marked += 1
        if len(pair) != 2: continue
        split = any(any(abs(pair[0][vertex][axis] - pair[1][vertex][axis]) > 1e-6 for axis in (0, 1)) for vertex in edge.vertices)
        cuts += split
        unused += bool(edge.use_seam and not split)
        unmarked += bool(split and not edge.use_seam)
    return {"markedSeams": marked, "uvCuts": cuts, "unusedSeams": unused, "unmarkedCuts": unmarked}


def analyze_scene(policy: UvPolicy, context=None) -> dict:
    context = context or bpy.context
    triangles = []
    seams = {}
    depsgraph = context.evaluated_depsgraph_get()
    for obj in context.scene.objects:
        if obj.type != "MESH": continue
        if obj.mode == "EDIT": obj.update_from_editmode()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        try:
            if not mesh: continue
            mesh.calc_loop_triangles()
            layer = next((layer for layer in mesh.uv_layers if layer.active_render), mesh.uv_layers.active)
            for triangle in mesh.loop_triangles:
                points = tuple(tuple(evaluated.matrix_world @ mesh.vertices[index].co) for index in triangle.vertices)
                uv = tuple(tuple(layer.data[index].uv) for index in triangle.loops) if layer else None
                triangles.append(UvTriangle(obj.name, points, uv))
            if layer:
                seams[obj.name] = {"uvMap": layer.name, **_seam_diagnostics(mesh, layer)}
        finally:
            evaluated.to_mesh_clear()
    return measure_uv_quality(triangles, policy, seams)


def report_path(root: Path, source: Path) -> Path:
    return (root / ".blendup/uv-reports" / source.resolve().relative_to(root.resolve())).with_suffix(".json")


def write_report(root: Path, source: Path, report: dict, unsaved_changes=None) -> dict:
    stat = source.stat()
    report.update(sourcePath=source.resolve().relative_to(root.resolve()).as_posix(),
                  sourceSize=stat.st_size, sourceModifiedNs=str(stat.st_mtime_ns),
                  checkedAt=str(int(time.time())),
                  unsavedChanges=bool(bpy.data.is_dirty) if unsaved_changes is None else unsaved_changes)
    target = report_path(root, source)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(report, handle, ensure_ascii=False, allow_nan=False, indent=2)
        handle.write("\n")
    try:
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return report


def check_and_record(root: Path, source: Path, context=None, source_is_saved=False) -> dict:
    policy = project_policy(root)
    # Evaluating modifiers can dirty Blender's transient data without changing
    # the source. Record the state before evaluation, or the known saved state.
    unsaved = False if source_is_saved else bool(bpy.data.is_dirty)
    try:
        report = analyze_scene(policy, context)
    except Exception as error:
        report = {"algorithmVersion": ALGORITHM_VERSION, "score": 0.0, "complete": False,
                  "error": str(error), "objects": [], "issues": [f"Analyse UV impossible : {error}"],
                  "allowUvOverlap": policy.allow_uv_overlap}
    return write_report(root, source, report, unsaved_changes=unsaved)


def prepare_before_save(policy: UvPolicy, context=None) -> list[str]:
    """Apply L/R/S and unwrap all local meshes, restoring mode and selection."""
    context = context or bpy.context
    if not policy.apply_transforms_on_save and not policy.unwrap_on_save: return []
    active = context.view_layer.objects.active
    mode = active.mode if active else "OBJECT"
    selected = list(context.selected_objects)
    meshes = [obj for obj in context.scene.objects if obj.type == "MESH" and obj.data.polygons]
    warnings = []
    hidden = {}
    mesh_selection = {}
    uv_selection = {}
    uv_attributes = {}
    temporary = None
    try:
        if active and active.mode != "OBJECT": bpy.ops.object.mode_set(mode="OBJECT")
        for obj in meshes:
            if not obj.is_editable or not obj.data.is_editable:
                warnings.append(f"{obj.name} : maillage lié en lecture seule, préparation ignorée.")
                continue
            hidden[obj] = (obj.hide_get() if obj.name in context.view_layer.objects else False, obj.hide_viewport, obj.hide_select)
            mesh_selection[obj] = ([v.select for v in obj.data.vertices], [e.select for e in obj.data.edges], [p.select for p in obj.data.polygons])
            # Blender 5.2 stores UV selection in mesh attributes; older releases
            # expose per-layer selection flags on MeshUVLoop instead.
            uv_selection[obj] = (obj.data.uv_layers.active_index, {layer.name: [(loop.select, loop.select_edge) for loop in layer.data] for layer in obj.data.uv_layers if layer.data and hasattr(layer.data[0], "select")})
            uv_attributes[obj] = {attribute.name: (attribute.domain, [item.value for item in attribute.data]) for attribute in obj.data.attributes if attribute.name.startswith(".uv_select_") and attribute.data_type == "BOOLEAN"}
            obj.hide_viewport = False
            obj.hide_select = False
            if obj.name not in context.view_layer.objects:
                if temporary is None:
                    temporary = bpy.data.collections.new("BlendUp temporary preparation")
                    context.scene.collection.children.link(temporary)
                temporary.objects.link(obj)
                context.view_layer.update()
            obj.hide_set(False)
        context.view_layer.update()
        editable = list(hidden)
        bpy.ops.object.select_all(action="DESELECT")
        if policy.apply_transforms_on_save:
            for obj in editable:
                obj.select_set(True)
                context.view_layer.objects.active = obj
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True, isolate_users=True)
                obj.select_set(False)
        if policy.unwrap_on_save and editable:
            for obj in editable:
                obj.select_set(True)
                if not obj.data.uv_layers: obj.data.uv_layers.new(name="UVMap")
                render_layer = next((layer for layer in obj.data.uv_layers if layer.active_render), obj.data.uv_layers.active)
                obj.data.uv_layers.active = render_layer
            context.view_layer.objects.active = editable[0]
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.select_all(action="SELECT")
            bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.02)
            bpy.ops.object.mode_set(mode="OBJECT")
    finally:
        if context.object and context.object.mode != "OBJECT": bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        for obj, selections in mesh_selection.items():
            for elements, values in zip((obj.data.vertices, obj.data.edges, obj.data.polygons), selections):
                for element, value in zip(elements, values): element.select = value
            active_index, layers = uv_selection.get(obj, (0, {}))
            for name, values in layers.items():
                layer = obj.data.uv_layers.get(name)
                if layer:
                    for loop, (select, select_edge) in zip(layer.data, values):
                        loop.select, loop.select_edge = select, select_edge
            if obj.data.uv_layers: obj.data.uv_layers.active_index = active_index
            attributes = uv_attributes.get(obj, {})
            for attribute in list(obj.data.attributes):
                if attribute.name.startswith(".uv_select_") and attribute.name not in attributes:
                    obj.data.attributes.remove(attribute)
            for name, (domain, values) in attributes.items():
                attribute = obj.data.attributes.get(name) or obj.data.attributes.new(name, "BOOLEAN", domain)
                for item, value in zip(attribute.data, values): item.value = value
        for obj, (hide, viewport, selectable) in hidden.items():
            obj.hide_set(hide)
            obj.hide_viewport = viewport
            obj.hide_select = selectable
        if temporary: bpy.data.collections.remove(temporary)
        for obj in selected:
            if obj.name in context.view_layer.objects: obj.select_set(True)
        context.view_layer.objects.active = active
        if active and mode != "OBJECT": bpy.ops.object.mode_set(mode=mode)
    return warnings
