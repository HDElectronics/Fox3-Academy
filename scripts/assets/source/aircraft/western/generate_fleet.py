"""Original exterior review studies. Run Blender --background --threads 3 --python this.py -- [id].
No source images, game assets, physics or engineering tables are embedded. Coordinates authored
nose-to-tail in metres; transformed to Blender nose +Y before glTF Y-up export.
"""
import bpy,bmesh,math,json,os,sys
from math import sin,cos,pi
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
SPECS={
'f15c':dict(name='F-15C Eagle',L=19.4,span=13.1,ref='https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104501/f-15-eagle/',caveat='F-15C family approximation. Single-seat canopy; antenna, nozzle and panel arrangements simplified.'),
'f16c':dict(name='F-16C Fighting Falcon',L=15.1,span=9.96,ref='https://www.jba.af.mil/About/Fact-Sheets/Display/Article/4282145/f-16c-fighting-falcon/',caveat='Block 50 visual approximation. Enlarged belly intake represented; exact block-specific antenna/nozzle and panel detail not verified.'),
'f14b':dict(name='F-14B Tomcat',L=19.1,span=19.55,ref='https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html',caveat='F-14B approximation with spread wings and simplified GE-style exhaust. Museum F-14A reference supports family silhouette only, not B-specific details. Wing pivots prepared but not animated.'),
'jf17':dict(name='JF-17 Thunder',L=14.9,span=9.45,ref='https://www.pac.org.pk/jf-17',caveat='Single-seat Block 1 visual approximation without refuelling probe. Side intake bumps and fin-tip fairing simplified; exact block-specific panel and antenna placement not verified.'),
'm2000c':dict(name='Mirage 2000C',L=14.4,span=9.13,ref='https://www.dassault-aviation.com/fr/defense/soutien-militaire/avions-soutenus/mirage-2000/',caveat='Single-seat RDI-family exterior approximation. Manufacturer family reference does not verify individual C-series antenna and radome details. Tailless delta, no horizontal stabilators.')}

def material(name,c,metal=0,rough=.48):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m

def mesh(name,v,f,m=None,smooth=True):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(m or paint)
 for p in me.polygons:p.use_smooth=smooth
 air.append(ob);return ob

def line(name,pts,r=.009,m=None):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=1;sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*co,1)
 ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(m or seam);air.append(ob);return ob

def interp(stations,steps=5):
 out=[]
 for i in range(len(stations)-1):
  a=stations[max(0,i-1)];b=stations[i];c=stations[i+1];d=stations[min(len(stations)-1,i+2)]
  for j in range(steps):
   t=j/steps;out.append(tuple(.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(len(b))))
 return out+[stations[-1]]

