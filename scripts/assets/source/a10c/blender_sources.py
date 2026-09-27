"""Optional conversion of the generated GLBs to editable .blend files in an isolated CLI process.
blender --background --python blender_sources.py -- --review .shots/a10c-model-review
Never run this whole-file converter inside the user's live Blender scene.
"""
import argparse
import sys
from pathlib import Path
import bpy

p=argparse.ArgumentParser();p.add_argument('--review',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
for key in ['a10c','gbu12','agm65','apkws','mk82','cbu97','tgp']:
    source=a.review.resolve()/key/'model.glb'
    if not source.exists():continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.ops.wm.save_as_mainfile(filepath=str(source.with_suffix('.blend')))
