@tool
extends EditorPlugin

const Library = preload("library.gd")
var dock: VBoxContainer

func _enter_tree() -> void:
    dock = Library.new()
    dock.name = "BlendUp"
    dock.plugin = self
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
    if is_instance_valid(dock):
        remove_control_from_docks(dock)
        dock.queue_free()
