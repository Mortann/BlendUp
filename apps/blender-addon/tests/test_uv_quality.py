from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blendup.core.uv_quality import UvPolicy, UvTriangle, measure_uv_quality, passes_uv_gate, triangle_overlap_area

POINTS = ((0, 0, 0), (1, 0, 0), (0, 1, 0))
UV = ((0, 0), (1, 0), (0, 1))


class UvQualityTests(unittest.TestCase):
    def measure(self, uv=UV, objects=None, policy=None):
        return measure_uv_quality(objects or [UvTriangle("Plane", POINTS, uv)], policy or UvPolicy())

    def test_uniform_rotation_scale_and_mirroring_preserve_quality(self):
        for uv in [UV, ((3, 4), (3, 6), (1, 4)), ((0, 0), (-1, 0), (0, 1))]:
            self.assertAlmostEqual(self.measure(uv)["score"], 100)

    def test_missing_collapsed_and_nonfinite_uvs_fail(self):
        for uv in [None, ((0, 0), (0, 0), (0, 0)), ((float("nan"), 0), (1, 0), (0, 1))]:
            report = self.measure(uv)
            self.assertEqual(report["score"], 0)
            self.assertFalse(passes_uv_gate(report, UvPolicy()))

    def test_stretch_reduces_quality(self):
        report = self.measure(((0, 0), (10, 0), (0, 1)))
        self.assertLess(report["score"], 70)
        self.assertTrue(report["issues"])

    def test_adjacent_triangles_sharing_an_edge_do_not_overlap(self):
        other_uv = ((1, 0), (1, 1), (0, 1))
        other_points = ((1, 0, 0), (1, 1, 0), (0, 1, 0))
        report = self.measure(objects=[UvTriangle("Plane", POINTS, UV), UvTriangle("Plane", other_points, other_uv)])
        self.assertEqual(report["score"], 100)
        self.assertEqual(triangle_overlap_area(UV, other_uv), 0)

    def test_overlap_across_different_objects_is_detected_and_can_be_allowed(self):
        triangles = [UvTriangle("A", POINTS, UV), UvTriangle("B", POINTS, UV)]
        self.assertEqual(self.measure(objects=triangles)["score"], 0)
        allowed = UvPolicy(allow_uv_overlap=True)
        report = self.measure(objects=triangles, policy=allowed)
        self.assertEqual(report["score"], 100)
        self.assertTrue(passes_uv_gate(report, allowed))
        self.assertFalse(passes_uv_gate(report, UvPolicy()))

    def test_partial_overlap_has_positive_area_for_both_windings(self):
        second = ((0.5, 0), (1.5, 0), (0.5, 1))
        self.assertAlmostEqual(triangle_overlap_area(UV, second), 0.125)
        self.assertAlmostEqual(triangle_overlap_area(UV, tuple(reversed(second))), 0.125)

    def test_density_variation_is_measured(self):
        triangles = [UvTriangle("A", POINTS, UV), UvTriangle("A", POINTS, ((2, 2), (4, 2), (2, 4)))]
        report = self.measure(objects=triangles)
        self.assertLess(report["objects"][0]["densityScore"], 100)

    def test_worst_mesh_defines_the_asset_score(self):
        report = self.measure(objects=[UvTriangle("Good", POINTS, UV), UvTriangle("Bad", POINTS, None)])
        self.assertEqual(report["score"], 0)

    def test_score_equal_to_threshold_passes(self):
        report = self.measure()
        self.assertTrue(passes_uv_gate(report, UvPolicy(minimum_uv_score=100)))

    def test_incomplete_overlap_analysis_fails_closed(self):
        with patch("blendup.core.uv_quality.MAX_OVERLAP_PAIRS", 0):
            report = self.measure(objects=[UvTriangle("A", POINTS, UV), UvTriangle("B", POINTS, UV)])
        self.assertFalse(report["complete"])
        self.assertFalse(passes_uv_gate(report, UvPolicy(minimum_uv_score=1, allow_uv_overlap=True)))

    def test_old_or_malformed_settings_are_safe_defaults(self):
        self.assertEqual(UvPolicy.from_dict(None), UvPolicy())
        self.assertEqual(UvPolicy.from_dict({"minimumUvScore": float("nan")}).minimum_uv_score, 70)
        self.assertEqual(UvPolicy.from_dict({"minimumUvScore": 200}).minimum_uv_score, 100)
        self.assertFalse(UvPolicy.from_dict({"unwrapOnSave": "false"}).unwrap_on_save)


if __name__ == "__main__": unittest.main(verbosity=2)
