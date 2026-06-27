"""Operateurs de l'add-on BlendUp."""

from __future__ import annotations

import bpy

from . import export_ops, link_ops, template_ops, toggle_ops, validate_ops

_modules = (export_ops, validate_ops, link_ops, toggle_ops, template_ops)


def register():
    for module in _modules:
        for cls in module.classes:
            bpy.utils.register_class(cls)


def unregister():
    for module in reversed(_modules):
        for cls in reversed(module.classes):
            bpy.utils.unregister_class(cls)
