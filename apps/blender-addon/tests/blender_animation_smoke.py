"""Real Blender regression: clip discovery, Rigify settings, timing and sampled poses.

Run with -- <addon directory> <output directory> [character.blend].
The optional character is opened read-only; exports stay in the output directory.
"""
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


def read_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length]), data[28 + length:]


def accessor(gltf, binary, index):
    data = gltf["accessors"][index]
    view = gltf["bufferViews"][data["bufferView"]]
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[data["type"]]
    assert data["componentType"] == 5126
    stride = view.get("byteStride", width * 4)
    offset = view.get("byteOffset", 0) + data.get("byteOffset", 0)
    return [struct.unpack_from("<" + "f" * width, binary, offset + i * stride) for i in range(data["count"])]


def check_poses(gltf, binary, samples, fps):
    parents = {child: i for i, node in enumerate(gltf["nodes"]) for child in node.get("children", [])}
    error = 0
    for (name, frame), expected in samples.items():
        animation = next(item for item in gltf["animations"] if item["name"] == name)
        transforms = {i: {"translation": node.get("translation", [0, 0, 0]),
                          "rotation": node.get("rotation", [0, 0, 0, 1]), "scale": node.get("scale", [1, 1, 1])}
                      for i, node in enumerate(gltf["nodes"])}
        for channel in animation["channels"]:
            sampler = animation["samplers"][channel["sampler"]]
            times = accessor(gltf, binary, sampler["input"])
            index = min(range(len(times)), key=lambda i: abs(times[i][0] - frame / fps))
            transforms[channel["target"]["node"]][channel["target"]["path"]] = accessor(gltf, binary, sampler["output"])[index]
        worlds = {}

        def world(index):
            if index not in worlds:
                transform = transforms[index]
                q = transform["rotation"]
                local = Matrix.LocRotScale(Vector(transform["translation"]), Quaternion((q[3], *q[:3])), Vector(transform["scale"]))
                worlds[index] = world(parents[index]) @ local if index in parents else local
            return worlds[index]

        for index, node in enumerate(gltf["nodes"]):
            if node.get("name") not in expected:
                continue
            reference = expected[node["name"]]
            error = max(error, max(abs(world(index)[r][c] - reference[r][c]) for r in range(4) for c in range(4)))
        times = [accessor(gltf, binary, sampler["input"]) for sampler in animation["samplers"]]
        assert abs(min(values[0][0] for values in times)) < 1e-6, name
    assert error < 0.002, f"Exported joint matrices differ from Blender: {error}"
    print(f"Sampled joint matrices: max error {error:.8f}")


def synthetic_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for name, offset in [("RigA", 0), ("RigB", 3)]:
        bpy.ops.object.armature_add(location=(offset, 0, 0))
        rig = bpy.context.object
        rig.name = name
        rig.data["rig_id"] = "smoke"
        bpy.ops.object.mode_set(mode="EDIT")
        control = rig.data.edit_bones[0]
        control.name = "control"
        control.use_deform = False
        bone = rig.data.edit_bones.new("DEF-bone" + name)
        bone.head, bone.tail = (0, 0, 0), (0, 0, 1)
        bone_name = bone.name
        bpy.ops.object.mode_set(mode="OBJECT")
        constraint = rig.pose.bones[bone_name].constraints.new("COPY_TRANSFORMS")
        constraint.target, constraint.subtarget = rig, "control"
        control = rig.pose.bones["control"]
        control["stretch"] = 0.0
        control.id_properties_ui("stretch").update(default=1.0)
        for clip, first, last in [("move_" + name, 10, 40), ("hit_" + name, 50, 70)]:
            rig.animation_data_create().action = None
            for frame, value in [(first, 0), (last, 1)]:
                control.location.x = value
                control.keyframe_insert("location", frame=frame, group="control")
            rig.animation_data.action.name = clip
            rig.animation_data.action.use_fake_user = True
        rig.animation_data.action = None
        action = bpy.data.actions["move_" + name]
        track = rig.animation_data.nla_tracks.new()
        track.strips.new("move", 1, action)
        track.strips.new("repeat", 41, action)
        bpy.ops.mesh.primitive_cube_add(size=0.5, location=(offset, 0, 0.5))
        mesh = bpy.context.object
        modifier = mesh.modifiers.new("Armature", "ARMATURE")
        modifier.object = rig
        group = mesh.vertex_groups.new(name="DEF-bone" + name)
        group.add(list(range(len(mesh.data.vertices))), 1, "REPLACE")
    bpy.ops.object.armature_add()
    bpy.context.object.name = "metarig"
    bpy.context.scene.render.fps = 60
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 5
    bpy.context.scene.frame_set(3)


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    sys.path.insert(0, str(Path(args[0]).resolve()))
    from blendup.blender_export import armature_clips, export_objects, export_scene, prepared_export, slot_curves
    output = Path(args[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if len(args) > 2:
        bpy.ops.wm.open_mainfile(filepath=str(Path(args[2]).resolve()))
    else:
        synthetic_scene()
    objects = export_objects(bpy.context, False)
    rigs = [obj for obj in objects if obj.type == "ARMATURE"]
    clips = armature_clips(rigs)
    expected = {action.name for entries in clips.values() for action, _ in entries}
    assert expected
    source_frame = bpy.context.scene.frame_current
    selection = {obj.name for obj in bpy.context.selected_objects}
    curves_before = {action.name: len(list(slot_curves(action))) for action in bpy.data.actions}
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    samples = {}
    axes = Matrix.Rotation(-math.pi / 2, 4, "X")
    with prepared_export(bpy.context, objects, True):
        for rig, entries in clips.items():
            rig.animation_data.use_nla = False
            for action, slot in entries:
                rig.animation_data.action = action
                if slot is not None:
                    rig.animation_data.action_slot = slot
                start, end = map(int, action.frame_range)
                for frame in [start, (start + end) // 2, end]:
                    for bone in rig.pose.bones:
                        bone.matrix_basis = Matrix()
                    bpy.context.scene.frame_set(frame)
                    evaluated = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
                    samples[(action.name, frame - start)] = {
                        bone.name: axes @ evaluated.matrix_world @ bone.matrix
                        for bone in evaluated.pose.bones if bone.bone.use_deform}
    glb = output / "Character.glb"
    export_scene(glb, "glb")
    gltf, binary = read_glb(glb)
    assert expected <= {item["name"] for item in gltf["animations"]}
    assert len(gltf["skins"]) == len(rigs)
    assert not any(node.get("name", "").startswith(("metarig", "WGT-")) for node in gltf["nodes"])
    check_poses(gltf, binary, samples, fps)
    export_scene(output / "Character.fbx", "fbx")
    assert bpy.context.scene.frame_current == source_frame
    assert {obj.name for obj in bpy.context.selected_objects} == selection
    assert curves_before == {action.name: len(list(slot_curves(action))) for action in bpy.data.actions}
    old_export = glb.read_bytes()
    try:
        export_scene(glb, "unsupported")
        raise AssertionError("Invalid format must fail")
    except ValueError:
        pass
    assert glb.read_bytes() == old_export
    # Verify actual FBX takes by importing into a fresh scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(output / "Character.fbx"))
    imported = {action.name.rsplit("|", 1)[-1] for action in bpy.data.actions}
    assert expected <= imported, (expected, imported)
    print("BLENDUP_ANIMATION_SMOKE_OK", ", ".join(sorted(expected)))


if __name__ == "__main__":
    main()
