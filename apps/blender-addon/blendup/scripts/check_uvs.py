from pathlib import Path
import sys
import bpy

sys.path.insert(0, str(Path(__file__).parent))
from blendup_blender_uv import check_and_record

root = Path(sys.argv[sys.argv.index("--") + 1])
report = check_and_record(root, Path(bpy.data.filepath))
print(f"[BlendUp] UV : {report['score']}/100")
