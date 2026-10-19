"""Real Blender regression for hidden objects, collections and required armatures.

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
    disabled = mesh("DisabledGameMesh", root)
    disabled.hide_viewport = True
    unselectable = mesh("VisibleUnselectable", root)
    unselectable.hide_select = True
    render_hidden = mesh("ViewportVisibleRenderHidden", root)
    render_hidden.hide_render = True
    hidden_collection = bpy.data.collections.new("HiddenCollection")
    root.children.link(hidden_collection)
    mesh("CollectionHiddenMesh", hidden_collection)
    collection_nested = bpy.data.collections.new("NestedHiddenCollection")
    hidden_collection.children.link(collection_nested)
    mesh("NestedCollectionHiddenMesh", collection_nested)
    collection_shared = mesh("SharedWithHiddenCollection", hidden_collection)
    root.objects.link(collection_shared)
    context.view_layer.layer_collection.children[hidden_collection.name].hide_viewport = True
    disabled_collection = bpy.data.collections.new("DisabledCollection")
    root.children.link(disabled_collection)
    mesh("CollectionDisabledMesh", disabled_collection)
    disabled_collection.hide_viewport = True
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
    expected = {game, shared, unselectable, render_hidden, collection_shared}
    assert export_objects(context, False) == expected
    assert export_objects(context, True) == {game}
    # Even a stale selection must not leak a newly hidden object into the export.
    from types import SimpleNamespace
    selected_context = SimpleNamespace(scene=context.scene, view_layer=context.view_layer, selected_objects=[game, hidden, disabled])
    assert export_objects(selected_context, True) == {game}

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

    bpy.ops.object.armature_add()
    rig = context.object
    rig.name = "RequiredHiddenRig"
    modifier = game.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    rig.hide_set(True)
    try:
        export_objects(context, False)
    except ValueError as error:
        assert rig.name in str(error) and "masquée" in str(error)
    else:
        raise AssertionError("A visible mesh must not silently lose its hidden rig")
    game.modifiers.remove(modifier)
    bpy.data.objects.remove(rig, do_unlink=True)
    game.select_set(True)
    context.view_layer.objects.active = game

    output = Path(args[1]).resolve() / "ViewLayer.glb"
    export_scene(output, "glb", animations=False)
    assert hidden.hide_get() and hidden.hide_select
    assert disabled.hide_viewport and unselectable.hide_select and render_hidden.hide_render
    assert context.view_layer.layer_collection.children[hidden_collection.name].hide_viewport
    assert disabled_collection.hide_viewport
    assert context.view_layer.layer_collection.children[high.name].exclude
    assert set(context.selected_objects) == {game}
    assert context.view_layer.objects.active == game
    data = output.read_bytes()
    size = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + size])
    names = {node.get("name") for node in document["nodes"]}
    assert names == {obj.name for obj in expected}, names
    export_scene(output.with_suffix(".fbx"), "fbx", animations=False)
    hidden.hide_set(False)
    expected.add(hidden)
    assert export_objects(context, False) == expected
    hidden.hide_set(True)
    # Saving must preserve the eye flags used by desktop/background exports.
    bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")))
    bpy.ops.wm.open_mainfile(filepath=str(output.with_suffix(".blend")))
    export_scene(output.with_name("Reloaded.glb"), "glb", animations=False)
    reloaded = output.with_name("Reloaded.glb").read_bytes()
    size = struct.unpack_from("<I", reloaded, 12)[0]
    names = {node.get("name") for node in json.loads(reloaded[20:20 + size])["nodes"]}
    assert names == {"GameMesh", "SharedMesh", "VisibleUnselectable", "ViewportVisibleRenderHidden", "SharedWithHiddenCollection"}, names
    # Inspect actual FBX contents after importing into a fresh scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(output.with_suffix(".fbx")))
    names = {obj.name for obj in bpy.context.scene.objects if obj.type == "MESH"}
    assert names == {"GameMesh", "SharedMesh", "VisibleUnselectable", "ViewportVisibleRenderHidden", "SharedWithHiddenCollection"}, names
    print("BLENDUP_VIEW_LAYER_SMOKE_OK eye, viewport, collections, excluded, shared, selected, rigs, restoration, GLB, FBX, reload")


if __name__ == "__main__":
    main()
