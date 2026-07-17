"""Validation simple, lisible et utile avant export."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol


class MeshLike(Protocol):
    name: str
    scale: Iterable[float]
    has_uv: bool
    material_count: int
    non_manifold_edges: int


@dataclass(frozen=True)
class ValidationIssue:
    severity: str
    object_name: str
    message: str


def validate_meshes(meshes: Iterable[MeshLike]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for mesh in meshes:
        if any(abs(float(value) - 1.0) > 0.0001 for value in mesh.scale):
            issues.append(ValidationIssue("warning", mesh.name, "Échelle non appliquée"))
        if not mesh.has_uv:
            issues.append(ValidationIssue("warning", mesh.name, "Aucune UV"))
        if mesh.material_count == 0:
            issues.append(ValidationIssue("info", mesh.name, "Aucun matériau"))
        if mesh.non_manifold_edges > 0:
            issues.append(ValidationIssue("warning", mesh.name, f"{mesh.non_manifold_edges} arête(s) non-manifold"))
    return issues
