"""Shared desktop/add-on export: bind clips explicitly and bake the evaluated rig."""
from contextlib import contextmanager
from pathlib import Path
import json

import bpy


def slot_curves(action, slot=None):
    """Support both Blender 4.2 actions and the slotted actions introduced in 4.4."""
    if hasattr(action, "layers") and len(action.layers):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", ()):
                    if slot is None or bag.slot == slot:
                        yield from bag.fcurves
    else:
        yield from getattr(action, "fcurves", ())


def export_objects(context, selected_only):
    objects = set(context.selected_objects if selected_only else context.scene.objects)
    shapes = {bone.custom_shape for obj in context.scene.objects if obj.type == "ARMATURE"
              for bone in obj.pose.bones if bone.custom_shape}
    objects = {obj for obj in objects if obj not in shapes and obj.type in {"MESH", "ARMATURE", "EMPTY"}}
    # A selected mesh needs its deformation rig, even when only the mesh was selected.
    rigs = {modifier.object for obj in objects if obj.type == "MESH"
            for modifier in obj.modifiers if modifier.type == "ARMATURE" and modifier.object}
    rigs.update(obj.parent for obj in objects if obj.parent and obj.parent.type == "ARMATURE")
    objects.update(rigs)
    # Rigify's template is an editing aid, not a second game skeleton. Keep other rigs.
    if any(rig.data.get("rig_id") for rig in rigs):
        objects = {obj for obj in objects if not (obj.type == "ARMATURE" and obj not in rigs
                   and obj.name.lower().startswith("metarig") and not obj.animation_data)}
    return objects


def armature_clips(rigs):
    clips = {rig: [] for rig in rigs}
    for action in bpy.data.actions:
        # Single-frame pose-library assets are reusable poses, not game clips.
        if action.asset_data and action.frame_range[1] <= action.frame_range[0]:
            continue
        slots = list(action.slots) if hasattr(action, "slots") else [None]
        for slot in slots:
            if slot is not None and slot.target_id_type != "OBJECT":
                continue
            curves = list(slot_curves(action, slot))
            if not any(curve.data_path.startswith("pose.bones[") for curve in curves):
                continue
            compatible = []
            for rig in rigs:
                valid_bones = 0
                for curve in curves:
                    try:
                        rig.path_resolve(curve.data_path)
                        valid_bones += curve.data_path.startswith("pose.bones[")
                    except (ValueError, KeyError):
                        pass  # Stale controller curves must not discard an entire clip.
                if valid_bones:
                    compatible.append(rig)
            owners = []
            for rig in compatible:
                data = rig.animation_data
                assigned = data and (data.action == action or any(
                    strip.action == action for track in data.nla_tracks for strip in track.strips))
                named = slot is not None and slot.name_display == rig.name
                if assigned or named or (slot is not None and rig in slot.users()):
                    owners.append(rig)
            targets = owners or (compatible if len(compatible) == 1 else [])
            if compatible and not targets:
                print(f"BlendUp: action '{action.name}' ambiguë entre plusieurs rigs ; associe-la au rig dans Blender.")
            for rig in targets:
                clips[rig].append((action, slot))
    return clips


