@tool
extends VBoxContainer

const DragList = preload("drag_list.gd")
const Catalog = preload("instance_catalog.gd")
var plugin: EditorPlugin
var project_root := ""
var assets: Array = []
var index_text := ""
var last_request := ""
var source_times := ""
var search: LineEdit
var folders: OptionButton
var list: ItemList
var summary: Label
var timer: Timer
var variants: OptionButton
var selected_versions: Dictionary = {}

func _ready() -> void:
    custom_minimum_size = Vector2(240, 250)
    project_root = find_project_root()
    search = LineEdit.new()
    search.placeholder_text = "Rechercher un asset ou un tag…"
    search.text_changed.connect(func(_value: String): redraw())
    add_child(search)
    folders = OptionButton.new()
    folders.item_selected.connect(func(_index: int): redraw())
    add_child(folders)
    list = DragList.new()
    list.size_flags_vertical = Control.SIZE_EXPAND_FILL
    list.icon_mode = ItemList.ICON_MODE_TOP
    list.fixed_icon_size = Vector2i(80, 80)
    list.fixed_column_width = 120
    list.max_columns = 0
    list.item_activated.connect(func(_index: int): place_selected())
    list.item_selected.connect(func(_index: int): update_variant_choices())
    add_child(list)
    variants = OptionButton.new()
    variants.tooltip_text = "Variante à placer. Elle pourra aussi être changée dans l’inspecteur une fois l’asset posé."
    variants.item_selected.connect(select_variant)
    add_child(variants)
    var actions := HBoxContainer.new()
    var place := Button.new()
    place.text = "Placer"
    place.tooltip_text = "Ajouter une instance dans la scène ouverte (annulable). Double-clic : placer."
    place.pressed.connect(place_selected)
    actions.add_child(place)
    var refresh := Button.new()
    refresh.text = "Actualiser"
    refresh.pressed.connect(func(): index_text = ""; refresh_index())
    actions.add_child(refresh)
    add_child(actions)
    summary = Label.new()
    summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(summary)
    plugin.get_editor_interface().get_resource_filesystem().filesystem_changed.connect(filesystem_changed)
    timer = Timer.new()
    timer.wait_time = 1.0
    timer.timeout.connect(tick)
    add_child(timer)
    timer.start()
    tick()

static func find_project_root() -> String:
    var current := ProjectSettings.globalize_path("res://").trim_suffix("/")
    while not current.is_empty():
        if FileAccess.file_exists(current.path_join(".blendup/project.json")):
            var config = JSON.parse_string(FileAccess.get_file_as_string(current.path_join(".blendup/project.json")))
            if config is Dictionary and config.get("engine", "") == "godot":
                var engine_path: String = current.path_join(config.get("paths", {}).get("engineRoot", "Godot")).simplify_path()
                if engine_path == ProjectSettings.globalize_path("res://").trim_suffix("/").simplify_path():
                    return current
            return ""
        var parent := current.get_base_dir()
        if parent == current:
            break
        current = parent
    return ""

func tick() -> void:
    refresh_index()
    var times := ""
    for asset in assets:
        times += str(FileAccess.get_modified_time(project_root.path_join(asset.get("sourcePath", "")))) + ";"
        for version in asset.get("variants", []):
            times += str(FileAccess.get_modified_time(project_root.path_join(version.get("sourcePath", "")))) + ";"
    if times != source_times:
        source_times = times
        redraw()
    if project_root.is_empty():
        return
    var request_path := project_root.path_join(".blendup/bridge/godot-open.json")
    if not FileAccess.file_exists(request_path):
        return
    var request = JSON.parse_string(FileAccess.get_file_as_string(request_path))
    if not request is Dictionary:
        return
    var id: String = str(request.get("id", ""))
    var scene: String = request.get("scene", "")
    if id == last_request or id.is_empty() or not scene.begins_with("res://BlendUp/Showcases/") or scene.contains(".."):
        return
    if abs(Time.get_unix_time_from_system() * 1000.0 - float(id)) > 15000.0:
        return
    last_request = id
    if ResourceLoader.exists(scene):
        plugin.get_editor_interface().open_scene_from_path(scene)
        var ack := FileAccess.open(project_root.path_join(".blendup/bridge/godot-open-ack.json"), FileAccess.WRITE)
        if ack:
            ack.store_string(JSON.stringify({"id": id}))

func filesystem_changed() -> void:
    index_text = ""
    refresh_index()

func refresh_index() -> void:
    if project_root.is_empty():
        summary.text = "Ce projet Godot n’est pas associé à un projet BlendUp."
        return
    var path := project_root.path_join(".blendup/library/index.json")
    if not FileAccess.file_exists(path):
        summary.text = "Ouvre le projet dans BlendUp pour initialiser la bibliothèque."
        return
    var text := FileAccess.get_file_as_string(path)
    if text == index_text:
        return
    var index = JSON.parse_string(text)
    if not index is Dictionary:
        return
    index_text = text
    assets = index.get("assets", [])
    var previous: String = folders.get_item_metadata(folders.selected) if folders.selected >= 0 else ""
    folders.clear()
    folders.add_item("Tous les dossiers")
    folders.set_item_metadata(0, "")
    var paths: Array[String] = []
    for asset in assets:
        var folder: String = asset.get("folder", "")
        if not paths.has(folder):
            paths.append(folder)
    paths.sort()
    for folder in paths:
        folders.add_item(folder)
        folders.set_item_metadata(folders.item_count - 1, folder)
        if folder == previous:
            folders.select(folders.item_count - 1)
    redraw()

