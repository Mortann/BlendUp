@tool
extends EditorPlugin

const Library = preload("library.gd")
const VariantInspector = preload("variant_inspector.gd")
var dock: VBoxContainer
var variant_inspector: EditorInspectorPlugin

func _enter_tree() -> void:
    variant_inspector = VariantInspector.new()
    add_inspector_plugin(variant_inspector)
    dock = Library.new()
    dock.name = "BlendUp"
    dock.plugin = self
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
    if variant_inspector != null:
        remove_inspector_plugin(variant_inspector)
    if is_instance_valid(dock):
        remove_control_from_docks(dock)
        dock.queue_free()
