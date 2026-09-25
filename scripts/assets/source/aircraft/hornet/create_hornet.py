import bpy, bmesh, math, os, json, argparse, sys, struct
from mathutils import Vector, Matrix
from math import sin, cos, pi

parser=argparse.ArgumentParser();parser.add_argument('--out',default=os.path.dirname(os.path.abspath(__file__)));opts=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(opts.out);os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in bpy.data.materials: bpy.data.materials.remove(d)

def mat(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
paint=mat('Airframe | warm ghost grey',(.40,.44,.46),.32,.44)
light=mat('Control surfaces | light ghost grey',(.46,.49,.50),.25,.46)
radome=mat('Radome | dielectric grey',(.47,.48,.47),.08,.59)
dark=mat('Recesses | charcoal',(.018,.024,.026),.2,.56)
line=mat('Panel seams | graphite grey',(.16,.19,.2),.2,.65)
steel=mat('Nozzle petals | titanium',(.18,.17,.15),.82,.35)
frame=mat('Canopy frame',(.25,.29,.30),.55,.34)
glass=mat('Canopy | smoked blue glass',(.043,.12,.16),.48,.16)
p=glass.node_tree.nodes.get('Principled BSDF'); p.inputs['Coat Weight'].default_value=.55
mark=mat('Stencils | subdued charcoal',(.08,.10,.11),0,.85)
red=mat('Port navigation lens',(.35,.015,.012),.4,.2)
green=mat('Starboard navigation lens',(.02,.28,.09),.4,.2)
# Very gentle finish variation, entirely procedural and original.
n=paint.node_tree.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=22; n.inputs['Detail'].default_value=2
r=paint.node_tree.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].color=(.36,.40,.42,1); r.color_ramp.elements[1].color=(.43,.47,.49,1)
paint.node_tree.links.new(n.outputs['Fac'],r.inputs[0]); paint.node_tree.links.new(r.outputs[0],paint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

air=[]
def mesh(name,v,f,material=paint,smooth=True):
 me=bpy.data.meshes.new(name); me.from_pydata(v,[],f); me.update(); bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free(); ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); ob.data.materials.append(material)
 for p in me.polygons:p.use_smooth=smooth
 air.append(ob); return ob
def curve(name,pts,rad=.009,material=line):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=rad;cu.bevel_resolution=2
 sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*co,1)
 ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(material);air.append(ob);return ob
def interp(stations,steps=6):
 out=[]
 for i in range(len(stations)-1):
  a=stations[max(0,i-1)];b=stations[i];c=stations[i+1];d=stations[min(len(stations)-1,i+2)]
  for j in range(steps):
   t=j/steps
   out.append(tuple(.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(len(b))))
 out.append(stations[-1]);return out