func redraw() -> void:
    var selected_id := ""
    var selection := list.get_selected_items()
    if not selection.is_empty():
        selected_id = list.get_item_metadata(selection[0]).get("id", "")
    list.clear()
    var query := search.text.to_lower().strip_edges()
    var folder: String = folders.get_item_metadata(folders.selected) if folders.selected >= 0 else ""
    var missing := 0
    for asset in assets:
        var display_asset: Dictionary = Catalog.synchronize(asset, project_root)
        var asset_folder: String = asset.get("folder", "")
        if not folder.is_empty() and asset_folder != folder and not asset_folder.begins_with(folder + "/"):
            continue
        var searchable: String = str(asset.get("name", "")) + " " + asset_folder + " " + str(asset.get("tags", []))
        if not query.is_empty() and not searchable.to_lower().contains(query):
            continue
        var i := list.add_item(asset.get("name", "Asset"), get_theme_icon("MeshInstance3D", "EditorIcons"))
        list.set_item_metadata(i, asset)
        var preferred: String = selected_versions.get(asset.get("id", ""), display_asset.get("placementVariant", "original"))
        apply_version(display_asset, preferred)
        var ready: bool = display_asset.get("godotReady", false)
        var path: String = str(display_asset.get("previewPath", ""))
        list.set_item_metadata(i, display_asset)
        list.set_item_tooltip(i, asset_folder + "\n%d variante(s)" % asset.get("variants", []).size() + ("\nGlisse dans la vue 3D ; choisis ensuite la variante dans l’inspecteur." if ready else "\nExport manquant, modifié ou bloqué : actualise dans BlendUp."))
        if ready:
            plugin.get_editor_interface().get_resource_previewer().queue_resource_preview(path, self, "preview_ready", asset.get("id", ""))
        else:
            missing += 1
            list.set_item_custom_fg_color(i, Color(0.65, 0.65, 0.65))
        if asset.get("id", "") == selected_id:
            list.select(i)
    summary.text = "%d assets · %d à exporter\nAprès placement : Inspecteur → Variante." % [list.item_count, missing]
    update_variant_choices()

static func apply_version(asset: Dictionary, version_id: String) -> void:
    for version in asset.get("versions", []):
        if version.get("id", "") == version_id:
            asset["placementVariant"] = version_id
            asset["godotReady"] = version.get("godotReady", false)
            asset["placementPath"] = version.get("placementPath", "")
            asset["previewPath"] = version.get("resourcePath", "") if version.get("resourcePath") != null else ""
            return

func update_variant_choices() -> void:
    variants.clear()
    var selection := list.get_selected_items()
    if selection.is_empty():
        variants.add_item("Choisir un asset pour voir ses variantes")
        variants.disabled = true
        return
    variants.disabled = false
    var asset: Dictionary = list.get_item_metadata(selection[0])
    for version in asset.get("versions", []):
        var label: String = version.get("name", "Version")
        if not version.get("godotReady", false):
            label += " · " + Catalog.status_text(version.get("status", "ready"))
        variants.add_item(label)
        var i := variants.item_count - 1
        variants.set_item_metadata(i, version.get("id", ""))
        variants.set_item_disabled(i, not version.get("godotReady", false))
        if version.get("id") == asset.get("placementVariant"):
            variants.select(i)

func select_variant(index: int) -> void:
    var selection := list.get_selected_items()
    if selection.is_empty():
        return
    var i := selection[0]
    var asset: Dictionary = list.get_item_metadata(i)
    var id: String = variants.get_item_metadata(index)
    selected_versions[asset.get("id", "")] = id
    apply_version(asset, id)
    list.set_item_metadata(i, asset)
    if asset.get("godotReady", false):
        plugin.get_editor_interface().get_resource_previewer().queue_resource_preview(asset.get("previewPath", ""), self, "preview_ready", asset.get("id", ""))

func preview_ready(path: String, preview: Texture2D, _small: Texture2D, asset_id: Variant) -> void:
    if not is_instance_valid(list) or preview == null:
        return
    for i in list.item_count:
        if list.get_item_metadata(i).get("id", "") == asset_id and list.get_item_metadata(i).get("previewPath", path) == path:
            list.set_item_icon(i, preview)
            break

func place_selected() -> void:
    var selected := list.get_selected_items()
    if selected.is_empty():
        return
    var asset: Dictionary = list.get_item_metadata(selected[0])
    if not asset.get("godotReady", false):
        return
    var root := plugin.get_editor_interface().get_edited_scene_root()
    if root == null:
        summary.text = "Ouvre ou crée une scène 3D pour placer un asset."
        return
    var packed := load(str(asset.get("placementPath", asset.get("resourcePath", "")))) as PackedScene
    if packed == null:
        return
    var instance := packed.instantiate()
    instance.name = asset.get("name", "Asset")
    var undo := plugin.get_undo_redo()
    undo.create_action("Placer un asset BlendUp", UndoRedo.MERGE_DISABLE, root)
    undo.add_do_method(root, "add_child", instance, true)
    undo.add_do_method(instance, "set_owner", root)
    undo.add_do_reference(instance)
    undo.add_undo_method(root, "remove_child", instance)
    undo.commit_action()
    plugin.get_editor_interface().get_selection().clear()
    plugin.get_editor_interface().get_selection().add_node(instance)
