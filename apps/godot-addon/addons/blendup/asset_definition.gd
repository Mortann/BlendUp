@tool
extends Resource

# Shared by every placed instance. PackedScene references also make the variants
# dependencies of an exported game, without requiring BlendUp at runtime.
@export_storage var asset_id := ""
@export_storage var asset_name := ""
@export_storage var signature := ""
@export_storage var version_ids := PackedStringArray()
@export_storage var version_names := PackedStringArray()
@export_storage var version_statuses := PackedStringArray()
@export_storage var version_scenes: Array[PackedScene] = []

func index_of(id: String) -> int:
    return version_ids.find(id)

func is_available(index: int) -> bool:
    return index >= 0 and index < version_scenes.size() and version_scenes[index] != null