def loft(name,st,m=None,x=0,power=1,steps=5,N=48):
 ss=interp(st,steps);v=[];f=[]
 for y,w,h,z in ss:
  for j in range(N):
   a=2*pi*j/N;v.append((x+max(.001,w)*math.copysign(abs(cos(a))**power,cos(a)),y,z+max(.001,h)*math.copysign(abs(sin(a))**power,sin(a))))
 for i in range(len(ss)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;f.append((a,b,b+N,a+N))
 f.extend([tuple(range(N-1,-1,-1)),tuple((len(ss)-1)*N+j for j in range(N))]);return mesh(name,v,f,m)

def foil(name,st,s=1,m=None,fin=False,x0=0,cant=0):
 # Shape stations linearly in span: preserves deliberate planform corners.
 ss=[]
 for a,b in zip(st,st[1:]):
  for j in range(5):ss.append(tuple(a[k]+(b[k]-a[k])*j/5 for k in range(5)))
 ss.append(st[-1]);v=[];f=[];N=32
 for span,lead,trail,z,thick in ss:
  for j in range(N):
   a=2*pi*j/N;u=(1-cos(a))/2;y=lead+(trail-lead)*u;hh=thick*sin(a)*max(.03,1-u)**.4
   v.append((x0+span*cant+hh,y,z+span) if fin else (s*span,y,z+hh))
 for i in range(len(ss)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;f.append((a,b,b+N,a+N))
 f.extend([tuple(range(N-1,-1,-1)),tuple((len(ss)-1)*N+j for j in range(N))]);return mesh(name,v,f,m)

def canopy(st,tandem=False,bubble=False):
 ss=interp(st,7);v=[];f=[];N=28
 for y,w,h,z in ss:
  for j in range(N):a=pi*j/(N-1);v.append((w*cos(a),y,z+h*sin(a)))
 for i in range(len(ss)-1):
  for j in range(N-1):a=i*N+j;f.append((a,a+1,a+N+1,a+N))
 mesh('canopy.glazing',v,f,glass)
 for s in [-1,1]:line('canopy.sill.'+str(s),[(s*w,y,z+.012) for y,w,h,z in ss],.025,frame)
 bows=[int(len(ss)*.23),int(len(ss)*.78)] if not bubble else [int(len(ss)*.78)]
 if tandem:bows.append(int(len(ss)*.51))
 for i in bows:
  y,w,h,z=ss[i];line('canopy.frame',[(w*cos(pi*j/32),y,z+h*sin(pi*j/32)+.01) for j in range(33)],.025,frame)
 # Seats visible as dark shapes beneath the glass silhouette only, no cockpit systems.


def intake(name,st,x=0,p=.65):
 loft(name+'.fairing',st,x=x,power=p,steps=5)
 y,w,h,z=st[0];pts=[]
 for j in range(65):
  a=2*pi*j/64;pts.append((x+w*.89*math.copysign(abs(cos(a))**p,cos(a)),y-.021,z+h*.87*math.copysign(abs(sin(a))**p,sin(a))))
 mesh(name+'.shadow',pts[:-1],[tuple(range(64))],dark,False);line(name+'.lip',pts,.027,light)

def nozzle(name,x,y,r=.55,z=0,end=None):
 end=end or y+1
 loft(name+'.collar',[(y-.25,r*1.03,r*1.03,z),(y+.12,r,r,z)],steel,x,steps=2)
 for j in range(18):
  a=j*2*pi/18+.012;b=(j+1)*2*pi/18-.012;v=[]
  for yy,rr in [(y,r),(end-.12,r*.89),(end,r*.82)]:v.extend([(x+rr*cos(a),yy,z+rr*sin(a)),(x+rr*cos(b),yy,z+rr*sin(b))])
  mesh(name+'.petal.%02d'%j,v,[(0,1,3,2),(2,3,5,4)],steel,False)
 loft(name+'.recess',[(end-.22,r*.77,r*.77,z),(end-.16,r*.78,r*.78,z)],dark,x,steps=1)
 line(name+'.rim',[(x+r*.82*cos(2*pi*j/64),end,z+r*.82*sin(2*pi*j/64)) for j in range(65)],.012,steel)

def fuselage(st,radidx=3,power=1):
 loft('fuselage.shell',st[radidx:],power=power)
 loft('radome',st[:radidx+1],nosemat,power=power)
 y,w,h,z=st[radidx];line('radome.joint',[(w*cos(2*pi*j/64),y,z+h*sin(2*pi*j/64)) for j in range(65)],.008)

def wing(name,st,s):
 ob=foil(name,st,s)
 # Fine, slightly raised trailing seam; intentionally no fictional text/insignia.
 pts=[]
 for x,le,tr,z,t in st:
  u=.78;a=math.acos(1-2*u);pts.append((s*x,le+(tr-le)*u,z+t*sin(a)*(1-u)**.4+.003))
 line(name+'.trailing-seam',pts,.007)
 return ob

def tail(name,st,s):return foil(name,st,s,light)
def fin(name,st,x=0,cant=0):
 ob=foil(name,st,fin=True,x0=x,cant=cant)
 pts=[(x+h*cant+.025,le+(tr-le)*.78,z+h) for h,le,tr,z,t in st]
 line(name+'.rudder-seam',pts,.007);return ob

def rail(s,x,y0,y1,z=0):
 loft('wingtip.rail.'+str(s),[(y0,.02,.02,z),(y0+.14,.06,.075,z),(y1-.14,.06,.075,z),(y1,.02,.02,z)],frame,s*x,steps=2,N=24)

def build_f15():
 fuselage([(0,.002,.002,.08),(.7,.23,.23,.08),(1.9,.46,.42,.07),(3.35,.65,.57,.08),(4.7,.75,.68,.1),(6.2,.9,.73,.09),(8.3,1.25,.68,.02),(10.6,1.4,.58,0),(13.5,1.38,.5,0),(16,1.25,.42,-.03),(18.2,.82,.22,-.04)],power=.86)
 canopy([(3.25,.01,.01,.59),(3.75,.42,.4,.65),(4.7,.56,.69,.69),(5.7,.54,.69,.72),(6.7,.43,.41,.7),(7.1,.01,.01,.65)])
 loft('dorsal.spine',[(6.5,.4,.17,.63),(7.5,.7,.26,.58),(9.5,.63,.2,.55),(12,.5,.14,.47),(15,.24,.08,.39),(16.8,.01,.01,.35)])
 for s in [-1,1]:
  intake('intake.'+str(s),[(5.85,.62,.64,-.04),(7.3,.68,.69,-.06),(9.3,.69,.66,-.05),(11.0,.65,.61,-.07)],s*1.10,.28)
  loft('engine.shoulder.'+str(s),[(9.1,.70,.62,-.07),(11.5,.73,.62,-.07),(14.5,.68,.6,-.08),(16.6,.63,.57,-.08),(18.15,.57,.54,-.08)],x=s*.97,power=.8)
  # Variable-ramp rectangular front slopes and outer shoulder distinct from rounded aft nozzle.
  wing('wing.main.'+str(s),[(1.18,8.2,15.90,.48,.16),(2.3,9.30,15.72,.46,.14),(4.1,11.10,15.44,.4,.1),(6.20,13.22,15.10,.33,.045),(6.55,13.58,14.35,.32,.028)],s)
  tail('stabilator.'+str(s),[(1.10,15.6,19.30,-.05,.13),(1.85,15.98,19.30,-.08,.10),(4.3,18.05,19.09,-.22,.026)],s)
  fin('fin.'+str(s),[(0,13.45,18.45,.41,.14),(1.05,14.40,18.09,.41,.11),(2.70,15.95,17.50,.41,.06),(3.08,16.27,17.47,.41,.025)],s*1.37,0)
  nozzle('exhaust.'+str(s),s*.91,18.15,.57,-.08,19.4)
  for j in range(6):line('cooling.vent',[(s*1.0,11.7+j*.13,.59),(s*1.32,11.7+j*.13,.50)],.014,dark)
 # Closed dorsal speedbrake outline.
 line('speedbrake.outline',[(-.52,7.7,.835),(.52,7.7,.835),(.56,9.8,.756),(-.56,9.8,.756),(-.52,7.7,.835)],.007)

def build_f16():
 fuselage([(0,.002,.002,.22),(.7,.23,.23,.22),(1.65,.40,.37,.18),(2.75,.54,.49,.14),(4.3,.65,.6,.12),(6.3,.79,.59,.07),(8.8,.87,.6,.04),(11.4,.75,.58,.02),(13.95,.57,.55,.02)],power=.95)
 canopy([(2.2,.015,.01,.55),(2.65,.37,.41,.57),(3.3,.52,.69,.60),(4.2,.57,.76,.64),(5.2,.48,.61,.64),(5.85,.25,.28,.62),(6.13,.01,.01,.59)],bubble=True)
 intake('belly-intake',[(4.04,.58,.38,-.68),(4.5,.64,.40,-.67),(6.4,.66,.42,-.62),(8.3,.61,.36,-.49),(10.3,.35,.27,-.35)],p=.72)
 loft('dorsal.spine',[(5.8,.26,.13,.59),(6.6,.47,.21,.54),(8.5,.4,.15,.53),(10.5,.22,.1,.55),(11.4,.02,.01,.56)])
 for s in [-1,1]:
  foil('strake.'+str(s),[(.43,3.9,9,.16,.065),(.72,4.8,9.6,.1,.05),(1.21,6.6,10.0,.04,.022)],s)
  wing('wing.main.'+str(s),[(.65,6.15,11.62,.015,.12),(1.5,7.05,11.64,.01,.10),(3.0,8.75,11.58,0,.07),(4.92,10.55,11.48,-.03,.025)],s)
  rail(s,4.92,9.55,12.16,-.025)
  tail('stabilator.'+str(s),[(.6,11.54,14.85,-.06,.1),(1.3,11.96,14.77,-.14,.08),(2.90,13.58,14.48,-.36,.025)],s)
  fin('ventral-fin.'+str(s),[(0,10.85,13.2,-.45,.06),(-.70,11.62,12.82,-.45,.025)],s*.50,-s*.35)
 nozzle('exhaust',0,13.98,.565,.02,15.1)
 fin('fin.vertical',[(0,9.10,13.55,.48,.14),(.45,10.80,13.60,.48,.11),(1.0,11.70,13.71,.48,.08),(2.95,12.95,14.00,.48,.025)])
 loft('fin.base-fairing',[(9,.015,.02,.59),(10.3,.24,.22,.59),(12.7,.23,.21,.59),(14.1,.17,.15,.50),(14.6,.03,.02,.42)],power=.65)

def build_f14():
 fuselage([(0,.002,.002,.20),(.7,.25,.25,.2),(1.7,.46,.42,.22),(3.1,.65,.59,.23),(4.6,.75,.7,.27),(6.5,.83,.8,.26),(8.5,.98,.67,.23),(10.6,1.15,.48,.15),(13.8,1.06,.34,.09),(16.7,.84,.28,.03),(18.8,.45,.08,0)],power=.8)
 canopy([(3.35,.01,.01,.76),(3.95,.44,.46,.82),(4.8,.57,.69,.85),(6.0,.58,.72,.91),(7.1,.54,.62,.90),(8.0,.39,.37,.83),(8.5,.01,.01,.73)],tandem=True)
 for s in [-1,1]:
  intake('intake.'+str(s),[(6.7,.59,.64,-.08),(8.2,.67,.7,-.12),(11.6,.67,.63,-.13),(15.4,.62,.57,-.14),(17.78,.55,.53,-.15)],s*1.6,.32)
  foil('wing.fixed-glove.'+str(s),[(.62,5.1,17.1,.28,.15),(1.6,6.95,16.5,.24,.14),(2.65,8.75,14.95,.20,.13),(3.3,10.05,13.32,.18,.09)],s)
  ob=wing('wing.swing.'+('port' if s>0 else 'starboard'),[(2.82,9.94,13.58,.18,.12),(3.6,10.25,13.66,.18,.115),(6.4,11.32,13.81,.15,.085),(9.775,12.55,13.95,.10,.025)],s)
  ob['pivot_authored_metres']=[s*2.8,11.1,.18];ob['reference_sweep_degrees']=20;ob['animation']='Not rigged; original separate wing mesh retained'
  tail('stabilator.'+str(s),[(1.98,14.81,18.98,-.16,.13),(2.5,15.15,18.88,-.18,.11),(4.86,17.37,18.47,-.30,.026)],s)
  fin('fin.'+str(s),[(0,12.73,17.98,.38,.15),(1.1,13.70,17.70,.38,.11),(2.65,15.14,17.2,.38,.055),(3.03,15.53,17.00,.38,.024)],s*1.61,s*.08)
  fin('ventral-fin.'+str(s),[(0,13.8,16.35,-.59,.08),(-.68,14.62,15.8,-.59,.025)],s*1.60,-s*.13)
  nozzle('exhaust.'+str(s),s*1.6,17.78,.55,-.15,19.1)
 foil('beavertail',[(0,15.6,18.98,.04,.13),(.72,16.2,18.82,.04,.085),(.96,16.8,18.2,.04,.04)],1)
 foil('beavertail.port',[(0,15.6,18.98,.04,.13),(.72,16.2,18.82,.04,.085),(.96,16.8,18.2,.04,.04)],-1)


def build_jf17():
 fuselage([(0,.002,.002,.12),(.65,.21,.22,.12),(1.7,.4,.38,.11),(2.8,.52,.5,.10),(4.4,.64,.65,.10),(6.3,.76,.7,.07),(8.7,.85,.66,.04),(11.2,.73,.57,.02),(13.88,.49,.47,.02)],power=.9)
 canopy([(2.80,.01,.01,.55),(3.25,.38,.37,.61),(4.0,.49,.63,.68),(4.9,.47,.58,.73),(5.65,.34,.32,.71),(6.05,.01,.01,.65)])
 loft('dorsal.spine',[(5.6,.28,.16,.64),(6.5,.44,.27,.60),(8,.4,.26,.57),(10,.28,.19,.57),(11.2,.05,.02,.55)])
 for s in [-1,1]:
  intake('intake.'+str(s),[(4.60,.32,.48,-.04),(5.35,.41,.54,-.07),(7.1,.4,.53,-.05),(8.8,.25,.4,-.01)],s*.91,.45)
  loft('intake.bump.'+str(s),[(4.12,.02,.03,.02),(4.58,.14,.36,.02),(5.2,.17,.42,.02),(6.1,.10,.3,.01),(6.6,.01,.01,.01)],paint,s*.67,steps=4)
  foil('strake.'+str(s),[(.53,4.65,8.45,.22,.065),(.89,5.8,8.5,.13,.045),(1.4,7.28,8.30,.06,.02)],s)
  wing('wing.main.'+str(s),[(.7,7.0,11.5,.03,.12),(1.5,7.58,11.42,.02,.095),(3,8.81,11.19,0,.065),(4.665,10.02,10.95,-.05,.024)],s)
  rail(s,4.665,9.24,11.65,-.04)
  tail('stabilator.'+str(s),[(.64,11.35,14.39,-.08,.09),(1.3,11.83,14.27,-.10,.07),(2.72,13.2,13.95,-.18,.024)],s)
  fin('ventral-fin.'+str(s),[(0,10.8,12.96,-.46,.07),(-.6,11.45,12.57,-.46,.024)],s*.51,-s*.33)
 fin('fin.vertical',[(0,9.03,13.92,.46,.13),(.6,9.73,13.81,.46,.11),(2.4,11.74,13.30,.46,.045),(2.8,12.22,13.2,.46,.024)])
 loft('fin.tip-fairing',[(11.85,.025,.025,3.26),(12.04,.095,.10,3.26),(13.4,.08,.095,3.26),(13.62,.02,.02,3.26)],frame,steps=2,N=24)
 nozzle('exhaust',0,13.8,.49,.02,14.9)

def build_mirage():
 fuselage([(0,.002,.002,.12),(.7,.19,.19,.12),(1.8,.37,.37,.11),(3,.50,.48,.12),(4.4,.61,.65,.15),(6.2,.72,.73,.13),(8.5,.80,.67,.08),(10.8,.73,.59,.05),(12.9,.56,.53,.03)],power=.96)
 canopy([(3.45,.01,.01,.60),(3.93,.38,.34,.66),(4.6,.5,.60,.76),(5.3,.49,.59,.78),(6.05,.33,.32,.77),(6.45,.01,.01,.70)])
 for s in [-1,1]:
  intake('intake.'+str(s),[(5.26,.35,.46,-.07),(6.1,.43,.51,-.08),(7.7,.43,.48,-.08),(9.4,.27,.38,-.02)],s*.92,.9)
  loft('intake.cone.'+str(s),[(4.86,.003,.003,-.07),(5.45,.19,.23,-.07),(5.9,.20,.25,-.07)],paint,s*.83,steps=5)
  foil('intake.strake.'+str(s),[(1.1,5.9,7.4,.38,.035),(1.56,6.65,7.05,.39,.01)],s)
  wing('wing.delta.'+str(s),[(.58,6.02,13.15,-.05,.16),(1.55,7.57,13.10,-.06,.13),(3.0,9.9,12.98,-.09,.09),(4.565,12.30,12.84,-.13,.025)],s)
 fin('fin.vertical',[(0,8.02,13.44,.5,.13),(.8,9.03,13.19,.5,.11),(2.74,11.23,12.71,.5,.045),(3.15,11.71,12.56,.5,.023)])
 loft('dorsal.spine',[(6.04,.3,.13,.72),(7,.37,.19,.68),(8.6,.28,.17,.65),(10.4,.2,.15,.59),(11.6,.01,.01,.57)])
 nozzle('exhaust',0,12.99,.555,.03,14.4)
 # Nose pitot shown within the agreed model length envelope, simplified visual cue.
 line('nose.pitot',[(0,0,.12),(0,.48,.12)],.014,steel)

BUILD={'f15c':build_f15,'f16c':build_f16,'f14b':build_f14,'jf17':build_jf17,'m2000c':build_mirage}

def main(aid):
 global air,paint,light,nosemat,dark,seam,steel,frame,glass
 cfg=SPECS[aid];dest=os.path.join(OUT,aid);os.makedirs(dest,exist_ok=True)
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)
 air=[];paint=material('airframe | neutral grey',(.40,.445,.48),.24,.43);light=material('control surfaces',(.45,.48,.51),.2,.44);nosemat=material('dielectric radome',(.32,.35,.37),.02,.56);dark=material('deep recess',(.012,.018,.025),.15,.65);seam=material('panel seams',(.20,.235,.255),.1,.65);steel=material('nozzle titanium',(.20,.19,.17),.8,.32);frame=material('canopy frame',(.23,.27,.29),.35,.35);glass=material('tinted canopy',(.045,.10,.145),.55,.15);glass.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.6
 if aid=='m2000c':paint.diffuse_color=(.38,.45,.50,1);paint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.38,.45,.50,1)
 BUILD[aid]()
 # Convert all curves BEFORE export so fine lines survive as meshes in glTF.
 bpy.ops.object.select_all(action='DESELECT')
 for ob in air:ob.select_set(True)
 bpy.context.view_layer.objects.active=air[0];bpy.ops.object.convert(target='MESH')
 air=list(bpy.context.selected_objects)
 # Bake right-handed orientation: nose +Y, up +Z. Mirror longitudinal authored coordinates
 # and x together (a 180-degree yaw) to preserve winding and native handedness.
 for ob in air:
  for v in ob.data.vertices:v.co.x=-v.co.x;v.co.y=cfg['L']/2-v.co.y
  ob.data.update()
 coll=bpy.data.collections.new(aid+' | original exterior review');bpy.context.scene.collection.children.link(coll)
 root=bpy.data.objects.new(aid+'.root',None);coll.objects.link(root)
 root['provenance']='Original scripted exterior mesh by Fox3 Academy workflow; no imported meshes or textures.';root['scope']='Visual game asset review only';root['variant_caveat']=cfg['caveat'];root['axes']='Blender +Y nose / +Z up; GLB -Z nose / +Y up / +X right'
 for ob in air:
  for c in list(ob.users_collection):c.objects.unlink(ob)
  coll.objects.link(ob);ob.parent=root
 # Put independent Tomcat wing origins at the authored approximate pivot for later animation.
 if aid=='f14b':
  for ob in air:
   if ob.name.startswith('wing.swing.') and not '.trailing' in ob.name:
    old=ob.get('pivot_authored_metres');p=Vector((-old[0],cfg['L']/2-old[1],old[2]))
    for v in ob.data.vertices:v.co-=p
    ob.location=p;ob['pivot_glb_metres']=[p.x,p.z,-p.y]
    for detail in air:
     if detail.name==ob.name+'.trailing-seam':
      detail.parent=ob
      for v in detail.data.vertices:v.co-=p
 bpy.context.view_layer.update()
 coords=[ob.matrix_world@v.co for ob in air for v in ob.data.vertices];mins=[min(v[i] for v in coords) for i in range(3)];maxs=[max(v[i] for v in coords) for i in range(3)];dims=[maxs[i]-mins[i] for i in range(3)]
 bpy.ops.object.select_all(action='DESELECT')
 for ob in air:ob.select_set(True)
 root.select_set(True);bpy.context.view_layer.objects.active=air[0]
 bpy.ops.export_scene.gltf(filepath=dest+'/model.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
 tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in air)
 manifest=dict(id=aid,name=cfg['name'],status='review',length=cfg['L'],span=cfg['span'],dimension_source='Approximate repository src/render/jets.ts JET_DIMENSIONS; not a precision real-aircraft survey',measured_dimensions_metres=dict(span=round(dims[0],4),length=round(dims[1],4),height=round(dims[2],4)),axes=dict(glb='metres, nose -Z, up +Y, right +X',blend='metres, nose +Y, up +Z, right +X'),refs=[dict(url=cfg['ref'],role='Primary family exterior/silhouette reference; no image assets redistributed',accessed='2026-09-25')],variant_caveats=[cfg['caveat'],'Original clean exterior study, closed gear and no weapon stores. Surface seams illustrative; not maintenance documentation.'],provenance='Original generated geometry; shared authored loft/foil helper code; no DCS asset extraction or downloaded meshes/textures.',stats=dict(triangles=tris,objects=len(air),glb_bytes=os.path.getsize(dest+'/model.glb')),review=['Front-quarter, top and side rendered using Blender Cycles CPU','Visual review pending until images inspected'],generator='../generate_fleet.py')
 if aid=='f15c':manifest['refs'].append(dict(url='https://commons.wikimedia.org/wiki/File:McDonnell_Douglas_F-15_Eagle_drawing.png',role='US Army FM 44-80 aircraft recognition three-view mirrored on Commons; inspected for wing and tail silhouette',accessed='2026-09-25'))
 if aid=='f16c':manifest['refs'].append(dict(url='https://www.dvidshub.net/image/8311154/comin-hot-aircraft-arrive-tampa-bay-airfest',role='USAF photo inspected for belly intake and bubble canopy',accessed='2026-09-25'))
 if aid=='jf17':manifest['refs'][0]['role']='Manufacturer reference identified; direct page unavailable during this session. Variant geometry remains approximate.'
 with open(dest+'/manifest.json','w') as f:json.dump(manifest,f,indent=2)
 floor=material('studio floor',(.035,.05,.065),.0,.8);bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.9));bpy.context.object.name='STUDIO.floor';bpy.context.object.data.materials.append(floor)
 sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.23,.29,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.4
 def area(name,pos,power,size,color):
  bpy.ops.object.light_add(type='AREA',location=pos);ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size;ob.data.color=color;ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
 area('STUDIO.key',(-9,8,14),2900,10,(.86,.93,1));area('STUDIO.rim',(8,-7,12),3300,9,(1,.88,.74));area('STUDIO.front',(2,15,5),1800,8,(.82,.90,1));area('STUDIO.tail',(-6,-12,6),1600,8,(.77,.86,1))
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='STUDIO.review-camera';sc.camera=cam;cam.data.type='ORTHO';sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True;sc.render.resolution_x=1200;sc.render.resolution_y=850;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
 def view(name,pos,scale):
  cam.location=pos;cam.rotation_euler=(Vector((0,0,.3))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;sc.render.filepath=dest+'/'+name+'.png';bpy.ops.render.render(write_still=True)
 L=cfg['L'];span=cfg['span'];view('front',(L*.94,L*1.25,L*.76),max(L*1.12,span*1.32));view('top',(0,.00001,L*2),max(L*1.60,span*1.15));view('side',(L*2,0,.3),L*1.12)
 if aid in ['f15c','f14b']:view('rear',(-L*.98,-L*1.1,L*.6),max(L*1.10,span*1.22))
 cam.location=(L*.94,L*1.25,L*.76);cam.rotation_euler=(Vector((0,0,.3))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=max(L*1.12,span*1.32)
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
 for screen in bpy.data.screens:
  for a in screen.areas:
   if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=dest+'/model.blend');print('COMPLETE',aid,json.dumps(manifest['stats']))
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out',default=OUT)
parser.add_argument('--only',nargs='+',choices=list(SPECS))
parser.add_argument('ids',nargs='*',choices=list(SPECS))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(args.out)
os.makedirs(OUT,exist_ok=True)
for aid in (args.only or args.ids or list(SPECS)):main(aid)
