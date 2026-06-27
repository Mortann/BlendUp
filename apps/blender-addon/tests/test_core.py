"""Tests du coeur logique de l'add-on BlendUp (sans Blender).

Lancement :
    python apps/blender-addon/tests/test_core.py
ou via pytest :
    pytest apps/blender-addon/tests/test_core.py

Ces tests ne dependent pas de `bpy`. Ils couvrent la detection de projet/asset,
la nomenclature, la validation, le format JSON et les helpers de liens.
"""

from __future__ import annotations

import os
import sys
import tempfile

# Rend le package `blendup` importable (apps/blender-addon sur le sys.path).
ADDON_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ADDON_ROOT not in sys.path:
    sys.path.insert(0, ADDON_ROOT)

from blendup.core import (  # noqa: E402
    assets,
    export_settings,
    jsonio,
    links,
    naming,
    project,
    relpaths,
    validation,
)


def _make_project(tmp: str) -> str:
    """Cree une mini structure .blendup dans `tmp` et retourne le root projet."""
    root = os.path.join(tmp, "Game1")
    os.makedirs(os.path.join(root, ".blendup", "assets"))
    os.makedirs(os.path.join(root, ".blendup", "naming"))
    os.makedirs(os.path.join(root, "Art", "Blender", "Props"))
    jsonio.write_json(
        os.path.join(root, ".blendup", "project.json"),
        {"schemaVersion": 1, "kind": "project", "name": "Game1"},
    )
    jsonio.write_json(
        os.path.join(root, ".blendup", "naming", "asset-naming.json"),
        {
            "schemaVersion": 1,
            "prefixes": ["PROP", "ENV"],
            "blenderSuffixes": ["_COL", "_LOD0"],
            "forbiddenNameFragments": ["test", "final"],
        },
    )
    jsonio.write_json(
        os.path.join(root, ".blendup", "assets", "asset_barrel.json"),
        {
            "schemaVersion": 1,
            "kind": "asset",
            "id": "asset_barrel",
            "displayName": "PROP_Barrel_01",
            "type": "prop",
            "status": "in_progress",
            "paths": {
                "blenderSource": "Art/Blender/Props/PROP_Barrel_01.blend",
                "fbxExport": "Unity/Assets/Models/Props/PROP_Barrel_01.fbx",
            },
            "export": {"autoExport": True, "lastExportStatus": "never_exported"},
        },
    )
    return root


def test_json_format_matches_backend():
    data = {"b": 2, "a": {"d": 4, "c": 3}}
    text = jsonio.dumps_blendup(data)
    assert text == '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 2\n}\n', repr(text)


def test_find_project_root():
    with tempfile.TemporaryDirectory() as tmp:
        root = _make_project(tmp)
        blend = os.path.join(root, "Art", "Blender", "Props", "PROP_Barrel_01.blend")
        found = project.find_project_root(blend)
        assert found == os.path.abspath(root), found
        assert project.find_project_root(tmp) is None


def test_find_asset_by_path_and_id():
    with tempfile.TemporaryDirectory() as tmp:
        root = _make_project(tmp)
        blend = os.path.join(root, "Art", "Blender", "Props", "PROP_Barrel_01.blend")

        asset, asset_file = assets.find_asset_for_blend(root, blend)
        assert asset is not None and asset["id"] == "asset_barrel"
        assert asset_file.endswith("asset_barrel.json")

        # Par id, meme si le chemin ne correspond pas.
        asset2, _ = assets.find_asset_for_blend(root, "/nowhere/x.blend", "asset_barrel")
        assert asset2 is not None and asset2["id"] == "asset_barrel"

        # Aucun match.
        none_asset, none_file = assets.find_asset_for_blend(root, "/nowhere/y.blend")
        assert none_asset is None and none_file is None


def test_export_mode_and_status():
    asset = {"export": {"autoExport": True}}
    assert assets.get_export_mode(asset) == "auto"
    asset["export"]["autoExport"] = False
    assert assets.get_export_mode(asset) == "manual"

    assets.set_export_mode(asset, "disabled", when="2026-01-01T00:00:00.000Z")
    assert asset["export"]["exportMode"] == "disabled"
    assert asset["export"]["autoExport"] is False
    assert assets.get_export_mode(asset) == "disabled"

    assets.set_export_status(asset, "success", when="2026-01-02T00:00:00.000Z")
    assert asset["export"]["lastExportStatus"] == "success"
    assert asset["status"] == "exported"
    assert asset["updatedAt"] == "2026-01-02T00:00:00.000Z"


def test_naming_checks():
    rules = {
        "prefixes": ["PROP", "ENV"],
        "blenderSuffixes": ["_COL", "_LOD0"],
        "forbiddenNameFragments": ["test", "final"],
    }
    assert naming.check_name("PROP_Barrel_01", rules) == []
    assert naming.check_name("PROP_Barrel_01_COL", rules) == []  # suffixe connu

    codes = {i["code"] for i in naming.check_name("Cube", rules)}
    assert "naming.prefix" in codes

    codes = {i["code"] for i in naming.check_name("PROP_final_01", rules)}
    assert "naming.forbidden" in codes


def test_validation_scene():
    rules = {"prefixes": ["PROP"], "blenderSuffixes": ["_COL"], "forbiddenNameFragments": []}

    empty = validation.validate_scene({"objects": []})
    assert validation.has_blocking(empty)

    ctx = {
        "unit_scale": 1.0,
        "objects": [
            {
                "name": "PROP_Barrel_01",
                "type": "MESH",
                "scale": (1.0, 1.0, 1.0),
                "material_names": ["MAT_Wood_01"],
                "exportable": True,
            }
        ],
        "material_names": ["MAT_Wood_01"],
    }
    asset = {"displayName": "PROP_Barrel_01"}
    assert validation.validate_scene(ctx, rules, asset) == []

    ctx["objects"][0]["scale"] = (2.0, 1.0, 1.0)
    ctx["objects"][0]["material_names"] = []
    ctx["material_names"] = ["Material"]
    codes = {i["code"] for i in validation.validate_scene(ctx, rules, asset)}
    assert "object.scale" in codes
    assert "object.no_material" in codes
    assert "material.generic_name" in codes


def test_export_settings_kwargs():
    kwargs = export_settings.build_fbx_kwargs("/tmp/out.fbx", {"use_selection": True})
    assert kwargs["filepath"] == "/tmp/out.fbx"
    assert kwargs["use_selection"] is True
    assert kwargs["object_types"] == {"EMPTY", "MESH", "ARMATURE"}
    assert kwargs["mesh_smooth_type"] == "FACE"


def test_links_and_relpaths():
    assert links.deep_link("asset_x") == "blendup://asset/asset_x"
    with tempfile.TemporaryDirectory() as tmp:
        path = links.write_open_request(tmp, "asset_x")
        payload = jsonio.read_json(path)
        assert payload["assetId"] == "asset_x"
        assert payload["kind"] == "open_request"

    assert relpaths.same_path("Art/Blender/X.blend", "art\\blender\\x.blend")


def _run_all():
    tests = [obj for name, obj in sorted(globals().items()) if name.startswith("test_")]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except AssertionError as error:
            failures += 1
            print(f"FAIL  {test.__name__}: {error}")
        except Exception as error:  # noqa: BLE001
            failures += 1
            print(f"ERROR {test.__name__}: {type(error).__name__}: {error}")
    print(f"\n{len(tests) - failures}/{len(tests)} tests OK")
    return failures


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
