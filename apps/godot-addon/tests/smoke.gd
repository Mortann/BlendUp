extends SceneTree

func _initialize() -> void:
    call_deferred("run_test")

func run_test() -> void:
    var args := OS.get_cmdline_user_args()
    var packed := load(args[0]) as PackedScene
    assert(packed != null, "Generated Showcase must load")
    var scene := packed.instantiate()
    root.add_child(scene)
    assert(scene.get_node("Sol") is MeshInstance3D)
    var count := 0
    for child in scene.get_children():
        if not child.scene_file_path.is_empty():
            count += 1
            var meshes := child.find_children("*", "MeshInstance3D", true, false)
            assert(not meshes.is_empty())
            for mesh in meshes:
                var bounds: AABB = mesh.global_transform * mesh.get_aabb()
                assert(abs(bounds.position.y) < 0.001, "Export instance must rest on the floor")
    assert(count == 2)
    var drag_script := load("res://addons/blendup/drag_list.gd") as Script
    var list: ItemList = drag_script.new()
    root.add_child(list)
    var index := list.add_item("Small")
    list.set_item_metadata(index, {"name":"Small", "godotReady":true, "resourcePath":"res://Assets/Props/Small/Small.glb"})
    var payload: Dictionary = list.drag_payload(index)
    assert(payload.get("type", "") == "files")
    assert(payload["files"] == PackedStringArray(["res://Assets/Props/Small/Small.glb"]))
    list.set_item_metadata(index, {"name":"Blocked", "godotReady":false, "resourcePath":null})
    assert(list.drag_payload(index).is_empty())
    list.free()
    scene.free()
    print("BLENDUP_GODOT_SMOKE_OK")
    quit(0)