@contextmanager
def prepared_export(context, objects, animations):
    scene = context.scene
    selected = list(context.selected_objects)
    active = context.view_layer.objects.active
    mode = active.mode if active else "OBJECT"
    frame, subframe = scene.frame_current, scene.frame_subframe
    snapshots, added_tracks, added_curves = [], [], []
    visibility = [(obj, obj.hide_get(), obj.hide_select) for obj in objects]
    try:
        if mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.hide_set(False)
            obj.hide_select = False
            obj.select_set(True)
        rigs = [obj for obj in objects if obj.type == "ARMATURE"]
        clips = armature_clips(rigs) if animations else {}
        for rig, entries in clips.items():
            if not entries:
                continue
            had_data = rig.animation_data is not None
            data = rig.animation_data_create()
            snapshot = (rig, had_data, data.action, getattr(data, "action_slot", None),
                        data.use_nla, data.use_tweak_mode,
                        [(track, track.mute, track.is_solo, [(strip, strip.mute, strip.name) for strip in track.strips])
                         for track in data.nla_tracks],
                        [(bone, bone.matrix_basis.copy(), {key: bone[key] for key in bone.keys()})
                         for bone in rig.pose.bones])
            snapshots.append(snapshot)
            if data.use_tweak_mode:
                data.use_tweak_mode = False
            data.action = None
            data.use_nla = True
            for track in data.nla_tracks:
                track.mute = True
                track.is_solo = False
                for strip in track.strips:
                    strip.mute = True
                    strip.name = ".blendup-source-" + strip.name
            for action, slot in entries:
                # Blender resets unkeyed animated custom properties to their UI defaults.
                # Rigify IK/stretch settings often have saved values different from these
                # defaults. Temporary constant keys preserve that baseline in every clip.
                curves = list(slot_curves(action, slot))
                paths = {curve.data_path for curve in curves}
                if slot is not None:
                    bag = next((bag for layer in action.layers for action_strip in layer.strips
                                for bag in getattr(action_strip, "channelbags", ()) if bag.slot == slot), None)
                    collection = bag.fcurves if bag else None
                else:
                    collection = action.fcurves
                if collection is not None:
                    for bone in rig.pose.bones:
                        for key, value in bone.items():
                            path = f"pose.bones[{json.dumps(bone.name)}][{json.dumps(key)}]"
                            if path not in paths and isinstance(value, (bool, int, float)):
                                curve = collection.new(path)
                                added_curves.append((collection, curve))
                                curve.keyframe_points.insert(action.frame_range[0], float(value))
                                paths.add(path)
                track = data.nla_tracks.new()
                added_tracks.append((data, track))
                track.name = action.name
                start, end = action.frame_range
                strip = track.strips.new(action.name, int(start), action)
                strip.name = action.name
                if slot is not None:
                    strip.action_slot = slot
                strip.action_frame_start = start
                strip.action_frame_end = max(start + 1, end)
                strip.frame_start = start
                strip.frame_end = max(start + 1, end)
                strip.extrapolation = "NOTHING"
            print(f"BlendUp: {rig.name} — {len(entries)} clips : " + ", ".join(action.name for action, _ in entries))
        yield bool(added_tracks)
    finally:
        for collection, curve in reversed(added_curves):
            collection.remove(curve)
        for data, track in reversed(added_tracks):
            data.nla_tracks.remove(track)
        for rig, had_data, action, slot, use_nla, tweak, tracks, bones in snapshots:
            data = rig.animation_data
            data.action = action
            if action is not None and slot is not None:
                data.action_slot = slot
            data.use_nla = use_nla
            for track, mute, solo, strips in tracks:
                track.mute, track.is_solo = mute, solo
                for strip, strip_mute, strip_name in strips:
                    strip.mute = strip_mute
                    strip.name = strip_name
            for bone, matrix, properties in bones:
                bone.matrix_basis = matrix
                for key, value in properties.items():
                    bone[key] = value
            data.use_tweak_mode = tweak
            if not had_data:
                rig.animation_data_clear()
        scene.frame_set(frame, subframe=subframe)
        bpy.ops.object.select_all(action="DESELECT")
        for obj, hidden, hide_select in visibility:
            obj.hide_set(hidden)
            obj.hide_select = hide_select
        for obj in selected:
            obj.select_set(True)
        context.view_layer.objects.active = active
        if mode != "OBJECT" and active:
            bpy.ops.object.mode_set(mode=mode)


def export_scene(output, export_format, context=None, selected_only=False,
                 apply_modifiers=True, animations=True):
    context = context or bpy.context
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.stem + ".blendup-tmp" + output.suffix)
    objects = export_objects(context, selected_only)
    if not objects:
        raise ValueError("Aucun objet à exporter.")
    try:
        with prepared_export(context, objects, animations) as has_clips:
            if export_format == "glb":
                result = bpy.ops.export_scene.gltf(
                    filepath=str(temporary), export_format="GLB", use_selection=True,
                    export_apply=apply_modifiers, export_animations=animations,
                    export_animation_mode="ACTIONS", export_anim_single_armature=False,
                    export_frame_range=False, export_frame_step=1, export_force_sampling=True,
                    export_def_bones=True, export_hierarchy_flatten_bones=True,
                    export_anim_slide_to_zero=True,
                    export_reset_pose_bones=True, export_rest_position_armature=True,
                )
            elif export_format == "fbx":
                result = bpy.ops.export_scene.fbx(
                    filepath=str(temporary), use_selection=True, apply_unit_scale=True,
                    bake_space_transform=False, object_types={"EMPTY", "MESH", "ARMATURE"},
                    add_leaf_bones=False, use_armature_deform_only=True,
                    use_mesh_modifiers=apply_modifiers, bake_anim=animations,
                    bake_anim_use_all_actions=not has_clips, bake_anim_use_nla_strips=has_clips,
                    bake_anim_use_all_bones=True, bake_anim_step=1.0,
                    bake_anim_simplify_factor=0.0, mesh_smooth_type="FACE",
                )
            else:
                raise ValueError(f"Unsupported export format: {export_format}")
            if result != {"FINISHED"} or not temporary.is_file():
                raise RuntimeError("Blender n'a pas terminé l'export.")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
