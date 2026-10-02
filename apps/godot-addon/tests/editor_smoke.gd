@tool
extends EditorPlugin

func _enter_tree() -> void:
    call_deferred("run_test")

func run_test() -> void:
    for _frame in 20:
        await get_tree().process_frame
    var dock = get_editor_interface().get_base_control().find_child("BlendUp", true, false)
    assert(dock != null, "BlendUp dock must be present in the actual editor")
    assert(dock.list.item_count == 2)
    dock.search.text = "Tall"
    dock.redraw()
    assert(dock.list.item_count == 1)
    dock.search.text = ""
    dock.redraw()
    assert(not dock.list.drag_payload(0).is_empty())
    get_editor_interface().open_scene_from_path("res://BlendUp/Showcases/showcase-test.tscn")
    for _frame in 10:
        await get_tree().process_frame
    var scene := get_editor_interface().get_edited_scene_root()
    assert(scene != null)
    var count := scene.get_child_count()
    dock.list.select(0)
    dock.place_selected()
    assert(scene.get_child_count() == count + 1)
    assert(scene.get_child(-1).owner == scene)
    var manager: EditorUndoRedoManager = dock.plugin.get_undo_redo()
    var history: UndoRedo = manager.get_history_undo_redo(manager.get_object_history_id(scene))
    history.undo()
    assert(scene.get_child_count() == count)
    history.redo()
    assert(scene.get_child_count() == count + 1)
    # Native file drag and the panel's pre-placement selector use the wrapper.
    var small_index := -1
    for i in dock.list.item_count:
        if dock.list.get_item_metadata(i).get("name") == "Small":
            small_index = i
    assert(small_index >= 0)
    dock.list.select(small_index)
    dock.update_variant_choices()
    assert(dock.variants.item_count == 3)
    assert(dock.variants.is_item_disabled(2))
    dock.select_variant(1)
    assert(dock.list.drag_payload(small_index)["files"][0].ends_with("--variant-wide.tscn"))
    dock.place_selected()
    var instance = scene.get_child(-1)
    assert(instance.variant_id == "variant-wide")
    instance.position = Vector3(5, 1, -2)
    var placement: Transform3D = instance.transform
    get_editor_interface().inspect_object(instance)
    for _frame in 10:
        await get_tree().process_frame
    var property: EditorProperty
    for child in get_editor_interface().get_inspector().find_children("*", "EditorProperty", true, false):
        var script = child.get_script()
        if script != null and script.resource_path.ends_with("variant_property.gd"):
            property = child
            break
    assert(property != null, "The real inspector must show the variant dropdown")
    assert(property.get_edited_property() == "variant_id")
    property.choices.select(0)
    property.choices.item_selected.emit(0)
    for _frame in 5:
        await get_tree().process_frame
    assert(instance.variant_id == "original")
    assert(instance.transform.is_equal_approx(placement))
    history.undo()
    for _frame in 5:
        await get_tree().process_frame
    assert(instance.variant_id == "variant-wide", "Inspector changes must use Godot's undo history")
    assert(instance.transform.is_equal_approx(placement))
    print("BLENDUP_GODOT_EDITOR_SMOKE_OK")
    get_tree().quit(0)
