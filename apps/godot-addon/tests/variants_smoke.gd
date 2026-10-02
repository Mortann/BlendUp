extends SceneTree

func _initialize() -> void:
    call_deferred("run_test")

func run_test() -> void:
    var catalog = load("res://addons/blendup/instance_catalog.gd")
    var project_root := ProjectSettings.globalize_path("res://").trim_suffix("/").get_base_dir()
    var index = JSON.parse_string(FileAccess.get_file_as_string(project_root.path_join(".blendup/library/index.json")))
    var asset: Dictionary
    for entry in index["assets"]:
        if entry["name"] == "Small":
            asset = catalog.synchronize(entry, project_root)
    assert(not asset.is_empty())
    assert(asset["godotReady"])
    assert(asset["variants"].size() == 2)
    var path: String = asset["placementPath"]
    var packed := load(path) as PackedScene
    var first = packed.instantiate()
    var second = packed.instantiate()
    assert(first.has_node("Model"), "Geometry must also exist before entering the tree for drag previews")
    assert(first.get_child_count() > 0, "Viewport bounding-box traversal must include the visual")
    var map := Node3D.new()
    root.add_child(map)
    map.add_child(first)
    map.add_child(second)
    first.owner = map
    second.owner = map
    first.position = Vector3(12, 3, -7)
    first.rotation = Vector3(0.2, 1.3, -0.4)
    first.scale = Vector3(0.5, 2, 3)
    var placement: Transform3D = first.transform
    var gameplay := Node3D.new()
    gameplay.name = "Gameplay"
    first.add_child(gameplay)
    gameplay.owner = map
    var undo := UndoRedo.new()
    undo.create_action("Choisir la variante")
    undo.add_do_property(first, "variant_id", "variant-wide")
    undo.add_undo_property(first, "variant_id", "original")
    undo.commit_action()
    assert(first.variant_id == "variant-wide")
    assert(first.get_node("Model").scene_file_path.ends_with("variants/wide.glb"))
    assert(first.transform.is_equal_approx(placement))
    assert(first.get_node("Gameplay") == gameplay)
    assert(second.variant_id == "original", "Each placed instance has its own variant")
    undo.undo()
    assert(first.variant_id == "original")
    undo.redo()
    assert(first.variant_id == "variant-wide")
    var saved := PackedScene.new()
    assert(saved.pack(map) == OK)
    assert(ResourceSaver.save(saved, "res://VariantMap.tscn") == OK)
    map.free()
    var restored = ResourceLoader.load("res://VariantMap.tscn", "PackedScene", ResourceLoader.CACHE_MODE_IGNORE).instantiate()
    root.add_child(restored)
    var restored_first = restored.get_child(0)
    assert(restored_first.variant_id == "variant-wide")
    assert(restored_first.transform.is_equal_approx(placement))
    assert(restored_first.has_node("Gameplay"))
    assert(restored_first.get_node("Model").scene_file_path.ends_with("variants/wide.glb"))
    assert(restored_first.definition.resource_path.ends_with(asset["id"] + ".tres"), "Definition must remain shared, not embedded")
    restored_first.variant_id = "variant-not-exported"
    assert(not restored_first.has_node("Model"), "Never substitute an unavailable version with another model")
    assert(not restored_first._get_configuration_warnings().is_empty())
    restored_first.variant_id = "variant-wide"
    # Reexports update every instance through the same shared Resource.
    var changed: Dictionary = index["assets"].filter(func(a): return a["name"] == "Small")[0].duplicate(true)
    changed["variants"][0]["godotReady"] = false
    changed["variants"][0]["status"] = "error"
    catalog.synchronize(changed, project_root)
    assert(not restored_first.has_node("Model"))
    restored.free()
    # A corrupt/missing dependency from an old generated definition is repairable.
    var definition_path := "res://BlendUp/Instances/repair.tres"
    var file := FileAccess.open(definition_path, FileAccess.WRITE)
    file.store_string('[gd_resource type="Resource" load_steps=3 format=3]\n[ext_resource type="Script" path="res://addons/blendup/asset_definition.gd" id="1"]\n[ext_resource type="PackedScene" path="res://cleared-export.glb" id="2"]\n[resource]\nscript = ExtResource("1")\nversion_scenes = Array[PackedScene]([ExtResource("2")])\n')
    file.close()
    var repair: Dictionary = index["assets"][0].duplicate(true)
    repair["id"] = "repair"
    var repaired: Dictionary = catalog.synchronize(repair, project_root)
    assert(repaired["godotReady"])
    print("BLENDUP_GODOT_VARIANTS_SMOKE_OK")
    quit(0)
