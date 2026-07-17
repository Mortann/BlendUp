"""Génère des copies Blender avec un modificateur Decimate non destructif.

Arguments après ``--`` : source.blend, puis des paires cible.blend / ratio.
Le modificateur reste éditable dans chaque copie et sera appliqué à l'export.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys

import bpy


def disable_blendup_auto_export() -> None:
    """Empêche un add-on déjà installé d'exporter chaque copie pendant sa création."""
    os.environ["BLENDUP_LOD_GENERATION"] = "1"
    for callback in list(bpy.app.handlers.save_post):
        if callback.__name__ == "export_after_save" and callback.__module__.startswith("blendup"):
            bpy.app.handlers.save_post.remove(callback)


def generate(source: Path, targets: list[tuple[Path, float]]) -> None:
    disable_blendup_auto_export()
    for target, ratio in targets:
        bpy.ops.wm.open_mainfile(filepath=str(source))
        for obj in bpy.data.objects:
            if obj.type != "MESH":
                continue
            modifier = obj.modifiers.new(name="BlendUp LOD", type="DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = max(0.01, min(1.0, ratio))
            modifier.use_collapse_triangulate = True
        target.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(target))


def main() -> None:
    if "--" not in sys.argv:
        raise RuntimeError("Arguments BlendUp manquants.")
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) < 3 or (len(args) - 1) % 2:
        raise RuntimeError("Source et paires cible/ratio attendues.")
    source = Path(args[0]).expanduser().resolve()
    targets = [
        (Path(args[index]).expanduser().resolve(), float(args[index + 1]))
        for index in range(1, len(args), 2)
    ]
    generate(source, targets)


if __name__ == "__main__":
    main()
