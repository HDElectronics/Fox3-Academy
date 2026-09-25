"""Original exterior game-art store studies. No engineering or internal components.
blender --background --threads 2 --python generate_stores.py -- --out /path --only kh29t
"""
import bpy,bmesh,math,json,sys,argparse
from pathlib import Path
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--out',type=Path,default=Path(__file__).parent);P.add_argument('--only',nargs='*');P.add_argument('--no-render',action='store_true');A=P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
REF='https://www.digitalcombatsimulator.com/upload/iblock/f6d/DCS_FC3_Flight_Manual_EN.pdf'
# Art normalization only; these values are neither engineering dimensions nor performance data.
SPECS={
'vikhr':('Vikhr',2.8,.055,190,'7-5','A slim exterior study with deployed fin silhouette; proportions approximate.'),
'kh25ml':('Kh-25ML',3.7,.075,187,'7-1','Simplified exterior study; panel layout and visible nose window approximate.'),
'kh29l':('Kh-29L',4.0,.10,188,'7-2','Simplified long-body exterior with narrow dark nose window.'),
'kh29t':('Kh-29T',4.0,.10,188,'7-3','Shared Kh-29 family shell; rounded broad dark nose window distinguishes this review variant.'),
'kh58':('Kh-58',4.8,.085,193,'7-8','Original broad-fin exterior study; subvariant details not verified.'),
'sa10-missile':('SA-10 family missile',7.0,.066,None,None,'Generic S-300-family visual stand-in. No exact missile variant or silhouette certification; size follows the existing app display proxy.'),
'sa11-missile':('SA-11 family missile',5.5,.070,None,None,'Generic Buk-family visual stand-in. No exact missile variant or silhouette certification; size follows the existing app display proxy.'),
'sa15-missile':('SA-15 family missile',3.0,.070,None,None,'Generic Tor-family visual stand-in. No exact missile variant or silhouette certification; size follows the existing app display proxy.'),
'r60':('R-60 family',2.2,.053,171,'6-11','Loadout-only exterior. Reference shows R-60M; exact basic R-60 differences not verified.'),
's8':('S-8 family rocket',1.5,.035,None,None,'Individual rocket family stand-in with deployed fins; exact rocket subtype and detailed silhouette not verified. No launch pod.'),
's13':('S-13 family rocket',2.3,.043,None,None,'Individual rocket family stand-in with deployed fins; exact rocket subtype and detailed silhouette not verified. No launch pod.'),
'kab500kr':('KAB-500Kr',3.0,.145,202,'7-19','Rounded forward window and broad rear fins; simplified original exterior, dimensions approximate.'),
'fab250':('FAB-250 family bomb',1.9,.185,199,'7-12','Rounded body with boxed tail silhouette; exact FAB-250 subvariant not verified.')}

def material(name,c,metal=0,rough=.45):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;return m

def mesh(name,v,f,mat,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);coll.objects.link(o);me.materials.append(mat)
 for p in me.polygons:p.use_smooth=smooth
 parts.append(o);return o

def coord(t,r,a):return (r*math.cos(a)*L*.55,(.5-t)*L,r*math.sin(a)*L*.55)
def lathe(name,stations,mat):
 v=[];f=[];n=48
 for t,r in stations:
  for j in range(n):v.append(coord(t,r,2*math.pi*j/n))
 for i in range(len(stations)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;f.append((a,b,b+n,a+n))
 f.extend([tuple(range(n-1,-1,-1)),tuple((len(stations)-1)*n+j for j in range(n))]);return mesh(name,v,f,mat,True)
def band(name,t,r,width=.006,mat=None):return lathe(name,[(t-width/2,r),(t+width/2,r)],mat or metal)
def fins(name,outline,mat=None,count=4,offset=math.pi/4,thickness=.004):
 for i in range(count):
  a=offset+2*math.pi*i/count;v=[]
  for d in [-thickness/2,thickness/2]:
   for t,r in outline:
    x,y,z=coord(t,r,a);v.append((x+d*L*math.sin(a),y,z-d*L*math.cos(a)))
  n=len(outline);f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)];mesh(name+' '+str(i+1),v,f,mat or paint)

