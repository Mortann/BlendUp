@tool
extends EditorProperty

var choices := OptionButton.new()

func _init() -> void:
    add_child(choices)
    add_focusable(choices)
    choices.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    choices.item_selected.connect(func(index: int):
        emit_changed(get_edited_property(), choices.get_item_metadata(index)))

func _update_property() -> void:
    var object = get_edited_object()
    if object == null or object.definition == null:
        return
    var definition = object.definition
    var selected: String = object.variant_id
    choices.clear()
    for i in definition.version_ids.size():
        var available: bool = definition.is_available(i)
        var label: String = definition.version_names[i]
        if not available:
            label += " · " + definition.version_statuses[i]
        choices.add_item(label)
        choices.set_item_metadata(i, definition.version_ids[i])
        choices.set_item_disabled(i, not available)
        if selected == definition.version_ids[i]:
            choices.select(i)
    if definition.index_of(selected) < 0:
        choices.add_item("Variante supprimée · " + selected)
        choices.set_item_metadata(choices.item_count - 1, selected)
        choices.set_item_disabled(choices.item_count - 1, true)
        choices.select(choices.item_count - 1)

func _set_read_only(read_only: bool) -> void:
    choices.disabled = read_only
