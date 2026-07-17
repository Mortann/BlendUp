"""Petit pont de fichiers entre BlendUp et une session Blender déjà ouverte."""

from __future__ import annotations

from dataclasses import dataclass
import json
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

    @property
    def expired(self) -> bool:
        return self.expires_at_ms < int(time.time() * 1_000)


def read_open_request(project_root: str | Path) -> OpenRequest | None:
    path = Path(project_root) / REQUEST_FILE
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        request_id = str(raw.get("id") or "").strip()
        blend_path = str(raw.get("blendPath") or "").strip()
        expires_at_ms = int(raw.get("expiresAtMs") or 0)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None
    if not request_id or not blend_path or not expires_at_ms:
        return None
    return OpenRequest(request_id, blend_path, expires_at_ms)


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


def acknowledge_open(project_root: str | Path, request_id: str, opened: bool) -> None:
    path = Path(project_root) / ACKNOWLEDGEMENT_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps({"id": request_id, "opened": opened}, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def clear_open_request(project_root: str | Path, request_id: str) -> None:
    path = Path(project_root) / REQUEST_FILE
    request = read_open_request(project_root)
    if request and request.id == request_id:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