def loft(name,stations,material=paint,offset=0,power=1,steps=6):
 ss=interp(stations,steps);v=[];f=[];N=64
 for y,w,h,z in ss:
  for j in range(N):
   a=2*pi*j/N;ca=cos(a);sa=sin(a)
   v.append((offset+max(.002,w)*math.copysign(abs(ca)**power,ca),y,z+max(.002,h)*math.copysign(abs(sa)**power,sa)))
 for i in range(len(ss)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;f.append((a,b,b+N,a+N))
 f.extend([tuple(range(N-1,-1,-1)),tuple((len(ss)-1)*N+j for j in range(N))]);return mesh(name,v,f,material)

body=[(-8.65,.015,.014,.04),(-8.2,.19,.18,.04),(-7.4,.39,.34,.02),(-6.45,.57,.47,.03),(-5.5,.65,.57,.05),(-4.5,.73,.65,.08),(-3,.85,.63,.04),(-1.4,1.0,.57,-.02),(.5,1.25,.59,-.06),(2.5,1.37,.63,-.09),(4.3,1.24,.59,-.09),(6.1,1.14,.49,-.1),(7.45,1.05,.38,-.12),(7.9,.67,.28,-.10)]
loft('Fuselage | sculpted continuous shell',[(-6.1,.605,.508,.036)]+body[4:],power=.85)
loft('Nose radome',body[:4]+[(-6.1,.605,.508,.036)],radome,power=.85)
curve('Radome joint',[(.608*math.copysign(abs(cos(t))**.85,cos(t)),-6.095,.036+.511*math.copysign(abs(sin(t))**.85,sin(t))) for t in [j*2*pi/128 for j in range(129)]],.009)
# Flattened engine shoulders flow aft into twin circular nozzles.
for s in [-1,1]:
 loft(('Starboard' if s<0 else 'Port')+' engine shoulder',[(-1.05,.44,.39,-.16),(.4,.64,.59,-.18),(2.3,.68,.65,-.19),(4.5,.66,.63,-.20),(6.5,.58,.57,-.22),(7.5,.49,.50,-.22)],paint,s*.77,1,8)
 # Rounded legacy Hornet intakes: thick outer lip surrounding a recessed dark mouth.
 loft('Intake fairing '+str(s),[(-2.08,.44,.48,-.35),(-1.65,.55,.55,-.35),(-.7,.57,.56,-.29),(1,.56,.54,-.22)],paint,s*.99,.7,8)
 # Black opening on forward face, curved D-like corners, outer rim follows opening.
 pts=[]
 for j in range(65):
  a=2*pi*j/64;pts.append((s*.99+.379*math.copysign(abs(cos(a))**.72,cos(a)),-2.10,-.35+.407*math.copysign(abs(sin(a))**.72,sin(a))))
 mesh('Deep shadow inside intake '+str(s),pts[:-1],[tuple(range(63,-1,-1))],dark,False)
 curve('Rounded intake lip '+str(s),pts,.049,light)
 # Splitter plate, deliberately a separate editable mesh.
 curve('Intake splitter edge '+str(s),[(s*.60,-2.25,.14),(s*.60,-2.2,-.75),(s*.67,-.5,-.74)],.028,paint)

# Spanwise loft of a thin, smoothly rounded section; geometric visual shape only.
def foil(name,stations,side,material=paint,vertical=False):
 v=[];f=[];N=40
 for span,lead,trail,z,thick in stations:
  for j in range(N):
   a=j*2*pi/N;u=(1-cos(a))/2; yy=lead+(trail-lead)*u
   hh=thick*sin(a)*(max(.03,1-u)**.40)
   if vertical:v.append((side*(1.0+span*.27)+hh,yy,z+span))
   else:v.append((side*span,yy,z+hh))
 for i in range(len(stations)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;f.append((a,b,b+N,a+N))
 f.extend([tuple(range(N-1,-1,-1)),tuple((len(stations)-1)*N+j for j in range(N))]);return mesh(name,v,f,material)
for s in [-1,1]:
 foil('Swept main wing '+str(s),[(1.03,-.32,4.66,.05,.135),(1.6,.02,4.67,.04,.12),(2.4,.48,4.69,.0,.103),(3.5,1.19,4.7,-.06,.075),(4.6,1.92,4.69,-.13,.050),(5.48,2.50,4.64,-.20,.027)],s)
 foil('Leading edge extension '+str(s),[(.53,-5.08,1.50,.28,.075),(.78,-4.26,1.42,.32,.07),(1.1,-3.2,1.18,.30,.054),(1.40,-2.17,.90,.22,.038),(1.65,-.93,.66,.15,.015)],s)
 foil('Horizontal stabilator '+str(s),[(1.16,4.65,7.87,-.23,.085),(1.38,4.82,8.01,-.24,.075),(2.30,5.74,8.31,-.30,.058),(3.38,6.82,8.65,-.38,.033),(3.78,7.32,8.56,-.42,.017),(3.84,7.48,8.45,-.43,.011)],s,light)
 foil('Canted vertical tail '+str(s),[(0,3.25,7.10,.22,.10),(.70,3.81,6.92,.37,.082),(1.55,4.49,6.74,.37,.056),(2.22,5.04,6.59,.37,.029),(2.32,5.18,6.44,.37,.017)],s,vertical=True)
 # Trailing control separation, folding wing joint and leading-edge flap seam.
 curve('Flap separation '+str(s),[(s*1.62,3.80,.12),(s*2.6,3.90,.07),(s*3.87,3.99,-.025),(s*5.39,4.06,-.154)],.009)
 curve('Outboard aileron separation '+str(s),[(s*3.9,3.99,-.025),(s*3.9,4.69,-.075)],.009)
 curve('Wing fold seam '+str(s),[(s*4.02,1.56,-.043),(s*4.02,4.7,-.076)],.013)
 curve('Leading edge flap seam '+str(s),[(s*1.68,.51,.123),(s*3,1.27,.047),(s*4.02,1.95,-.011),(s*5.44,2.92,-.160)],.009)
 # Wingtip launch rails, with no weapon stores.
 loft('Wingtip rail '+str(s),[(2.14,.025,.025,-.20),(2.30,.067,.081,-.20),(4.77,.063,.071,-.20),(4.91,.027,.030,-.20)],frame,s*5.52,1,2)
 curve('Wingtip light '+str(s),[(s*5.57,3.25,-.19),(s*5.57,3.60,-.19)],.025,green if s<0 else red)
 # Stabilator inset outline.
 # Stabilator seams omitted: v1 seams no longer follow the re-authored outline.
 # Rudder seam follows the canted fin.
 curve('Rudder hinge '+str(s),[(s*(1+q*.27)+s*.045,6.71-q*.115,.37+q) for q in [.25,.8,1.5,2.08]],.009)
 # Small LEX fence.
 mesh('LEX fence '+str(s),[(s*1.38,-.79,.22),(s*1.4,.24,.18),(s*1.4,.23,.47),(s*1.38,-.55,.52)],[(0,1,2,3)],paint,False)

# Single-seat canopy, with separate windscreen and raised rear bow.
can=[(-5.65,.02,.01,.54),(-5.28,.32,.27,.58),(-4.82,.49,.55,.62),(-4.15,.51,.67,.67),(-3.49,.46,.55,.67),(-2.93,.29,.26,.65),(-2.65,.015,.008,.62)]
# Upper half of loft only so no glass protrudes under the fuselage.
ss=interp(can,8);v=[];f=[];N=33
for y,w,h,z in ss:
 for j in range(N):a=pi*j/(N-1);v.append((w*cos(a),y,z+h*sin(a)))
for i in range(len(ss)-1):
 for j in range(N-1):a=i*N+j;f.append((a,a+1,a+N+1,a+N))
mesh('Single-seat glazed canopy',v,f,glass)
for s in [-1,1]:curve('Canopy sill '+str(s),[(s*w,y,z+.008) for y,w,h,z in ss],.033,frame)
for idx in [14,45]:
 y,w,h,z=ss[idx];curve('Canopy structural bow '+str(idx),[(w*cos(pi*j/48),y,z+h*sin(pi*j/48)+.015) for j in range(49)],.026,frame)
loft('Canopy rear turtledeck',[(-2.85,.30,.16,.61),(-2.30,.48,.27,.50),(-1.0,.45,.25,.42),(.60,.35,.18,.41),(2.0,.20,.08,.49),(3.3,.01,.01,.51)],paint,0,1,8)

# Nozzle petal rings, deep recesses and deliberately visible segmented metal.
for s in [-1,1]:
 x=s*.76
 loft('Exhaust collar '+str(s),[(6.88,.53,.53,-.22),(7.30,.51,.51,-.22),(7.42,.49,.49,-.22)],steel,x,1,2)
 for j in range(16):
  a=j*2*pi/16+.016;b=(j+1)*2*pi/16-.016
  vv=[]
  for y,rr in [(7.30,.505),(7.95,.432),(8.06,.402)]:
   vv.extend([(x+rr*cos(a),y,-.22+rr*sin(a)),(x+rr*cos(b),y,-.22+rr*sin(b))])
  mesh('Nozzle petal '+str(s)+' '+str(j),vv,[(0,1,3,2),(2,3,5,4)],steel,False)
 loft('Exhaust cavity '+str(s),[(7.94,.377,.377,-.22),(8.01,.379,.379,-.22)],dark,x,1,1)
 curve('Exhaust inner rim '+str(s),[(x+.403*cos(j*2*pi/96),8.055,-.22+.403*sin(j*2*pi/96)) for j in range(97)],.016,steel)

# Subdued surface panels, vents and authored fictional review markings.
for y,w,h,z in [(-5.9,.62,.53,.04),(-3.2,.83,.63,.05),(-1.0,1.07,.575,-.03),(1.3,1.31,.61,-.08)]:
 for s in [-1,1]:
  curve('Fuselage panel joint',[(s*w*cos(a),y,z+h*sin(a)+.008) for a in [j*pi/60 for j in range(31)]],.0065)
for s in [-1,1]:
 # Removed the v1 grill bars that floated over changing shoulder contours.
 for j in range(6):curve('Aft side vent',[(s*1.327,4.04+j*.09,-.12),(s*1.30,4.04+j*.09,-.34)],.018,dark)
 # Four upper-wing access panels.
 for x,y in [(2.2,2.1),(3.2,2.7)]:
  z=.085-(x-1.6)*.055
  curve('Wing access panel',[(s*(x+dx),y+dy,z) for dx,dy in [(-.19,-.25),(.19,-.25),(.19,.25),(-.19,.25),(-.19,-.25)]],.006)
# Small antennas on dorsal spine and nose sensor details.
mesh('Dorsal blade antenna',[(-.025,-.85,.65),(.025,-.85,.65),(.025,-.45,.65),(-.025,-.45,.65),(-.02,-.67,.95),(.02,-.67,.95)],[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4)],frame)
for s in [-1,1]:
 curve('Nose side detail '+str(s),[(s*.57,-5.82,.22),(s*.64,-5.44,.23)],.023,frame)
 curve('Formation light nose '+str(s),[(s*.703,-4.9,.02),(s*.724,-4.48,.04)],.014,light)
 curve('Formation light tail '+str(s),[(s*1.275,5.15,.035),(s*1.235,5.72,.035)],.016,light)

def textob(name,text,loc,size,rot,material=mark):
 cu=bpy.data.curves.new(name,'FONT');cu.body=text;cu.size=size;cu.extrude=0;cu.align_x='CENTER';cu.space_character=1.05
 ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=rot;ob.data.materials.append(material);air.append(ob);return ob
textob('Starboard upper wing stencil','NAVY',(-3.25,2.8,.080),.43,(0,0,pi/2))
textob('Port upper wing stencil','101',(3.18,2.8,.090),.49,(0,0,pi/2))
for s in [-1,1]:
 # Tail codes on outboard sides, using text local normal outward.
 ob=textob('Tail code '+str(s),'FX',(s*1.47,5.78,1.82),.36,(0,0,0)); ob.rotation_euler=Matrix(((0,s*.27,s),(s,0,0),(0,1,-.27))).to_quaternion().to_euler()
 ob=textob('Tail number '+str(s),'101',(s*1.28,6.10,1.14),.20,(0,0,0)); ob.rotation_euler=Matrix(((0,s*.27,s),(s,0,0),(0,1,-.27))).to_quaternion().to_euler()


# Conform authored decals to their host surfaces to prevent floating or buried lettering.
bpy.context.view_layer.update()
for ob in list(air):
 if ob.type!='FONT':continue
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bpy.ops.object.convert(target='MESH')
 for v in ob.data.vertices:
  pos=ob.matrix_world@v.co
  if 'wing stencil' in ob.name:
   s=1 if pos.x>0 else -1;host=bpy.data.objects['Swept main wing '+str(s)];origin=Vector((pos.x,pos.y,10));direction=Vector((0,0,-1))
  else:
   s=1 if pos.x>0 else -1;host=bpy.data.objects['Canted vertical tail '+str(s)];origin=Vector((s*10,pos.y,pos.z));direction=Vector((-s,0,0))
  hit,loc,norm,idx=host.ray_cast(origin,direction)
  if hit:v.co=ob.matrix_world.inverted()@(loc+norm*.003)

aircoll=bpy.data.collections.new('F-A-18C | original review exterior');bpy.context.scene.collection.children.link(aircoll)
for ob in air:
 for c in list(ob.users_collection):c.objects.unlink(ob)
 aircoll.objects.link(ob)
root=bpy.data.objects.new('HORNET | review prototype',None);aircoll.objects.link(root)
for ob in air:ob.parent=root
root['scope']='Original visual exterior study only. Simplified F/A-18C family geometry; exact Lot 20 details not verified. No engineering, flight model or weapon internals.'
root['configuration']='Single-seat, clean airframe, retracted landing gear, wingtip rails. Fictional FX / 101 markings.'

# Export only the authored airframe; turn curves/text into editable meshes in export copy through exporter.
bpy.ops.object.select_all(action='DESELECT')
for ob in air:ob.select_set(True)
bpy.context.view_layer.objects.active=air[0]
# Centre longitudinal extents, then rotate source +180deg about up: glTF nose -Z.
# Blender +Y exports to glTF -Z. Source nose is -Y, so rotate the aircraft around Z first.
bpy.context.view_layer.update()
coords=[o.matrix_world@Vector(c) for o in air for c in o.bound_box]
centre_y=(min(p.y for p in coords)+max(p.y for p in coords))/2
root.rotation_euler.z=pi;root.location.y=centre_y
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT+'/F18C-refined.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
root.rotation_euler.z=0;root.location.y=0;bpy.context.view_layer.update()


ground=mat('Studio | slate',(.035,.050,.065),.05,.7)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.7));bpy.context.object.name='Studio floor';bpy.context.object.data.materials.append(ground)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.22,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.48
def area(name,loc,power,size,color,target=(0,0,0)):
 bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size;ob.data.color=color;ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-9,-7,13),2600,9,(.83,.91,1))
