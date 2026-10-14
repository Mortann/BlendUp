"""Petit pont de fichiers entre BlendUp et une session Blender déjà ouverte."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import time


BRIDGE_DIRECTORY = Path(".blendup") / "blender-bridge"
REQUEST_FILE = BRIDGE_DIRECTORY / "open-request.json"
ACKNOWLEDGEMENT_FILE = BRIDGE_DIRECTORY / "open-ack.json"


@dataclass(frozen=True)
class OpenRequest:
    id: str
    blend_path: str
    expires_at_ms: int
    project_root: str = ""

    @property
    def expired(self) -> bool:
        return self.expires_at_ms < int(time.time() * 1_000)


def session_directory() -> Path:
    """Same per-user location as the desktop, including unnamed Blender files."""
    if os.environ.get("BLENDUP_SESSION_DIRECTORY"):
        return Path(os.environ["BLENDUP_SESSION_DIRECTORY"])
    base = Path(os.environ.get("APPDATA", "")) if os.name == "nt" else Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    return base / ("BlendUp" if os.name == "nt" else "blendup") / "blender-sessions"


def read_open_request(project_root: str | Path, directory: Path | None = None) -> OpenRequest | None:
    path = directory / "open-request.json" if directory else Path(project_root) / REQUEST_FILE
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        request_id = str(raw.get("id") or "").strip()
        blend_path = str(raw.get("blendPath") or "").strip()
        expires_at_ms = int(raw.get("expiresAtMs") or 0)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None
    if not request_id or not blend_path or not expires_at_ms:
        return None
    return OpenRequest(request_id, blend_path, expires_at_ms, str(raw.get("projectRoot") or ""))


def requested_blend_file(project_root: str | Path, request: OpenRequest) -> Path:
    root = Path(project_root).expanduser().resolve()
    relative = Path(request.blend_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("La demande d'ouverture sort du projet BlendUp.")
    target = (root / relative).resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise ValueError("La demande d'ouverture sort du projet BlendUp.") from error
    if target.suffix.lower() != ".blend" or not target.is_file():
        raise ValueError("Le fichier Blender demandé est introuvable.")
    return target


def acknowledge_open(project_root: str | Path, request_id: str, opened: bool, process_id: int | None = None, directory: Path | None = None) -> None:
    path = directory / "open-ack.json" if directory else Path(project_root) / ACKNOWLEDGEMENT_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    acknowledgement = {"id": request_id, "opened": opened}
    if process_id is not None:
        acknowledgement["processId"] = process_id
    temporary.write_text(
        json.dumps(acknowledgement, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def clear_open_request(project_root: str | Path, request_id: str, directory: Path | None = None) -> None:
    path = directory / "open-request.json" if directory else Path(project_root) / REQUEST_FILE
    request = read_open_request(project_root, directory)
    if request and request.id == request_id:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
