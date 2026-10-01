"""Lecture du projet BlendUp et calcul des chemins d'export."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


PROJECT_FILE = Path(".blendup") / "project.json"


@dataclass(frozen=True)
class ProjectInfo:
    root: Path
    project_id: str
    name: str
    engine: str
    art_root: str
    engine_root: str
    engine_assets_root: str


@dataclass(frozen=True)
class AssetLocation:
    project: ProjectInfo
    source: Path
    output: Path | None
    source_relative: str
    output_relative: str | None
    asset_id: str
    export_format: str | None


def normalize_relative(value: str) -> str:
    return value.strip().replace("\\", "/").strip("/")


def find_project_root(start: str | Path) -> Path | None:
    """Remonte depuis un fichier ou dossier jusqu'au premier projet BlendUp."""
    path = Path(start).expanduser()
    if path.is_file() or path.suffix:
        path = path.parent
    path = path.resolve()
    for candidate in (path, *path.parents):
        if (candidate / PROJECT_FILE).is_file():
            return candidate
    return None


def load_project(root: str | Path) -> ProjectInfo:
    root_path = Path(root).expanduser().resolve()
    with (root_path / PROJECT_FILE).open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return normalize_project(root_path, raw)


def normalize_project(root: Path, raw: dict[str, Any]) -> ProjectInfo:
    name = str(raw.get("name") or "").strip()
    if not name:
        raise ValueError("Le projet BlendUp n'a pas de nom.")
    paths = raw.get("paths") if isinstance(raw.get("paths"), dict) else {}
    explicit_engine = str(raw.get("engine") or "").lower()
    if explicit_engine and explicit_engine not in {"none", "godot", "unity"}:
        raise ValueError("Le type de projet doit être 3D, Godot ou Unity.")
    engine = explicit_engine or ("godot" if paths.get("godotRoot") else "unity")
    engine_label = "Godot" if engine == "godot" else "Unity"
    art_root = normalize_relative(str(paths.get("artRoot") or "Art"))
    engine_root = "" if engine == "none" else normalize_relative(str(
        paths.get("engineRoot")
        or paths.get("godotRoot" if engine == "godot" else "unityRoot")
        or engine_label
    ))
    engine_assets_root = "" if engine == "none" else normalize_relative(str(
        paths.get("engineAssetsRoot")
        or paths.get("godotAssetsRoot" if engine == "godot" else "unityAssetsRoot")
        or f"{engine_root}/Assets"
    ))
    return ProjectInfo(
        root=root,
        project_id=str(raw.get("projectId") or f"project_{slug(name)}"),
        name=name,
        engine=engine,
        art_root=art_root,
        engine_root=engine_root,
        engine_assets_root=engine_assets_root,
    )


def locate_asset(blend_file: str | Path, project: ProjectInfo | None = None) -> AssetLocation:
    source = Path(blend_file).expanduser().resolve()
    if source.suffix.lower() != ".blend":
        raise ValueError("Le fichier courant doit être un fichier .blend enregistré.")
    if project is None:
        root = find_project_root(source)
        if root is None:
            raise ValueError("Aucun projet BlendUp trouvé dans les dossiers parents.")
        project = load_project(root)
    art_path = (project.root / project.art_root).resolve()
    try:
        inside_art = source.relative_to(art_path)
    except ValueError as error:
        raise ValueError(f"Le fichier doit être placé dans {project.art_root}.") from error
    export_format = None if project.engine == "none" else "glb" if project.engine == "godot" else "fbx"
    output = None if export_format is None else project.root / project.engine_assets_root / managed_output_relative(inside_art, export_format)
    source_relative = relative_string(project.root, source)
    return AssetLocation(
        project=project,
        source=source,
        output=output,
        source_relative=source_relative,
        output_relative=relative_string(project.root, output) if output else None,
        asset_id=asset_id_for_path(source_relative),
        export_format=export_format,
    )


def managed_output_relative(source_relative: Path, export_format: str) -> Path:
    """Range les copies gérées dans leur dossier variants/ ou lods/."""
    stem = source_relative.stem
    folded_stem = stem.casefold()
    for marker, directory in ((".variant.", "variants"), (".lod.", "lods")):
        marker_index = folded_stem.rfind(marker)
        if marker_index <= 0:
            continue
        key = stem[marker_index + len(marker):].strip()
        if key:
            return source_relative.parent / directory / f"{key}.{export_format}"
    return source_relative.with_suffix(f".{export_format}")


def asset_id_for_path(path: str) -> str:
    """Même FNV-1a 64 bits que l'application Rust."""
    value = 14_695_981_039_346_656_037
    for byte in path.lower().encode("utf-8"):
        value ^= byte
        value = (value * 1_099_511_628_211) & 0xFFFFFFFFFFFFFFFF
    return f"asset_{value:016x}"


def relative_string(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def slug(value: str) -> str:
    result: list[str] = []
    for character in value.lower():
        if character.isascii() and character.isalnum():
            result.append(character)
        elif result and result[-1] != "_":
            result.append("_")
    return "".join(result).strip("_")