area('Warm edge',(8,6,10),3100,8,(1,.86,.69))
area('Front fill',(3,-12,4),1400,7,(.78,.86,1))
area('Tail separator',(-5,9,6),1800,6,(.74,.86,1))
bpy.ops.object.camera_add(location=(15,-20,14));cam=bpy.context.object;cam.name='Review camera';bpy.context.scene.camera=cam
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=48;sc.cycles.use_denoising=True
sc.render.resolution_x=1800;sc.render.resolution_y=1300;sc.render.resolution_percentage=100
sc.view_settings.view_transform='AgX';sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
def view(name,pos,target,scale):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale
 sc.render.filepath=OUT+'/'+name+'.png';bpy.ops.render.render(write_still=True)
view('01-front-quarter',(15,-21,15),(0,-.2,.1),21)
view('02-rear-quarter',(-15,21,12),(0,1,.2),20.5)
view('03-top',(0,-.001,28),(0,0,0),27.2)
view('04-side',(26,-2,5),(0,0,.4),20.2)
cam.location=(15,-21,15);cam.rotation_euler=(Vector((0,-.2,.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=21
# Make opening the .blend useful immediately.
for screen in bpy.data.screens:
 for a in screen.areas:
  if a.type=='VIEW_3D':
   a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.overlay.show_overlays=False;a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/F18C-refined.blend')
stats={'objects':len(air),'mesh_vertices':sum(len(o.data.vertices) for o in air if o.type=='MESH'),'glb_bytes':os.path.getsize(OUT+'/F18C-refined.glb')}
open(OUT+'/stats.json','w').write(json.dumps(stats,indent=2));print('REVIEW COMPLETE',stats)

# Export manifest is derived from the binary file, not estimated from source curves.
b=open(OUT+'/F18C-refined.glb','rb').read();n,t=struct.unpack_from('<II',b,12);g=json.loads(b[20:20+n]);triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
manifest={'aircraft_id':'fa18c','variant':'F/A-18C legacy Hornet; exact Lot 20 details unverified','status':'review model, not integrated','configuration':'single seat; clean; gear retracted; fictional FX/101 markings','authorship':'All mesh and markings authored originally in included Python. No external mesh or texture components.','references':[{'url':'https://www.navair.navy.mil/product/FA-18-D-Hornet','use':'variant identification only; conflicting span units not used as measurement'},{'url':'https://upload.wikimedia.org/wikipedia/commons/9/97/US_Navy_050327-N-6694B-001_An_F-A-18C_Hornet_rolls_into_a_turn_while_flying_a_combat_mission_over_Iraq.jpg','use':'US Navy photograph 050327-N-6694B-001: legacy C visual tail sweep/exposure reference; artist approximations, not traced or used as a texture'}],'source_axes':{'nose':'-Y','up':'+Z','lateral':'+X'},'export_axes':{'nose':'-Z','up':'+Y','right':'+X','units':'metres'},'export_transform':'Aircraft root rotated +180 degrees about Blender Z before standard glTF Y-up conversion. Source longitudinal midpoint subtracted through translated rotated root. Source scene returned to original orientation for consistent review cameras.','intended_dimensions':'Approximate artist exterior; nominal legacy Hornet family length around 17m and clean rail span around 11.2m. Not dimensional certification.','source_tail_revision':{'stabilator_tip_halfspan_before_m':3.28,'stabilator_tip_halfspan_after_m':3.84,'stabilator_outline':'Leading root moved forward, outer leading edge swept aft, tip clipped and rounded across two sections; chord tapers toward aft-swept tip.','vertical_fin_height_above_root_before_m':2.74,'vertical_fin_height_above_root_after_m':2.32,'basis':'Artist judgement from Navy C-model photo plus orthographic whole-aircraft checks; not photo-derived measurements.'},'triangles':triangles,'nodes':len(g['nodes']),'mesh_instances':sum('mesh' in o for o in g['nodes']),'materials':len(g['materials']),'draw_call_estimate':sum(len(g['meshes'][o['mesh']]['primitives']) for o in g['nodes'] if 'mesh' in o),'glb_bytes':len(b),'blender_version':bpy.app.version_string,'rebuild':'blender --background --threads 3 --python create_hornet.py -- --out OUTPUT_DIRECTORY','caveats':['Visual artist approximation; no flight model or engineering data.','No cockpit interior, gear, animation, UV atlas, baked weathering or LODs.','Procedural Blender finish variation is not baked into glTF.','Not production-retopologized; independent editable surfaces remain.','Browser appearance and performance must be assessed before app adoption.']}
open(OUT+'/manifest.json','w').write(json.dumps(manifest,indent=2))

# Validate the binary export and attach measured dimensions and axes evidence.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_export import verify
verify(OUT)
