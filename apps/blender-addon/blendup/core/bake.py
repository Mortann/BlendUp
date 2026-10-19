"""Conventions de bake, indépendantes de Blender (desktop et extension)."""
from __future__ import annotations

import re

ROLE_KEY = "blendup_bake_role"
PAIR_KEY = "blendup_bake_pair"
ROLES = {"LOW", "HIGH", "CAGE"}


def name_role(name: str) -> tuple[str, str]:
    # Blender's duplicate suffix permits several sources: Chair_HIGH.001, etc.
    value = re.sub(r"\.\d{3}$", "", name)
    match = re.match(r"^(.+?)[_. -](low|high|cage)$", value, re.IGNORECASE)
    return (match[1], match[2].upper()) if match else (name, "")


def object_role(obj) -> tuple[str, str]:
    role = str(obj.get(ROLE_KEY, "")).upper()
    pair = str(obj.get(PAIR_KEY, "")).strip()
    if role in ROLES and pair:
        return pair, role
    for collection in getattr(obj, "users_collection", ()):
        role = str(collection.get(ROLE_KEY, "")).upper()
        pair = str(collection.get(PAIR_KEY, "")).strip()
        if role in ROLES and pair:
            return pair, role
    return name_role(obj.name)


def bake_groups(objects) -> dict[str, dict]:
    meshes = [obj for obj in objects if obj.type == "MESH"]
    groups = {}
    for obj in meshes:
        key, role = object_role(obj)
        if role:
            group = groups.setdefault(key.casefold(), {"name": key, "LOW": [], "HIGH": [], "CAGE": []})
            group[role].append(obj)
    # Existing assets may use Plastron + Plastron_High without renaming the low.
    for obj in meshes:
        key, role = object_role(obj)
        group = groups.get(key.casefold())
        if not role and group and group["HIGH"]:
            group["LOW"].append(obj)
    return groups


def bake_helpers(objects) -> set:
    groups = bake_groups(objects)
    return {obj for group in groups.values() for role in ("HIGH", "CAGE") for obj in group[role]
            if group["LOW"] or str(obj.get(ROLE_KEY, "")).upper() in {"HIGH", "CAGE"}}


def texture_stem(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")
    if not value:
        raise ValueError("Le groupe de bake doit avoir un nom.")
    return value
