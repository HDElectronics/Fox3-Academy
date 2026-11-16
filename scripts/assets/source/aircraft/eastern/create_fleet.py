import bpy,bmesh,math,json,os,sys,argparse
from math import pi,sin,cos
from mathutils import Vector
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--out',default=str(Path(__file__).parent));parser.add_argument('--only',nargs='*');parser.add_argument('--render-threads',type=int,default=3);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=Path(args.out)
SPECS={'su27':('Su-27S',21.9,14.7),'su33':('Su-33',21.2,14.7),'j11a':('J-11A',21.9,14.7),'mig29s':('MiG-29S (9-13)',17.3,11.4)}
def mat(name,col,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
# Author longitudinal coordinate is distance aft of nose. Blender +Y nose -> glTF -Z nose.
def P(v):return(v[0],L/2-v[1],v[2])
def mesh(name,vs,fs,material=None,smooth=True):
 me=bpy.data.meshes.new(name);me.from_pydata([P(v) for v in vs],[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);aircoll.objects.link(o);o.data.materials.append(material or paint)
 for f in me.polygons:f.use_smooth=smooth
 air.append(o);return o
def curve(name,pts,r=.008,material=None):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=1;sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,v in zip(sp.points,pts):p.co=(*P(v),1)
 o=bpy.data.objects.new(name,cu);aircoll.objects.link(o);o.data.materials.append(material or seam);air.append(o);return o
def interp(st,steps=4):
 out=[]
 for i in range(len(st)-1):
  a=st[max(0,i-1)];b=st[i];c=st[i+1];d=st[min(len(st)-1,i+2)]
  for j in range(steps):
   t=j/steps;out.append(tuple(b[k]+(c[k]-b[k])*t if k==0 else .5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(len(b))))
 return out+[st[-1]]
def loft(name,st,material=None,x=0,power=1,steps=4,n=48,caps=True):
 ss=interp(st,steps);vs=[];fs=[]
 for y,w,h,z in ss:
  for j in range(n):
   a=2*pi*j/n;vs.append((x+max(.001,w)*math.copysign(abs(cos(a))**power,cos(a)),y,z+max(.001,h)*math.copysign(abs(sin(a))**power,sin(a))))
 for i in range(len(ss)-1):
  for j in range(n):q=i*n+j;r=i*n+(j+1)%n;fs.append((q,r,r+n,q+n))
 if caps:fs.extend([tuple(range(n-1,-1,-1)),tuple((len(ss)-1)*n+j for j in range(n))])
 return mesh(name,vs,fs,material)
def foil(name,st,side,material=None,vertical=False,xbase=0,cant=0):
 vs=[];fs=[];ss=interp(st,3);n=40
 for span,lead,trail,z,thick in ss:
  for j in range(n):
   a=2*pi*j/n;u=(1-cos(a))/2;y=lead+(trail-lead)*u;h=thick*sin(a)*max(.02,1-u)**.38
   vs.append((side*(xbase+span*cant)+h,y,z+span) if vertical else(side*span,y,z+h))
 for i in range(len(ss)-1):
  for j in range(n):q=i*n+j;r=i*n+(j+1)%n;fs.append((q,r,r+n,q+n))
 fs.extend([tuple(range(n-1,-1,-1)),tuple((len(ss)-1)*n+j for j in range(n))]);return mesh(name,vs,fs,material)
def canopy(st,name='Single-seat canopy'):
 ss=interp(st,6);vs=[];fs=[];n=33
 for y,w,h,z in ss:
  for j in range(n):a=pi*j/(n-1);vs.append((w*cos(a),y,z+h*sin(a)))
 for i in range(len(ss)-1):
  for j in range(n-1):a=i*n+j;fs.append((a,a+1,a+n+1,a+n))
 mesh(name,vs,fs,glass)
 for s in [-1,1]:curve(name+' sill '+str(s),[(s*w,y,z+.008) for y,w,h,z in ss],.025,frame)
 for idx in [6,len(ss)//3,len(ss)-6]:
  y,w,h,z=ss[idx];curve(name+' bow '+str(idx),[(w*cos(pi*j/40),y,z+h*sin(pi*j/40)+.007) for j in range(41)],.023,frame)
def ellipsoid(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=P(loc));o=bpy.context.object;o.name=name;o.scale=scale
 for c in list(o.users_collection):c.objects.unlink(o)
 aircoll.objects.link(o);o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=True
 air.append(o)
def inlet(name,x,y,z,w,h,box=.52):
 pts=[]
 for j in range(65):a=2*pi*j/64;pts.append((x+w*math.copysign(abs(cos(a))**box,cos(a)),y,z+h*math.copysign(abs(sin(a))**box,sin(a))))
 mesh(name+' recessed shadow',pts[:-1],[tuple(range(64))],dark,False);curve(name+' rolled lip',pts,.042,light)
 loft(name+' exterior duct',[(y+.025,w+.035,h+.035,z),(y+.5,w+.08,h+.05,z+.015),(y+1.8,w+.10,h+.07,z+.05)],paint,x,box,4,caps=False)
def nozzle(name,x,y,z,r,length=.95):
 loft(name+' collar',[(y-.30,r*1.07,r*1.07,z),(y,r,r,z)],steel,x,steps=2,caps=False)
 for j in range(18):
  a=2*pi*j/18+.009;b=2*pi*(j+1)/18-.009;vs=[]
  for yy,rr in [(y,r),(y+length*.7,r*.91),(y+length,r*.86)]:vs.extend([(x+rr*cos(a),yy,z+rr*sin(a)),(x+rr*cos(b),yy,z+rr*sin(b))])
  mesh(name+' petal %02d'%j,vs,[(0,1,3,2),(2,3,5,4)],steel,False)
 mesh(name+' deep cavity',[(x+r*.83*cos(2*pi*j/48),y+length-.12,z+r*.83*sin(2*pi*j/48)) for j in range(48)],[tuple(range(48))],dark,False)
 curve(name+' inner rim',[(x+r*.86*cos(2*pi*j/64),y+length,z+r*.86*sin(2*pi*j/64)) for j in range(65)],.014,steel)
def seams_on(host,lines,label):
 for n,pts in enumerate(lines):
  pr=[]
  for x,y in pts:
   hit,loc,norm,face=host.ray_cast(Vector(P((x,y,8))),Vector((0,0,-1)))
   if hit:pr.append((loc.x,L/2-loc.y,loc.z+.007))
  if len(pr)>1:curve(label+' '+str(n),pr,.006)
def flanker(kind):
 naval=kind=='su33';fore=[(0,.005,.004,-.20),(.7,.22,.20,-.10),(1.8,.45,.42,.005),(3.3,.69,.65,.08),(4.2,.78,.74,.11)]
 loft('01 Nose radome',fore,radome)
 loft('02 Blended central fuselage',[fore[-1],(5.6,.84,.77,.12),(7.3,.97,.70,.12),(9.1,1.29,.62,.07),(11.5,1.80,.48,.01),(14.3,1.99,.39,0),(16.8,1.76,.32,.02),(18.2,.93,.27,.04),(19.1,.40,.24,.05)],power=.78)
 loft('03 Central tail stinger',[(17.7,.55,.29,.03),(19.2,.45,.26,.02),(L-.5,.25,.20,.02),(L,.035,.035,.03)],light)
 canopy([(3.95,.02,.015,.86),(4.3,.34,.28,.88),(4.9,.52,.58,.90),(5.7,.56,.69,.90),(6.45,.49,.55,.86),(7.0,.31,.30,.82),(7.45,.02,.01,.81)])
 loft('Canopy rear fairing',[(7.12,.27,.17,.81),(7.6,.46,.29,.66),(9,.46,.27,.50),(10.8,.26,.11,.46),(12,.03,.015,.46)])
 ellipsoid('IRST external housing',(.24 if naval else 0,3.95,.95),(.17,.22,.17),frame);ellipsoid('IRST dark lens',(.24 if naval else 0,3.83,1.02),(.12,.10,.11),glass)
 for s in [-1,1]:
  tag='Port' if s<0 else 'Starboard'
  loft(tag+' engine nacelle',[(8.1,.55,.56,-.69),(10,.64,.65,-.68),(13.8,.67,.63,-.56),(16.8,.59,.57,-.44),(18.25,.55105,.55105,-.38)],paint,s*1.32,.73)
  inlet(tag+' rectangular intake',s*1.32,8.05,-.72,.51,.48,.45);nozzle(tag+' exhaust',s*1.32,18.55,-.38,.515,.96)
  loft(tag+' outer tail boom',[(12.7,.06,.06,.03),(14.1,.25,.23,.07),(17.4,.27,.24,.08),(19.4,.21,.19,.05),(20.4,.055,.05,.04)],paint,s*2.15)
  wing=foil(tag+' blended swept wing',[(.62,4.75,17.1,.12,.09),(1.02,6.55,17.08,.12,.10),(1.62,8.45,17.05,.10,.135),(2.35,10.23,16.96,.07,.14),(3.4,11.3,16.75,.00,.115),(5.25,13.0,16.44,-.09,.077),(7.24,14.8,16.03,-.18,.035)],s)
  foil(tag+' horizontal stabilator',[(1.98,17.1,20.5,-.02,.12),(2.38,17.45,20.48,-.03,.11),(3.5,18.4,20.46,-.09,.073),(4.95,19.48,20.37,-.19,.029)],s,light)
  foil(tag+' vertical fin',[(0,14.12,19.24,.18,.13),(.7,14.80,19.13,.18,.11),(1.7,15.71,18.98,.18,.085),(2.75,16.68,18.75,.18,.056),(3.27,17.18,18.53,.18,.028)],s,vertical=True,xbase=2.15,cant=.015)
  # Ventral fin stations use decreasing datum so tips extend down.
  foil(tag+' ventral strake',[(0,15.0,18.2,-.16,.065),(.5,16.0,17.9,-1.1,.037),(.75,16.45,17.55,-1.7,.015)],s,vertical=True,xbase=2.12)
  loft(tag+' wingtip rail',[(14.2,.025,.025,-.17),(14.5,.075,.07,-.17),(16.65,.075,.07,-.17),(16.87,.025,.025,-.17)],frame,s*7.275,steps=2,n=24)
  curve(tag+' navigation light',[(s*7.30,15.5,-.16),(s*7.30,15.75,-.16)],.022,red if s<0 else green)
  lines=[[(s*x,15.78+(7.2-x)*.10) for x in [2.5,3.5,5,6,7.15]],[(s*x,10.55+(x-2.3)*.9+.48) for x in [2.4,3.5,5,6.5,7.15]]]
  if naval:lines.append([(s*4.65,y) for y in [12.49,13,14,15,16.49]])
  seams_on(wing,lines,tag+' wing panel')
  if naval:
   can=foil(tag+' naval canard',[(.97,6.35,8.95,.17,.085),(1.5,6.62,8.84,.16,.071),(2.55,7.24,8.69,.12,.045),(3.31,7.75,8.51,.10,.022)],s,light);seams_on(can,[[(s*x,8.4) for x in [1.45,2.15,2.9]]],tag+' canard panel')
 if naval:curve('Retracted naval arrestor hook',[(0,18,-.45),(0,20.2,-.49),(0,20.5,-.42)],.060,steel)
def fulcrum_nacelle(tag,s,st,rake,fade=2.4,n=48):
 # Stations: (aft distance, lateral centre, half width, half height, centre height, section power). The mouth is raked so the lower lip sits aft of the upper lip: the wedge intake seen from the side.
 ss=interp(st,3);vs=[];y0=ss[0][0]
 for y,x,w,h,z,p in ss:
  f=max(0,1-(y-y0)/fade)
  for j in range(n):a=2*pi*j/n;vx=x+w*math.copysign(abs(cos(a))**p,cos(a));vz=z+h*math.copysign(abs(sin(a))**p,sin(a));vs.append((s*vx,y+rake*f*(z+h-vz)/(2*h),vz))
 fs=[(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(len(ss)-1) for j in range(n)]+[tuple((len(ss)-1)*n+j for j in range(n))]
 mesh(tag+' Fulcrum engine nacelle',vs,fs);cx=s*ss[0][1];cz=ss[0][4];mouth=vs[:n]
 # A closed dark plug just inside the mouth, so the duct never shows daylight from any angle or shading.
 mesh(tag+' wedge intake recessed shadow',[(cx+(vx-cx)*.99,vy+d,cz+(vz-cz)*.99) for d in(.16,.4) for vx,vy,vz in mouth],[(j,(j+1)%n,n+(j+1)%n,n+j) for j in range(n)]+[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))],dark,False);curve(tag+' wedge intake rolled lip',mouth+[mouth[0]],.03,light)
def mig29():
 # Stations measured aft of the pitot tip (tailplane tips at 17.3 m) from a public MiG-29 three-view; the 9-13 dorsal hump is added on top.
 loft('00 Nose pitot probe',[(0,.014,.014,-.34),(.62,.018,.018,-.34),(.68,.032,.032,-.34),(1.3,.04,.04,-.34)],frame,steps=2,n=12)
 loft('01 Fulcrum radome',[(1.1,.012,.012,-.34),(1.42,.14,.14,-.31),(1.78,.26,.27,-.27),(2.32,.38,.41,-.20),(2.87,.44,.48,-.14)],radome)
 loft('02 Fulcrum forward fuselage and keel',[(2.80,.45,.49,-.14),(3.4,.48,.56,-.08),(4.0,.51,.64,-.02),(4.8,.55,.70,.03),(5.8,.56,.71,.04),(6.8,.52,.66,0),(7.8,.44,.56,-.06),(8.8,.38,.42,-.08),(9.6,.28,.26,-.06),(10.2,.06,.06,-.03)],power=.8,steps=3)
 body=loft('03 Broad flat centre body and LERX',[(4.3,.48,.13,.07),(5.3,.78,.18,.06),(6.2,1.06,.21,.05),(7.0,1.29,.23,.04),(7.9,1.50,.24,.03),(8.8,1.66,.25,.02),(9.6,1.80,.25,.01),(11,1.86,.25,0),(12.5,1.86,.25,0),(13.8,1.84,.24,0),(14.4,1.72,.19,0),(14.8,1.50,.13,-.01),(15.0,1.10,.08,-.01)],power=1.4,steps=3)
 canopy([(3.95,.02,.015,.58),(4.3,.30,.22,.57),(4.8,.44,.50,.53),(5.4,.47,.66,.50),(6.0,.45,.60,.55),(6.45,.36,.38,.62),(6.8,.02,.01,.66)])
 loft('04 MiG-29S 9-13 enlarged dorsal hump',[(6.1,.30,.25,.60),(6.9,.50,.37,.55),(7.8,.54,.38,.50),(9.2,.54,.35,.45),(10.8,.48,.29,.36),(12.4,.40,.21,.27),(13.8,.32,.15,.19),(14.7,.24,.11,.12),(15.2,.05,.04,.08)],power=.9,steps=3,n=40)
 loft('05 Flat beaver tail between nozzles',[(13.5,.36,.14,.02),(14.6,.36,.13,0),(15.3,.30,.10,-.02),(15.6,.14,.06,-.03),(15.7,.02,.02,-.03)],light,power=.7,steps=3,n=32)
 ellipsoid('IRST housing',(.2,3.78,.58),(.12,.16,.12),frame);ellipsoid('IRST lens',(.2,3.68,.62),(.09,.06,.08),glass)
 for s in [-1,1]:
  tag='Port' if s<0 else 'Starboard'
  fulcrum_nacelle(tag,s,[(6.85,.88,.42,.50,-.56,.55),(7.6,.885,.45,.51,-.58,.6),(9.0,.89,.47,.51,-.60,.65),(11.0,.89,.47,.50,-.60,.72),(13.0,.885,.46,.48,-.58,.82),(14.3,.88,.45,.46,-.56,.95),(14.95,.88,.4494,.4494,-.55,1)],1.15)
  nozzle(tag+' nozzle',s*.88,14.95,-.55,.42,1.0)
  loft(tag+' fin and tailplane boom',[(9.6,.03,.03,.05),(10.6,.12,.10,.07),(12,.18,.16,.07),(15.2,.2,.17,.05),(16.0,.17,.14,.03),(16.5,.04,.04,.01)],paint,s*1.72,.8,3,32)
  wing=foil(tag+' Fulcrum swept wing',[(1.2,8.45,13.2,.02,.14),(1.85,9.08,13.25,0,.13),(2.7,9.88,13.35,-.04,.11),(3.9,11.0,13.58,-.09,.085),(5.05,12.05,13.76,-.15,.055),(5.72,12.72,13.86,-.19,.028)],s)
  foil(tag+' Fulcrum stabilator',[(1.75,13.95,16.5,-.05,.09),(2.0,14.2,16.53,-.06,.085),(2.75,15.0,16.78,-.09,.065),(3.47,15.95,17.1,-.13,.04),(3.87,16.5,17.3,-.16,.02)],s,light)
  foil(tag+' outboard canted fin with root extension',[(0,10.2,15.95,.1,.075),(.3,11.75,15.93,.1,.072),(.7,12.55,15.91,.1,.068),(1.4,13.55,15.88,.1,.056),(2.0,14.45,15.85,.1,.045),(2.42,15.1,15.82,.1,.034)],s,vertical=True,xbase=1.72,cant=.105)
  seams_on(wing,[[(s*x,13.25+(x-1.85)*.155-.72) for x in [2.0,3.2,4.4,5.5]],[(s*x,9.08+(x-1.85)*.94+.5) for x in [2.0,3.2,4.4,5.5]]],tag+' wing control seams')
  for j in range(6):seams_on(body,[[(s*x,7.0+j*.15) for x in [.72,.88,1.04]]],tag+' auxiliary intake louver '+str(j))
  curve(tag+' navigation light',[(s*5.71,12.95,-.19),(s*5.71,13.15,-.19)],.023,red if s<0 else green)
def build(id):
 global L,air,aircoll,paint,light,radome,dark,seam,steel,frame,glass,red,green
 name,L,span=SPECS[id];out=ROOT/id;out.mkdir(parents=True,exist_ok=True)
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 air=[];aircoll=bpy.data.collections.new(name+' | Original visual exterior');bpy.context.scene.collection.children.link(aircoll)
 colors={'su27':(.37,.48,.54),'su33':(.31,.43,.50),'j11a':(.43,.47,.49),'mig29s':(.39,.46,.44)}
 paint=mat(name+' satin paint',colors[id],.22,.46);light=mat('Light control panels',tuple(min(1,c*1.10) for c in colors[id]),.18,.48);radome=mat('Dielectric nose',(.32,.36,.34) if id!='j11a' else(.28,.30,.31),.07,.56);dark=mat('Deep recess',(.008,.012,.014),.1,.62);seam=mat('Restrained panel seam',(.18,.23,.24),.15,.6);steel=mat('Heat-darkened exhaust metal',(.17,.16,.14),.78,.32);frame=mat('Canopy structural frame',tuple(c*.64 for c in colors[id]),.4,.32);glass=mat('Tinted canopy',(.028,.087,.106),.52,.18);glass.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.55;red=mat('Port lens',(.35,.012,.012),.3,.22);green=mat('Starboard lens',(.02,.29,.08),.3,.22)
 if id in ['su27','su33','j11a']:flanker(id)
 else:mig29()
 bpy.ops.object.select_all(action='DESELECT')
 for o in air:o.select_set(True)
 bpy.context.view_layer.objects.active=air[0];bpy.ops.object.convert(target='MESH');air=list(bpy.context.selected_objects)
 bpy.context.view_layer.update();pts=[o.matrix_world@v.co for o in air for v in o.data.vertices];lo=[min(p[k] for p in pts) for k in range(3)];hi=[max(p[k] for p in pts) for k in range(3)];sx=span/(hi[0]-lo[0]);sy=L/(hi[1]-lo[1]);cx=(hi[0]+lo[0])/2;cy=(hi[1]+lo[1])/2
 for o in air:
  world=o.matrix_world.copy()
  for v in o.data.vertices:p=world@v.co;v.co=((p.x-cx)*sx,(p.y-cy)*sy,p.z)
  o.matrix_world.identity()
 root=bpy.data.objects.new(name+' | Visual review prototype',None);aircoll.objects.link(root)
 for o in air:o.parent=root
 root['scope']='Original approximate exterior visual study only; no engineering or performance model.';root['configuration']='Clean airframe, gear retracted, no stores, neutral review paint.'
 bpy.ops.object.select_all(action='DESELECT')
 for o in air:o.select_set(True)
 bpy.context.view_layer.objects.active=air[0]
 bpy.ops.export_scene.gltf(filepath=str(out/'model.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
 floor=mat('Studio charcoal',(.038,.052,.063),.03,.74);bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.75));bpy.context.object.name='Studio floor';bpy.context.object.data.materials.append(floor)
 world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.22,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55
 def lamp(name,loc,power,size,color):
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
 lamp('Key softbox',(-9,7,15),3300,10,(.84,.92,1));lamp('Warm rim',(9,-7,12),3600,9,(1,.88,.72));lamp('Front fill',(5,14,5),1900,8,(.81,.89,1));lamp('Tail fill',(-6,-12,7),2000,8,(.8,.9,1))
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Review camera';sc=bpy.context.scene;sc.camera=cam;sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True;sc.render.threads_mode='FIXED';sc.render.threads=args.render_threads;sc.render.resolution_x=1200;sc.render.resolution_y=850;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX';cam.data.type='ORTHO';cam.data.clip_end=1000
 def view(file,loc,target,scale):
  cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;sc.render.filepath=str(out/(file+'.png'));bpy.ops.render.render(write_still=True)
 view('front',(18,24,17),(0,0,.1),max(L*1.03,span*1.3));view('top',(0,.001,32),(0,0,0),L*1.52);view('side',(96,0,14),(0,0,.5),L*1.08);view('rear',(-18,-24,13),(0,0,.1),max(L*1.03,span*1.3))
 cam.location=(18,24,17);cam.rotation_euler=(Vector((0,0,.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=max(L*1.03,span*1.3)
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'model.blend'))
 pts=[o.matrix_world@v.co for o in air for v in o.data.vertices];dims=[max(p[k] for p in pts)-min(p[k] for p in pts) for k in range(3)];tris=0
 for o in air:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
 caveats=['Original approximate exterior review asset; proportions use Fox3 JET_DIMENSIONS, not validated survey measurements.','Closed canopy, retracted landing gear, no stores, simplified inlets, exhausts, access panels and antennas.','Neutral review paint, not an authentic service livery.','Primary source DCS overview establishes aircraft families; official image gallery access returned HTTP 403 during research. Silhouettes use existing original app geometry plus artist approximation.']
 if id=='j11a':caveats+=['J-11A uses the closely related Su-27 external shell; subtle antenna and production-block differences not verified.']
 if id=='su33':caveats+=['Canards, wing-fold seam and retracted hook indicated; exact naval wing and folding mechanisms simplified.']
 if id=='mig29s':caveats+=['9-13 recognition cues represented: enlarged dorsal hump, broad flat centre body with LERX, raked wedge intakes under the LERX, widely spaced nacelles over a flat tunnel, outboard canted fins with root extensions on the tail booms, boom-mounted tailplanes, beaver tail between the nozzles and nose pitot probe; exact 9-13S panel and antenna fit not verified.','Planform, side and front proportions measured from the public Wikimedia Commons line drawing "Mikoyan MiG-29 3-view.svg" (https://commons.wikimedia.org/wiki/File:Mikoyan_MiG-29_3-view.svg, a 9-12 airframe) as a size reference only; no lines or geometry imported. The 9-13 hump height is an artist estimate.']
 manifest={'id':id,'name':name,'status':'review','length_m':L,'span_m':span,'dimensions_measured_m':{'span_x':dims[0],'length_z':dims[1],'height_y':dims[2]},'axis':{'gltf':'nose -Z, up +Y, right +X','blender':'nose +Y, up +Z, right +X','units':'metres','origin':'centered lateral and longitudinal bounds'},'reference_urls':['https://www.digitalcombatsimulator.com/en/products/flaming_cliffs/','https://www.digitalcombatsimulator.com/en/downloads/screenshots/283/'],'variant_caveats':caveats,'geometry_provenance':'Original scripted meshes; no downloaded meshes or external textures. Public recognition cues and original src/render/jets.ts silhouette guidance.','generator':'../create_fleet.py','rebuild_command':'Blender --background --python create_fleet.py -- --out OUTPUT --only '+id,'blender_version':bpy.app.version_string,'stats':{'objects':len(air),'triangles':tris,'vertices':sum(len(o.data.vertices) for o in air),'glb_bytes':(out/'model.glb').stat().st_size},'validation':{'actual_model_renders':['front.png','top.png','side.png','rear.png'],'visual_review':'pending image inspection','outstanding':'Browser/device performance, animation, exact variant review and app integration not performed'}}
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2));print('FLEET_MODEL_COMPLETE',id,manifest['stats'],flush=True)
for id in args.only or list(SPECS):build(id)
