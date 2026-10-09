"""Desktop export entry point. UV checks use the same implementation as the add-on."""
from pathlib import Path
import sys

import bpy


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    output_path, export_format, root = Path(args[0]), args[1], Path(args[2])
    enforce_gate = args[3] == "1"
    sys.path.insert(0, str(Path(__file__).parent))
    from blendup_blender_uv import check_and_record, project_policy, passes_uv_gate, uv_gate_message, uv_validation_ignored
    from blendup_blender_export import export_scene
    policy = project_policy(root)
    if policy.validate_uvs and not uv_validation_ignored(root, Path(bpy.data.filepath)):
        report = check_and_record(root, Path(bpy.data.filepath), source_is_saved=True)
        if enforce_gate and not passes_uv_gate(report, policy):
            raise RuntimeError(uv_gate_message(report, policy))
    export_scene(output_path, export_format)


if __name__ == "__main__": main()
