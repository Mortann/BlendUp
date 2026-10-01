@tool
extends ItemList

func _get_drag_data(at_position: Vector2) -> Variant:
    var index := get_item_at_position(at_position, true)
    var payload := drag_payload(index)
    if payload.is_empty():
        return null
    var preview := Label.new()
    preview.text = get_item_text(index)
    set_drag_preview(preview)
    return payload

func drag_payload(index: int) -> Dictionary:
    if index < 0:
        return {}
    var asset: Dictionary = get_item_metadata(index)
    var path: String = asset.get("resourcePath", "") if asset.get("resourcePath") != null else ""
    if not asset.get("godotReady", false) or path.is_empty() or not ResourceLoader.exists(path):
        return {}
    return {"type": "files", "files": PackedStringArray([path]), "from": self}
