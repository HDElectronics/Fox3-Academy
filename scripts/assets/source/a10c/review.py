"""Cycles review of the optimized, shipped Blender GLBs.
blender --background --threads 2 --python review.py -- --models src/assets/models --out .shots/a10c-model-review/shipped [--only a10c]
"""
import argparse
import sys
from pathlib import Path
from types import SimpleNamespace
import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from generate import NAMES, studio

p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--only',nargs='*')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
for key in a.only or NAMES:
    if key not in NAMES:raise ValueError(key)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str((a.models/(key+'.glb')).resolve()))
    parts=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    pivots={ob.name:ob for ob in bpy.context.scene.objects if ob.type=='EMPTY' and ob.name.startswith(('gear.','flap.','deceleron.'))}
    if key=='a10c':
        expected={'gear.nose','gear.port','gear.starboard','flap.port','flap.starboard','deceleron.port.upper','deceleron.port.lower','deceleron.starboard.upper','deceleron.starboard.lower'}
        if set(pivots)!=expected:raise ValueError('Incomplete imported A-10 rig: '+str(sorted(pivots)))
    out=a.out.resolve()/key;out.mkdir(parents=True,exist_ok=True)
    studio(SimpleNamespace(key=key,objects=parts,pivots=pivots),out)
    print('REVIEWED_EXPORT',key,flush=True)
