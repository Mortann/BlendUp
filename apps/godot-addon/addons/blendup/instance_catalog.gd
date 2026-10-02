@tool
extends RefCounted

const Definition = preload("asset_definition.gd")
const AssetInstance = preload("asset_instance.gd")
const DIRECTORY := "res://BlendUp/Instances"

static func versions(asset: Dictionary) -> Array:
    var original := asset.duplicate()
    original["id"] = "original"
    original["name"] = "Originale"
    original.erase("variants")
    var result: Array = [original]
    result.append_array(asset.get("variants", []).duplicate(true))
    return result

static func available(version: Dictionary, project_root: String) -> bool:
    var path: String = str(version.get("resourcePath")) if version.get("resourcePath") != null else ""
    if not version.get("godotReady", false) or not path.begins_with("res://") or path.contains("..") or not ResourceLoader.exists(path):
        return false
    var signature := str(version.get("sourceSignature", "")).split(":")
    if signature.size() == 2 and not project_root.is_empty():
        var recorded_seconds := int(int(signature[1]) / 1000000000)
        if FileAccess.get_modified_time(project_root.path_join(version.get("sourcePath", ""))) != recorded_seconds:
            return false
    return true

static func synchronize(asset: Dictionary, project_root: String) -> Dictionary:
    var display := asset.duplicate(true)
    var id: String = str(asset.get("id", ""))
    if id.is_empty() or id.validate_filename() != id:
        display["godotReady"] = false
        return display
    var all := versions(asset)
    var ready := false
    var first_id := "original"
    for version in all:
        version["godotReady"] = available(version, project_root)
        if not ready and version["godotReady"]:
            first_id = version["id"]
            ready = true
    var signature := JSON.stringify(all).sha256_text()
    var definition_path := DIRECTORY.path_join(id + ".tres")
    var definition = load(definition_path) if ResourceLoader.exists(definition_path) else Definition.new()
    if definition == null:
        # The old definition can lose GLB dependencies after exports are cleared.
        # Rebuild the managed resource from the index instead of getting stuck.
        definition = Definition.new()
    if not definition is Definition:
        display["godotReady"] = false
        return display
    DirAccess.make_dir_recursive_absolute(DIRECTORY)
    if definition.signature != signature:
        definition.asset_id = id
        definition.asset_name = asset.get("name", "Asset")
        definition.signature = signature
        definition.version_ids = PackedStringArray()
        definition.version_names = PackedStringArray()
        definition.version_statuses = PackedStringArray()
        definition.version_scenes.clear()
        for version in all:
            definition.version_ids.append(str(version.get("id", "")))
            definition.version_names.append(str(version.get("name", "Version")))
            definition.version_statuses.append(status_text(version.get("status", "ready")))
            var packed: PackedScene = ResourceLoader.load(version["resourcePath"], "PackedScene", ResourceLoader.CACHE_MODE_REPLACE) if version["godotReady"] else null
            definition.version_scenes.append(packed)
        if ResourceSaver.save(definition, definition_path) != OK:
            definition.signature = ""
            display["godotReady"] = false
            return display
        definition.take_over_path(definition_path)
        definition.emit_changed()
    # Native editor drag accepts files: each preset is a small wrapper with its
    # initial variant. All presets share the same live asset definition.
    for version in all:
        var version_id: String = str(version.get("id", ""))
        if version_id.is_empty() or version_id.validate_filename() != version_id:
            version["godotReady"] = false
            continue
        var suffix := "" if version_id == "original" else "--" + version_id
        var scene_path := DIRECTORY.path_join(id + suffix + ".tscn")
        if not FileAccess.file_exists(scene_path):
            var instance := AssetInstance.new()
            instance.name = str(asset.get("name", "Asset")).validate_node_name()
            instance.definition = definition
            instance.variant_id = version_id
            instance.set_meta("_edit_group_", true)
            var packed := PackedScene.new()
            var error := packed.pack(instance)
            instance.free()
            if error != OK or ResourceSaver.save(packed, scene_path) != OK:
                version["godotReady"] = false
                continue
        version["placementPath"] = scene_path
        if version_id == first_id:
            display["placementPath"] = scene_path
    display["godotReady"] = all.any(func(version): return version.get("godotReady", false) and version.has("placementPath"))
    display["placementVariant"] = first_id
    display["versions"] = all
    display["variants"] = all.slice(1)
    return display

static func status_text(status: String) -> String:
    match status:
        "error": return "Bloquée"
        "missing": return "Fichier absent"
        "outdated": return "À réexporter"
        _: return "À exporter"
