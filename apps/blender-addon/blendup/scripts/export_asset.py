"""Desktop export entry point. UV checks use the same implementation as the add-on."""
from pathlib import Path
import sys

import bpy


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    output_path, export_format, root = Path(args[0]), args[1], Path(args[2])
    enforce_gate = args[3] == "1"
    sys.path.insert(0, str(Path(__file__).parent))
    from blendup_blender_uv import check_and_record, project_policy, passes_uv_gate, uv_gate_message
    policy = project_policy(root)
    if policy.validate_uvs:
        report = check_and_record(root, Path(bpy.data.filepath), source_is_saved=True)
        if enforce_gate and not passes_uv_gate(report, policy):
            raise RuntimeError(uv_gate_message(report, policy))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if export_format == "glb":
        bpy.ops.export_scene.gltf(filepath=str(output_path), export_format="GLB", use_selection=False, export_apply=True)
    elif export_format == "fbx":
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.fbx(filepath=str(output_path), use_selection=False, apply_unit_scale=True,
                                 bake_space_transform=False, object_types={"EMPTY", "MESH", "ARMATURE"},
                                 add_leaf_bones=False, mesh_smooth_type="FACE")
    else:
        raise RuntimeError(f"Unsupported export format: {export_format}")


if __name__ == "__main__": main()
