"""Interface utilisateur de l'add-on BlendUp."""

from __future__ import annotations

import bpy

from . import panel

_modules = (panel,)


def register():
    for module in _modules:
        for cls in module.classes:
            bpy.utils.register_class(cls)


def unregister():
    for module in reversed(_modules):
        for cls in reversed(module.classes):
            bpy.utils.unregister_class(cls)
