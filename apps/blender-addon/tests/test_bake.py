from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blendup.core.bake import bake_groups, bake_helpers, name_role, texture_stem


class Mesh(dict):
    type = "MESH"
    users_collection = ()

    def __init__(self, name, **props):
        super().__init__(props)
        self.name = name

    __hash__ = object.__hash__
    __eq__ = object.__eq__


class BakeTests(unittest.TestCase):
    def test_existing_and_explicit_names(self):
        low, high, detail = Mesh("Plastron"), Mesh("Plastron_High"), Mesh("Plastron_HIGH.001")
        group = bake_groups([low, high, detail])["plastron"]
        self.assertEqual(group["LOW"], [low])
        self.assertEqual(group["HIGH"], [high, detail])
        self.assertEqual(bake_helpers([low, high, detail]), {high, detail})
        self.assertEqual(name_role("Étagère_LOW"), ("Étagère", "LOW"))

    def test_explicit_properties_survive_renaming(self):
        low = Mesh("Edited", blendup_bake_role="LOW", blendup_bake_pair="Armor")
        high = Mesh("Sculpt", blendup_bake_role="HIGH", blendup_bake_pair="Armor")
        self.assertEqual(bake_groups([low, high])["armor"]["HIGH"], [high])
        self.assertEqual(bake_helpers([low, high]), {high})

    def test_lone_high_is_not_removed_from_ordinary_assets(self):
        high = Mesh("Temple_HIGH")
        self.assertEqual(bake_helpers([high]), set())

    def test_paths_remain_single_filename(self):
        self.assertEqual(texture_stem("../Étagère:HIGH"), "_Étagère_HIGH")
        with self.assertRaises(ValueError):
            texture_stem(" . ")
