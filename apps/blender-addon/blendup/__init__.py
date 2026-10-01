bl_info = {
    "name": "BlendUp",
    "author": "BlendUp",
    "version": (0, 4, 2),
    "blender": (4, 2, 0),
    "location": "Vue 3D > Barre latérale > BlendUp",
    "description": "Gère les assets 3D BlendUp et les exports vers Godot ou Unity",
    "category": "Import-Export",
}

try:
    import bpy
except ModuleNotFoundError:  # Le cœur reste testable sans Blender.
    bpy = None

if bpy:
    from .handlers import register_handlers, unregister_handlers
    from .ops import CLASSES as OPERATOR_CLASSES
    from .prefs import BLENDUP_AddonPreferences
    from .ui import CLASSES as UI_CLASSES
    CLASSES = (BLENDUP_AddonPreferences, *OPERATOR_CLASSES, *UI_CLASSES)
else:
    CLASSES = ()


def register():
    if not bpy:
        raise RuntimeError("BlendUp doit être chargé depuis Blender.")
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.WindowManager.blendup_validation_summary = bpy.props.StringProperty(default="")
    register_handlers()


def unregister():
    if not bpy:
        return
    unregister_handlers()
    if hasattr(bpy.types.WindowManager, "blendup_validation_summary"):
        del bpy.types.WindowManager.blendup_validation_summary
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