def build(k,R):
 global paint,metal
 if k=='fab250':
  lathe('Nose shell',[(0,.003),(.02,.055),(.055,.110),(.105,.158),(.15,R)],paint)
  lathe('Body shell',[(.15,R),(.25,R),(.54,R),(.62,.16),(.71,.10),(.83,.055),(1,.050)],paint)
  fins('Tail vanes',[(.71,.045),(.80,.135),(.98,.145),(1,.04)],paint,offset=math.pi/4)
  # Square tail braces, made as shallow extruded side rails rather than a solid disc.
  for i in range(4):
   a=math.pi/4+i*math.pi/2;b=a+math.pi/2;v=[]
   for t in [.93,.99]:
    for r in [.142,.149]:v.extend([coord(t,r,a),coord(t,r,b)])
   mesh('Tail box brace '+str(i+1),v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],paint)
  band('Body join',.18,R+.001,mat=seam);band('Tail collar',.66,.133,width=.014,mat=paint)
 elif k=='kab500kr':
  lathe('Nose window',[(0,.006),(.015,.049),(.045,.097),(.067,.112)],glass)
  lathe('Forward shell',[(.067,.112),(.09,.127),(.14,R)],paint)
  lathe('Body shell',[(.14,R),(.21,R),(.67,R),(.76,.100),(.87,.086),(1,.080)],paint)
  fins('Tail vanes',[(.69,.12),(.74,.25),(.95,.245),(1,.084)],paint)
  band('Nose bezel',.070,.115,.014,metal);band('Body join',.25,R+.001,mat=seam)
 else:
  longnose=k in ['kh58','sa10-missile','sa11-missile'];blunt=k in ['kh25ml','kh29t','kh29l'];nt=.22 if longnose else (.13 if blunt else .11)
  if blunt:
   nr=R*(.80 if k=='kh29t' else .39)
   lathe('Nose window',[(0,.003),(.008,nr*.7),(.022,nr)],glass)
   lathe('Nose shell',[(.022,nr),(.042,R*.65),(.08,R*.90),(nt,R)],paint)
   band('Nose bezel',.023,nr+.002,.008,metal)
  else:
   nm=ochre if k=='vikhr' else (dark if k=='kh58' else paint)
   lathe('Nose shell',[(0,.001),(.025,R*.22),(.06,R*.48),(nt*.75,R*.85),(nt,R)],nm)
  lathe('Body shell',[(nt,R),(.38,R),(.68,R),(.91,R),(.975,R*.93),(1,R*.85)],paint)
  # Exterior cap only, no nozzle or internal parts.
  lathe('Aft cap',[(.995,R*.85),(1,R*.85)],dark)
  for j,t in enumerate([nt+.014,.39,.76,.965]):band('Subtle exterior join '+str(j),t,R+.0008,.002,mat=seam)
  if k=='vikhr':
   fins('Forward vanes',[(.16,R*.9),(.19,.125),(.28,.115),(.26,R*.9)],metal,offset=0)
   fins('Tail vanes',[(.90,R*.8),(.88,.105),(.98,.105),(1,R*.8)],dark,offset=0)
   band('Nose colour band',.31,R+.001,.10,ochre)
  elif k in ['kh29l','kh29t']:
   fins('Forward vanes',[(.20,R*.9),(.26,.175),(.39,.168),(.36,R*.9)],paint)
   fins('Main rear fins',[(.52,R*.9),(.77,.29),(.93,.245),(.975,R*.86)],paint)
  elif k=='kh25ml':
   fins('Forward vanes',[(.19,R*.9),(.26,.138),(.36,.13),(.34,R*.9)],paint)
   fins('Tail fins',[(.70,R*.9),(.86,.21),(.97,.185),(.985,R*.86)],paint)
  elif k=='kh58':
   fins('Broad main fins',[(.51,R*.9),(.67,.22),(.81,.22),(.85,R*.9)],paint)
   fins('Tail fins',[(.87,R*.9),(.91,.15),(.995,.145),(.99,R*.86)],paint)
  elif k=='r60':
   fins('Forward small fins',[(.14,R*.9),(.18,.10),(.20,.095),(.21,R*.9)],paint)
   fins('Forward large fins',[(.23,R*.9),(.28,.13),(.36,.12),(.34,R*.9)],paint)
   fins('Tail fins',[(.74,R*.9),(.87,.17),(.99,.175),(.98,R*.8)],paint)
  elif k=='sa10-missile':fins('Tail fins',[(.79,R*.9),(.90,.135),(.99,.13),(.99,R*.86)],paint)
  elif k=='sa11-missile':
   fins('Long body fins',[(.32,R*.85),(.70,.18),(.88,.17),(.90,R*.85)],paint)
   fins('Tail fins',[(.91,R*.9),(.94,.15),(.995,.145),(.997,R*.8)],paint)
  elif k=='sa15-missile':
   fins('Forward vanes',[(.13,R*.9),(.19,.125),(.26,.12),(.25,R*.9)],paint)
   fins('Tail fins',[(.73,R*.9),(.82,.17),(.985,.17),(.99,R*.8)],paint)
  else:
   fins('Deployed tail fins',[(.88,R*.85),(.90,R*2.4),(.985,R*2.3),(.99,R*.85)],metal,count=6,offset=0,thickness=.002)
 # Simple flattened exterior mounting pads only on air-carried stores; no mechanism.
 if not k.startswith('sa') and k not in ['vikhr','s8','s13','r60']:
  for t in [.37,.58]:
   bpy.ops.mesh.primitive_cube_add(size=1,location=(0,(.5-t)*L,(R*.55+.008)*L));o=bpy.context.object;o.name='Exterior mounting pad';o.scale=(L*.025,L*.040,L*.020);o.data.materials.append(metal)
   for c in list(o.users_collection):c.objects.unlink(o)
   coll.objects.link(o);parts.append(o)

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def studio(out):
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=1000;scene.render.resolution_y=750;scene.render.resolution_percentage=100;scene.world.color=(.19,.19,.19);scene.view_settings.view_transform='AgX'
 zmin=min((o.matrix_world@Vector(v)).z for o in parts for v in o.bound_box)
 bpy.ops.mesh.primitive_plane_add(size=L*200,location=(0,0,zmin-.02*L));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(material('Studio charcoal',(.075,.085,.105),0,.82))
 for name,loc,energy,size in [('Key',(1.5,1.1,2.2),110,1.5),('Fill',(-1,0,1.0),70,1.1),('Edge',(.5,-1,1.7),140,1.2)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=energy*L*L;d.shape='DISK';d.size=size*L;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=Vector(loc)*L;aim(o,(0,0,0))
 d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.lens=55;d.clip_end=L*100
 views={'front':((1.15,1.0,.77),L*1.2),'top':((0,0,2),L*1.28),'side':((2,0,.001),L*1.28)}
 for name,(pos,scale) in views.items():
  cam.location=Vector(pos)*L;aim(cam,(0,0,0));d.ortho_scale=scale
  if name=='top':cam.rotation_euler[2]=math.pi/2
  floor.hide_render=(name=='side')
  scene.render.filepath=str(out/(name+'.png'))
  if not A.no_render:bpy.ops.render.render(write_still=True)
 # Saved file opens on the front-quarter studio.
 floor.hide_render=False
 cam.location=Vector(views['front'][0])*L;aim(cam,(0,0,0));d.ortho_scale=views['front'][1]

for k,spec in SPECS.items():
 if A.only and k not in A.only:continue
 name,L,R,page,figure,note=spec;out=A.out/k;out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.world=bpy.data.worlds.new('World');scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
 coll=bpy.data.collections.new(name+' exterior');scene.collection.children.link(coll);parts=[]
 paint=material('Exterior light grey' if k not in ['fab250','kab500kr','sa10-missile','sa11-missile','sa15-missile'] else 'Exterior sage',(.60,.63,.63) if k not in ['fab250','kab500kr','sa10-missile','sa11-missile','sa15-missile'] else (.26,.32,.28),.18,.47)
 metal=material('Exterior dull metal',(.34,.38,.40),.7,.35);dark=material('Exterior dark cap',(.025,.035,.042),.15,.5);glass=material('Opaque dark optical window',(.025,.055,.07),.35,.22);seam=material('Restrained joints',(.21,.25,.27),.25,.5);ochre=material('Vikhr exterior ochre',(.50,.40,.17),.2,.43)
 build(k,R);bpy.context.view_layer.update()
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 bpy.ops.export_scene.gltf(filepath=str(out/'model.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
 studio(out);bpy.ops.wm.save_as_mainfile(filepath=str(out/'model.blend'))
 manifest={'id':k,'name':name,'category':'missile' if k not in ['s8','s13','fab250','kab500kr'] else ('rocket' if k in ['s8','s13'] else 'bomb'),'status':'review prototype','configuration':'exterior only; fins shown deployed where applicable','authorship':'Original meshes and PBR materials generated for Fox3; no extracted game assets or source imagery embedded.','references':[{'url':REF,'publisher':'Eagle Dynamics','source':'DCS Flaming Cliffs 3 manual','pdf_page':page,'figure':figure,'use':'Visible exterior silhouette only; no engineering data used' if page else 'Game family/name context only; detailed exterior silhouette unverified'}],'caveats':[note,'All geometry is an artistic approximation. Metre-like normalization is for game display, not a certified dimension.','No internals, moving fins, textures, stencils, damage states, LODs or deployment animation.','No weapon performance, guidance, propulsion or fuze information is encoded.'],'source_axes':'Blender nose +Y, up +Z, right +X','export_axes':'glTF nose -Z, up +Y, right +X','generator':'../generate_stores.py','rebuild':'blender --background --threads 2 --python generate_stores.py -- --out /path/to/review --only '+k,'blender_version':bpy.app.version_string,'orientation_verified':False,'integration_checks_pending':['real browser load and lighting','in-app sizing and pixel floor','shared resource disposal','fleet performance and LODs','material merge budget'],'render_views':['front','top','side']}
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('COMPLETED',k,flush=True)
