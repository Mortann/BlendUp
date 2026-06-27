
import pathlib
import sys
import bpy

def main():
    marker = "--"

    if marker not in sys.argv:
        raise RuntimeError("BlendUp export output path is missing.")

    output_path = pathlib.Path(sys.argv[sys.argv.index(marker) + 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(
        filepath=str(output_path),
        use_selection=False,
        apply_unit_scale=True,
        bake_space_transform=False,
        object_types={'EMPTY', 'MESH', 'ARMATURE'},
        add_leaf_bones=False,
        mesh_smooth_type='FACE',
    )

main()
