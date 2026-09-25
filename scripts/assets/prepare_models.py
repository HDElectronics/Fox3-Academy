"""Prepare the approved exterior library for Fox3. Visual geometry only.
blender --background --threads 2 --python prepare_models.py -- --source REVIEW --out src/assets/models
"""
import argparse,bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--only',nargs='*');args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);args.out.mkdir(parents=True,exist_ok=True)
catalog=json.loads((args.source/'fleet.json').read_text());records=[]
for record in catalog:
 id=record['id']
 if args.only and id not in args.only:continue
 bpy.ops.wm.read_factory_settings(use_empty=True)
 source=args.source/id/'model.glb';bpy.ops.import_scene.gltf(filepath=str(source))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];pivots={}
 if id=='f14b':
  for name in ['wing.swing.port','wing.swing.starboard']:
   ob=bpy.data.objects.get(name);assert ob,name;pivots[name]=ob.matrix_world.copy()
 def part(o):
  if id=='f14b':
   for name in pivots:
    if o.name.startswith(name):return name
  return 'static'
 groups={}
 triangles=sum(len(o.data.polygons) for o in meshes)
 target=24000 if id=='fa18c' else (18000 if record['category']=='aircraft' else (12000 if record['category']=='ground' else 4000))
 ratio=min(1,target/max(1,triangles))
 for o in meshes:
  key=part(o);mat=o.data.materials[0] if o.data.materials else None;world=o.matrix_world.copy();o.parent=None;o.matrix_world=world
  # Preserve local geometry under a separately retained sweep pivot.
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  if ratio<.95 and len(o.data.polygons)>100:
   mod=o.modifiers.new('display simplification','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name)
  o.select_set(False)
  groups.setdefault((key,mat.name if mat else 'default'),[]).append(o)
  o.name='source.'+o.name
 # Discard obsolete imported roots, keeping meshes only.
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
 roots={}
 for name,matrix in pivots.items():
  root=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(root);root.matrix_world=matrix;roots[name]=root
 for (key,material),objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=key+'.'+material
  # Drop unused attributes: these original assets contain no image textures.
  for uv in list(o.data.uv_layers):o.data.uv_layers.remove(uv)
  if key in roots:
   world=o.matrix_world.copy();o.parent=roots[key];o.matrix_world=world
 bpy.context.view_layer.update()
 bpy.ops.object.select_all(action='SELECT')
 output=args.out/(id+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=False,export_normals=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False)
 meta=json.loads((args.source/id/'manifest.json').read_text())
 records.append({'id':id,'category':record['category'],'name':record['name'],'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'references':meta.get('references',meta.get('refs',meta.get('reference_urls',[]))),'source_caveats':meta.get('variant_caveats',meta.get('caveats',[])),'authorship':'Original Fox3 scripted exterior art; no third-party meshes or textures. Distributed under the repository MIT license.'})
 print('PREPARED',id,output.stat().st_size,flush=True)
manifest=args.out/'manifest.json'
if args.only and manifest.exists():
 old=json.loads(manifest.read_text());records=[r for r in old if r['id'] not in args.only]+records
manifest.write_text(json.dumps(records,indent=2)+'\n')
