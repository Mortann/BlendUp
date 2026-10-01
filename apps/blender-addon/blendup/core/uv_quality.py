"""UV quality measurements, independent of Blender and testable with small meshes.

The score measures validity, conformal stretch, density consistency and overlap.
Seams are diagnostics: their artistic placement cannot be graded objectively.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

ALGORITHM_VERSION = 1
EPSILON = 1e-12
MAX_OVERLAP_PAIRS = 2_000_000


@dataclass(frozen=True)
class UvPolicy:
    apply_transforms_on_save: bool = False
    unwrap_on_save: bool = False
    validate_uvs: bool = False
    minimum_uv_score: float = 70.0
    allow_uv_overlap: bool = False

    @classmethod
    def from_dict(cls, value: Any) -> "UvPolicy":
        value = value if isinstance(value, dict) else {}
        threshold = value.get("minimumUvScore", 70)
        if not isinstance(threshold, (int, float)) or isinstance(threshold, bool) or not math.isfinite(threshold):
            threshold = 70
        return cls(
            apply_transforms_on_save=value.get("applyTransformsOnSave") is True,
            unwrap_on_save=value.get("unwrapOnSave") is True,
            validate_uvs=value.get("validateUvs") is True,
            minimum_uv_score=min(100.0, max(1.0, float(threshold))),
            allow_uv_overlap=value.get("allowUvOverlap") is True,
        )


@dataclass(frozen=True)
class UvTriangle:
    object_name: str
    points: tuple[tuple[float, float, float], ...]
    uv: tuple[tuple[float, float], ...] | None


def _area_2d(points) -> float:
    return abs(sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(points, points[1:] + points[:1]))) / 2


def _cross(a, b, c) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def triangle_overlap_area(first, second) -> float:
    """Clip a triangle against another. Shared edges have zero overlap area."""
    polygon = list(first)
    orientation = 1 if _cross(*second) >= 0 else -1
    for a, b in zip(second, second[1:] + second[:1]):
        output = []
        if not polygon:
            return 0.0
        previous = polygon[-1]
        previous_side = orientation * _cross(a, b, previous)
        for current in polygon:
            current_side = orientation * _cross(a, b, current)
            if (current_side >= 0) != (previous_side >= 0):
                denominator = previous_side - current_side
                if abs(denominator) > EPSILON:
                    ratio = previous_side / denominator
                    output.append(tuple(previous[i] + ratio * (current[i] - previous[i]) for i in range(2)))
            if current_side >= 0:
                output.append(current)
            previous, previous_side = current, current_side
        polygon = output
    return _area_2d(polygon) if len(polygon) >= 3 else 0.0


def _triangle_measurement(triangle: UvTriangle) -> dict[str, float]:
    points = triangle.points
    if not all(math.isfinite(v) for point in points for v in point):
        return {"area": 0.0, "uvArea": 0.0, "stretch": 0.0}
    u = [points[1][i] - points[0][i] for i in range(3)]
    v = [points[2][i] - points[0][i] for i in range(3)]
    length = math.sqrt(sum(x * x for x in u))
    cross = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    twice_area = math.sqrt(sum(x * x for x in cross))
    area = twice_area / 2
    uv = triangle.uv
    if length <= EPSILON or twice_area <= EPSILON or uv is None or not all(math.isfinite(x) for point in uv for x in point):
        return {"area": area, "uvArea": 0.0, "stretch": 0.0}
    uv_area = _area_2d(uv)
    if uv_area <= EPSILON:
        return {"area": area, "uvArea": 0.0, "stretch": 0.0}
    projection = sum(x * y for x, y in zip(u, v)) / length
    height = twice_area / length
    # Jacobian from an orthonormal basis of the 3D triangle to UV coordinates.
    a = (uv[1][0] - uv[0][0]) / length
    c = (uv[1][1] - uv[0][1]) / length
    b = ((uv[2][0] - uv[0][0]) - a * projection) / height
    d = ((uv[2][1] - uv[0][1]) - c * projection) / height
    trace = a * a + b * b + c * c + d * d
    determinant = (a * d - b * c) ** 2
    largest = (trace + math.sqrt(max(0.0, trace * trace - 4 * determinant))) / 2
    stretch = math.sqrt(determinant) / largest if largest > EPSILON else 0.0
    return {"area": area, "uvArea": uv_area, "stretch": min(1.0, stretch)}


def _overlaps(triangles: list[UvTriangle], measurements: list[dict]) -> tuple[list[float], bool]:
    """Spatial hash avoids testing every pair; excessive work fails closed."""
    overlaps = [0.0] * len(triangles)
    valid = [i for i, value in enumerate(measurements) if value["uvArea"] > EPSILON]
    if len(valid) < 2:
        return overlaps, True
    bounds = {i: (min(p[0] for p in triangles[i].uv), min(p[1] for p in triangles[i].uv),
                  max(p[0] for p in triangles[i].uv), max(p[1] for p in triangles[i].uv)) for i in valid}
    minimum = (min(b[0] for b in bounds.values()), min(b[1] for b in bounds.values()))
    extent = max(max(b[2] for b in bounds.values()) - minimum[0], max(b[3] for b in bounds.values()) - minimum[1], EPSILON)
    cell_size = extent / min(256, max(8, int(math.sqrt(len(valid)))))
    grid: dict[tuple[int, int], list[int]] = {}
    large: list[int] = []
    previous: list[int] = []
    pair_count = 0
    for i in valid:
        box = bounds[i]
        x0, y0 = math.floor((box[0] - minimum[0]) / cell_size), math.floor((box[1] - minimum[1]) / cell_size)
        x1, y1 = math.floor((box[2] - minimum[0]) / cell_size), math.floor((box[3] - minimum[1]) / cell_size)
        is_large = (x1 - x0 + 1) * (y1 - y0 + 1) > 4096
        cells = [] if is_large else [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
        candidates = set(previous) if is_large else set(large)
        for cell in cells:
            candidates.update(grid.get(cell, ()))
        for j in candidates:
            other = bounds[j]
            if box[2] <= other[0] or other[2] <= box[0] or box[3] <= other[1] or other[3] <= box[1]:
                continue
            pair_count += 1
            if pair_count > MAX_OVERLAP_PAIRS:
                return overlaps, False
            area = triangle_overlap_area(triangles[i].uv, triangles[j].uv)
            if area > EPSILON:
                overlaps[i] = min(measurements[i]["uvArea"], overlaps[i] + area)
                overlaps[j] = min(measurements[j]["uvArea"], overlaps[j] + area)
        if is_large:
            large.append(i)
        else:
            for cell in cells:
                grid.setdefault(cell, []).append(i)
        previous.append(i)
    return overlaps, True


def measure_uv_quality(triangles: list[UvTriangle], policy: UvPolicy, seams: dict[str, dict] | None = None) -> dict:
    measurements = [_triangle_measurement(triangle) for triangle in triangles]
    overlaps, complete = _overlaps(triangles, measurements)
    groups: dict[str, list[int]] = {}
    for i, triangle in enumerate(triangles):
        groups.setdefault(triangle.object_name, []).append(i)
    objects = []
    issues = []
    for name, indices in groups.items():
        total = sum(measurements[i]["area"] for i in indices)
        valid = [i for i in indices if measurements[i]["area"] > EPSILON and measurements[i]["uvArea"] > EPSILON]
        valid_area = sum(measurements[i]["area"] for i in valid)
        coverage = valid_area / total if total > EPSILON else 0.0
        stretch = sum(measurements[i]["stretch"] * measurements[i]["area"] for i in valid) / valid_area if valid_area else 0.0
        log_densities = [(math.log(math.sqrt(measurements[i]["uvArea"] / measurements[i]["area"])), measurements[i]["area"]) for i in valid]
        average = sum(value * area for value, area in log_densities) / valid_area if valid_area else 0.0
        density = sum(math.exp(-abs(value - average)) * area for value, area in log_densities) / valid_area if valid_area else 0.0
        uv_area = sum(measurements[i]["uvArea"] for i in valid)
        overlap = min(1.0, sum(overlaps[i] for i in valid) / uv_area) if uv_area else 0.0
        missing = sum(triangles[i].uv is None for i in indices)
        degenerate = len(indices) - len(valid) - missing
        # Count invalid zero-area geometry too: it must not disappear from the score.
        validity = min(coverage, len(valid) / len(indices))
        score = 100 * validity * (0.8 * stretch + 0.2 * density) * (1 if policy.allow_uv_overlap else 1 - overlap)
        details = {"objectName": name, "score": round(score, 1), "triangleCount": len(indices),
                   "missingUvTriangles": missing, "degenerateTriangles": degenerate,
                   "validUvPercent": round(validity * 100, 1), "stretchScore": round(stretch * 100, 1),
                   "densityScore": round(density * 100, 1), "overlapPercent": round(overlap * 100, 1),
                   **((seams or {}).get(name, {}))}
        objects.append(details)
        if missing: issues.append(f"{name} : {missing} triangle(s) sans UV.")
        if degenerate: issues.append(f"{name} : {degenerate} triangle(s) dégénéré(s) ou UV invalides.")
        if stretch < 0.8 and valid: issues.append(f"{name} : étirement UV (qualité {stretch * 100:.0f}/100).")
        if overlap > 0.001 and not policy.allow_uv_overlap: issues.append(f"{name} : {overlap * 100:.1f} % de surface UV superposée.")
    if not complete: issues.append("Analyse des chevauchements trop complexe : vérification incomplète, export bloqué.")
    if not objects: issues.append("Aucun maillage avec des faces à vérifier.")
    # A small broken object cannot be hidden by a large correctly unwrapped object.
    score = min((obj["score"] for obj in objects), default=0.0)
    return {"algorithmVersion": ALGORITHM_VERSION, "score": score, "complete": complete,
            "objects": objects, "issues": issues, "allowUvOverlap": policy.allow_uv_overlap}


def passes_uv_gate(report: dict, policy: UvPolicy) -> bool:
    return bool(report.get("complete") and not report.get("error") and report.get("allowUvOverlap") == policy.allow_uv_overlap
                and isinstance(report.get("score"), (float, int)) and report["score"] >= policy.minimum_uv_score)


def uv_gate_message(report: dict, policy: UvPolicy) -> str:
    score = report.get("score")
    label = f"{score:.1f}/100" if isinstance(score, (int, float)) else "indisponible"
    details = " ".join(report.get("issues", [])[:4])
    return f"Export bloqué par le contrôle UV : score {label}, minimum {policy.minimum_uv_score:g}/100. {details}".strip()
