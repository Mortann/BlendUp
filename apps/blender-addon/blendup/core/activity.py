"""Journal d'activite `.blendup/logs/activity.jsonl` (format JSON Lines).

Entrees alignees sur la doc (docs/specs/02-modele-donnees.md) :
    {"time", "actor", "type", "assetId", "message"}
"""

from __future__ import annotations

import os
from typing import Optional

from . import jsonio

ACTIVITY_FILE = os.path.join(".blendup", "logs", "activity.jsonl")


def append_activity(
    project_root: str,
    actor: str,
    event_type: str,
    message: str,
    asset_id: Optional[str] = None,
) -> None:
    entry = {
        "time": jsonio.iso_now(),
        "actor": actor,
        "type": event_type,
        "assetId": asset_id,
        "message": message,
    }
    jsonio.append_jsonl(os.path.join(project_root, ACTIVITY_FILE), entry)
