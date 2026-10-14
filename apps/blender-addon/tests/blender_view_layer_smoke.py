"""Real Blender regression for excluded collections and required armatures.

Run with -- <addon directory> <output directory>.
"""
import json
from pathlib import Path
import struct
import sys

import bpy


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    sys.path.insert(0, str(Path(args[0]).resolve()))
    from blendup.blender_export import export_objects, export_scene

    bpy.ops.wm.read_factory_settings(use_empty=True)
    context = bpy.context
    root = context.scene.collection
    high = bpy.data.collections.new("HIGH")
    root.children.link(high)
    nested = bpy.data.collections.new("Nested_HIGH")
    high.children.link(nested)

    def mesh(name, collection):
        data = bpy.data.meshes.new(name)
        data.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [], [(0, 1, 2)])
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        return obj

    game = mesh("GameMesh", root)
    hidden = mesh("HiddenGameMesh", root)
    mesh("HighMesh", high)
    mesh("NestedHighMesh", nested)
    shared = mesh("SharedMesh", nested)
    root.objects.link(shared)  # A visible collection keeps a shared object exportable.
    context.view_layer.layer_collection.children[high.name].exclude = True
    context.view_layer.update()
    hidden.hide_set(True)
    hidden.hide_select = True
    game.select_set(True)
    context.view_layer.objects.active = game
    expected = {game, hidden, shared}
    assert export_objects(context, False) == expected
    assert export_objects(context, True) == {game}

    rig = bpy.data.objects.new("RequiredExcludedRig", bpy.data.armatures.new("Rig"))
    nested.objects.link(rig)
    modifier = game.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    try:
        export_objects(context, False)
    except ValueError as error:
        assert rig.name in str(error) and context.view_layer.name in str(error)
    else:
        raise AssertionError("A required excluded armature must give an actionable error")
    game.modifiers.remove(modifier)
    # Remove the deliberately empty test armature before invoking Blender's glTF exporter.
    bpy.data.objects.remove(rig, do_unlink=True)

    output = Path(args[1]).resolve() / "ViewLayer.glb"
    export_scene(output, "glb", animations=False)
    assert hidden.hide_get() and hidden.hide_select
    assert context.view_layer.layer_collection.children[high.name].exclude
    assert set(context.selected_objects) == {game}
    assert context.view_layer.objects.active == game
    data = output.read_bytes()
    size = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + size])
    names = {node.get("name") for node in document["nodes"]}
    assert names == {obj.name for obj in expected}, names
    print("BLENDUP_VIEW_LAYER_SMOKE_OK excluded, nested, shared, selected, armature, restoration, GLB")


if __name__ == "__main__":
    main()
