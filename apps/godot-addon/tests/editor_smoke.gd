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
    print("BLENDUP_GODOT_EDITOR_SMOKE_OK")
    get_tree().quit(0)
