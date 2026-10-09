@tool
extends Node3D

const Definition = preload("asset_definition.gd")
@export_storage var definition: Resource:
    set(value):
        if definition != null and definition.changed.is_connected(refresh_model):
            definition.changed.disconnect(refresh_model)
        definition = value
        if definition != null:
            definition.changed.connect(refresh_model)
        if is_inside_tree():
            refresh_model.call_deferred()

# IDs remain stable when a variant is renamed or reordered in the library.
@export var variant_id := "original":
    set(value):
        variant_id = value
        if is_inside_tree():
            refresh_model()

var _model: Node
var _scene: PackedScene
var _signature := ""

func _ready() -> void:
    refresh_model()

func _notification(what: int) -> void:
    if what == NOTIFICATION_SCENE_INSTANTIATED:
        # The viewport also instantiates scenes outside the tree while dragging
        # them. Supply geometry there so placement previews and bounds work.
        refresh_model()

func refresh_model() -> void:
    var packed: PackedScene
    var signature := ""
    if definition is Definition:
        signature = definition.signature
        var index: int = definition.index_of(variant_id)
        if definition.is_available(index):
            packed = definition.version_scenes[index]
    if packed == _scene and signature == _signature and is_instance_valid(_model):
        return
    if is_instance_valid(_model):
        remove_child(_model)
        _model.queue_free()
    _model = null
    _scene = packed
    _signature = signature
    if packed != null:
        _model = packed.instantiate()
        _model.name = "Model"
        # Generated visuals have no owner: only the variant ID is saved in maps.
        # Keep gameplay children, transforms and references on this stable root.
        add_child(_model)
    if Engine.is_editor_hint() and is_inside_tree():
        update_configuration_warnings()
        notify_property_list_changed()

func _get_configuration_warnings() -> PackedStringArray:
    if not definition is Definition:
        return PackedStringArray(["Définition BlendUp manquante. Actualise la bibliothèque."])
    var index: int = definition.index_of(variant_id)
    if not definition.is_available(index):
        return PackedStringArray(["Cette variante est absente, modifiée ou bloquée. Exporte-la dans BlendUp ou choisis une autre variante."])
    return PackedStringArray()
