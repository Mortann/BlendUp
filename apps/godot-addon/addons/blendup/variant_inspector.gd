@tool
extends EditorInspectorPlugin

const AssetInstance = preload("asset_instance.gd")
const VariantProperty = preload("variant_property.gd")

func _can_handle(object: Object) -> bool:
    return object is AssetInstance

func _parse_property(object: Object, _type: Variant.Type, name: String, _hint: PropertyHint, _hint_string: String, _usage: int, _wide: bool) -> bool:
    if object is AssetInstance and name == "variant_id":
        var property := VariantProperty.new()
        property.label = "Variante"
        property.tooltip_text = "Version de cet asset BlendUp. Le placement est conservé ; le changement est annulable."
        add_property_editor(name, property)
        return true
    return false
