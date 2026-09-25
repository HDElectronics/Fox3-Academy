"""Original game exterior review assets; no engineering/internals or downloaded assets.
Blender --background --threads 2 --python generate_ground.py -- --out DIRECTORY [--only ID ...].
Native front +Y/up +Z; exported glTF front -Z/up+Y. Artist approximate dimensions.
"""
import bpy,bmesh,math,json,os,sys,argparse
from mathutils import Vector
from math import pi,sin,cos
NAMES={'tank':'Generic main battle tank','apc':'Generic 8-wheel APC','truck':'Generic 6-wheel cargo truck','bunker':'Generic concrete bunker','building':'Generic industrial building','sam-site':'Generic mobile SAM launcher','aaa':'Generic tracked anti-aircraft vehicle','sa10':'SA-10 / S-300PS-family launcher','sa11':'SA-11 / Buk-M1-family TELAR','sa15':'SA-15 / Tor-family vehicle'}
LENGTHS={'tank':9.5,'apc':7.5,'truck':8,'bunker':14,'building':40,'sam-site':9,'aaa':6.5,'sa10':12.5,'sa11':9.3,'sa15':7.5}
REFS={'sa10':['https://kpopov.ru/travel/avtovaz_pvo_12.htm'],'sa11':['https://www.recomonkey.com/Land-Platforms/Air-defence/Self-Propelled/9K37M1-Buk-M1-SA11-Gadfly/9A310M1-Buk-M1-TELAR'],'sa15':['https://pvo.guns.ru/expo/mvsv2008.htm','https://spb.army.gr/a-a-systima-k-v-tor-m1/']}
CAVEATS={'sa10':'Simplified S-300PS family 8x8 launcher exterior, four raised transport canisters; not a complete battery and not a precise 5P85 subvariant. Cab, chassis, canister proportions and fittings are artist approximations.','sa11':'Buk-M1 family exterior approximation with four visible store shapes and curved front dish silhouette. Museum exterior photo supports broad family recognition; exact dimensions, attachments and variant-specific geometry not verified.','sa15':'Tor family tracked vehicle approximation. Tor exhibition exterior photo supports broad family recognition; exact DCS Tor/9A331 details, panel curvature and fittings not verified.'}


def mat(name,c,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m

def mesh(name,vs,fs,m):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(m);parts.append(ob);return ob

def box(n,loc,size,m=None,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m or olive)
 if bevel:
  mod=o.modifiers.new('soft exterior edges','BEVEL');mod.width=min(bevel,min(size)*.2);mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 parts.append(o);return o

def cyl(n,a,b,r,m=None,r2=None,N=24):
 a=Vector(a);b=Vector(b);d=b-a;bpy.ops.mesh.primitive_cone_add(vertices=N,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=n;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(m or olive)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 parts.append(o);return o

def hull(n,w,l,z0,z1,topw=None,topl=None,y=0,m=None):
 a=w/2;b=l/2;c=(topw or w*.9)/2;d=(topl or l*.9)/2
 return mesh(n,[(-a,y-b,z0),(a,y-b,z0),(a,y+b,z0),(-a,y+b,z0),(-c,y-d,z1),(c,y-d,z1),(c,y+d,z1),(-c,y+d,z1)],[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],m or olive)

def tire(n,x,y,r=.57,width=.40):
 s=1 if x>0 else -1
 cyl(n+'.rubber',(x-width/2,y,r),(x+width/2,y,r),r,rubber,N=32)
 cyl(n+'.rim',(x+s*width*.51,y,r),(x+s*width*.57,y,r),r*.62,steel,N=20)
 cyl(n+'.hub',(x+s*width*.55,y,r),(x+s*width*.67,y,r),r*.23,olive,N=16)
 for j in range(20):
  a=2*pi*j/20;o=box(n+'.tread',(x,y+(r-.013)*sin(a),r+(r-.013)*cos(a)),(width*1.03,.09,.052),rubber,.012);o.rotation_euler.x=-a

def wheels(l=7,w=2.8,ys=None,r=.58):
 for s in [-1,1]:
  for j,y in enumerate(ys or [l*.33,-l*.12,-l*.34]):tire('wheels.'+str(s)+'.'+str(j),s*(w/2-.14),y,r)
 box('chassis.frame',(0,0,.79),(w*.68,l*.96,.25),dark)


def tracks(l=6.8,w=3.3,nw=6):
 # Capsule outline track loop, closed thick belt with exposed inner wheels.
 rr=.61;cy=l/2-rr
 for s in [-1,1]:
  x=s*(w/2-.3);vs=[];path=[]
  for end,base in [(cy,-pi/2),(-cy,pi/2)]:
   for j in range(15):
    a=base+pi*j/14;path.append((end+rr*cos(a),.69+rr*sin(a)))
  K=len(path)
  for xx,shrink in [(x-.3,0),(x+.3,0),(x-.3,.10),(x+.3,.10)]:
   for y,z in path:
    localy=max(-cy,min(cy,y));dv=Vector((y-localy,z-.69)).normalized();vs.append((xx,y-dv.x*shrink,z-dv.y*shrink))
  fs=[]
  for j in range(K):
   k=(j+1)%K
   fs += [(j,k,K+k,K+j),(2*K+j,3*K+j,3*K+k,2*K+k),(j,2*K+j,2*K+k,k),(K+j,K+k,3*K+k,3*K+j)]
  mesh('tracks.belt.'+str(s),vs,fs,rubber)
  for j in range(nw):
   y=-cy+2*cy*j/(nw-1);cyl('tracks.roadwheel',(x-.33,y,.63),(x+.33,y,.63),.47,olive,N=24);cyl('tracks.hub',(x+s*.32,y,.63),(x+s*.37,y,.63),.17,steel,N=16)
  for j in range(27):
   y=-cy+2*cy*j/26
   for z in [.065,1.3]:box('tracks.shoe',(x,y,z),(.65,.14,.055),steel,.01)
  for end in [-1,1]:
   for j in range(13):
    a=(-pi/2 if end>0 else pi/2)+pi*j/12;y=end*cy+rr*cos(a);z=.69+rr*sin(a);o=box('tracks.end-shoe',(x,y,z),(.65,.14,.055),steel,.01);o.rotation_euler.x=pi/2-a
 box('chassis.floor',(0,0,.67),(w*.68,l*.83,.45),dark)


def lights(y,z,w):
 for s in [-1,1]:
  box('front.lamp-frame',(s*w*.37,y,z),(.25,.11,.20),dark)
  box('front.headlight',(s*w*.37,y+.06,z),(.18,.025,.12),lamp,.01)

def hatch(x,y,z,r=.34):
 cyl('details.hatch',(x,y,z),(x,y,z+.06),r,olive,N=24);box('details.hatch-handle',(x,y,z+.11),(.22,.05,.055),steel,.01)

def grill(x,y,z,w=.8,l=.8):
 box('details.grill-base',(x,y,z),(w,l,.025),dark,.006)
 for j in range(8):box('details.grill-slat',(x,y-l*.43+l*.86*j/7,z+.025),(w*.9,.025,.025),steel,.003)

def antenna(x,y,z,h=.9):cyl('details.aerial',(x,y,z),(x,y,z+h),.018,dark,N=8)

def tank():
 tracks();hull('hull.main',3.4,6.65,.96,1.7,3.18,5.8)
 for s in [-1,1]:
  box('hull.fender',(s*1.51,0,1.48),(.53,6.55,.12),olive)
  for j in range(5):box('hull.skirt',(s*1.71,-2.1+j*1.08,1.12),(.08,.98,.72),light)
 hull('turret.shell',2.45,3.1,1.64,2.55,1.75,2.1,y=.15);box('turret.front-mantlet',(0,1.66,2.09),(.73,.7,.57),light)
 cyl('barrel.exterior',(0,1.68,2.14),(0,5.45,2.14),.115,steel,r2=.081)
 cyl('barrel.sleeve',(0,2.6,2.14),(0,3.1,2.14),.16,olive)
 cyl('barrel.muzzle-shadow',(0,5.445,2.14),(0,5.456,2.14),.061,dark)
 for s in [-1,1]:hatch(s*.55,.0,2.55,.30)
 grill(0,-2.1,1.713,1.7,1.1);antenna(-.8,-.7,2.4);lights(3.13,1.25,3.25)
 for s in [-1,1]:box('turret.stowage',(s*1.12,-.65,2.12),(.25,1.05,.45),olive)

def apc():
 wheels(7.2,2.9,ys=[2.35,.83,-.85,-2.4],r=.64);hull('hull.main',2.65,7.2,.66,1.9,2.24,6.3)
 hull('hull.roof',2.24,5.0,1.87,2.24,1.82,4.45,y=-.2)
 for s in [-1,1]:
  box('front.driver-window',(s*.53,2.8,2.025),(.72,.08,.29),glass,.015)
  for j in range(3):box('hull.vision-port',(s*1.155,1.35-j*1.12,1.84),(.035,.23,.11),glass,.004)
  box('hull.side-door',(s*1.29,-.3,1.26),(.035,.88,.7),light)
  box('hull.door-handle',(s*1.318,-.3,1.48),(.03,.20,.04),steel)
 cyl('turret.base',(0,-.0,2.20),(0,0,2.55),.63,olive);hull('turret.small',.9,1.1,2.5,2.89,.62,.8)
 cyl('turret.exterior-tube',(0,.48,2.69),(0,1.62,2.69),.045,steel,N=12)
 hatch(-.6,1.6,2.23,.26);hatch(.5,-1.6,2.23,.31);grill(0,-2.55,1.935,1.3,.48);lights(3.48,1.09,2.55);antenna(-.65,-1.8,2.23)


def truck(base=False,l=8,w=2.55):
 wheels(l,w,r=.59)
 box('truck.chassis',(0,0,.93),(w*.82,l-.12,.40),olive)
 box('front.cab',(0,l/2-1.45,1.9),(w,2.05,2.04),olive,.09)
 box('front.hood',(0,l/2-.15,1.41),(w*.90,.74,.74),olive,.07)
 for s in [-1,1]:
  box('front.windshield',(s*w*.23,l/2-.418,2.25),(w*.42,.027,.66),glass,.012)
  box('front.side-glass',(s*(w/2+.01),l/2-1.05,2.22),(.023,.88,.59),glass,.012)
  box('front.door-seam',(s*(w/2+.012),l/2-1.42,1.68),(.025,1.13,.48),light,.01)
  box('front.door-handle',(s*(w/2+.031),l/2-1.82,1.95),(.03,.19,.05),steel)
  cyl('front.mirror-stem',(s*w/2,l/2-.5,2.2),(s*(w/2+.29),l/2-.5,2.3),.025,steel,N=10)
  box('front.mirror',(s*(w/2+.29),l/2-.5,2.35),(.075,.24,.32),dark,.03)
  box('truck.step',(s*w*.48,l/2-1.8,.90),(.5,.48,.10),steel)
 box('front.bumper',(0,l/2+.24,.72),(w+.18,.20,.24),steel)
 for s in [-1,1]:box('front.bumper-support',(s*w*.28,l/2,.74),(.18,.65,.16),steel)
 for j in range(7):box('front.grille',(0,l/2+.227,1.44+j*.045),(w*.43,.031,.018),dark,.001)
 lights(l/2+.235,1.23,w)
 if not base:
  box('cargo.bed',(0,-1.05,1.26),(w+.05,4.66,.28),olive)
  for s in [-1,1]:
   box('cargo.sideboard',(s*w/2,-1.05,1.87),(.10,4.63,.93),olive)
   for j in range(5):box('cargo.rib',(s*(w/2+.055),-3.1+j*1.03,1.89),(.055,.075,.93),light)
  box('cargo.tailgate',(0,-3.38,1.9),(w,.11,.96),olive)
  # Canvas arched shell, open aft lower panel highlights bed.
  pts=[];K=13
  for y in [1.16,-3.33]:
   for j in range(K):a=pi*j/(K-1);pts.append((w/2*cos(a),y,2.18+.95*sin(a)))
  mesh('cargo.canvas',pts,[tuple(range(K-1,-1,-1)),tuple(K+j for j in range(K))]+[(j,j+1,j+K+1,j+K) for j in range(K-1)],canvas)
  for y in [-3.32,-2.2,-1.1,0,1.15]:
   for j in range(K-1):a=pi*j/(K-1);b=pi*(j+1)/(K-1);cyl('cargo.canvas-seam',(w/2*cos(a),y,2.185+.95*sin(a)),(w/2*cos(b),y,2.185+.95*sin(b)),.018,light,N=6)


def bunker():
 hull('structure.concrete',13.7,11.8,0,3.35,11.7,10.15,m=concrete)
 box('structure.roof',(0,0,3.32),(12.4,10.85,.68),concrete,.20)
 # Recessed front apertures are dark inset panels within a concrete reveal frame.
 box('front.aperture',(0,5.376,1.95),(5.5,.05,.62),dark,.03)
 for x in [-3,3]:box('front.reveal-pier',(x,5.35,1.96),(.5,.35,1.1),concrete,.04)
 box('front.reveal-lintel',(0,5.45,2.55),(6.5,.45,.28),concrete)
 box('front.reveal-sill',(0,5.66,1.5),(6.4,.55,.26),concrete)
 box('rear.access-door',(0,-5.37,1.34),(1.25,.07,2.5),steel,.04)
 for s in [-1,1]:
  for j in range(5):box('structure.panel-joint',(s*6.2,-3.9+j*1.9,2.55),(.015,.022,.8),light,.002)
 cyl('structure.vent',(3,-2.8,3.6),(3,-2.8,4.20),.22,steel);cyl('structure.vent-cap',(3,-2.8,4.17),(3,-2.8,4.27),.40,steel)


def building():
 box('structure.foundation',(0,0,.24),(23.9,39.9,.48),concrete,.04)
 box('structure.walls',(0,0,5.3),(22.8,38.8,10.3),wall,.05)
 mesh('structure.pitched-roof',[(-12,-20,10.4),(12,-20,10.4),(0,-20,13.3),(-12,20,10.4),(12,20,10.4),(0,20,13.3)],[(0,1,2),(5,4,3),(0,3,4,1),(0,2,5,3),(2,1,4,5)],roof)
 for s in [-1,1]:
  for y in [-16,-8,0,8,16]:
   box('structure.pilaster',(s*11.49,y,5.25),(.20,.35,10.05),concrete)
   for z in [4.2,7.7]:
    box('structure.window-frame',(s*11.427,y+2.1,z),(.11,3.1,1.75),steel)
    box('structure.window',(s*11.49,y+2.1,z),(.03,2.85,1.51),glass)
    box('structure.window-mullion',(s*11.51,y+2.1,z),(.035,.07,1.5),light,.004)
  for y in [-17,-8,2,12]:box('structure.roof-seam',(s*6,y,11.887),(12.2,.045,.05),steel,.008).rotation_euler.y=s*math.atan2(2.9,12)
 for x in [-5.6,5.6]:
  box('front.garage-reveal',(x,19.43,3.38),(7.4,.25,6.75),concrete)
  box('front.garage-door',(x,19.58,3.36),(6.9,.045,6.33),steel)
  for j in range(10):box('front.garage-slat',(x,19.61,.56+j*.59),(6.9,.02,.038),light,.005)
 box('front.entry-door',(0,19.44,1.58),(1.33,.06,2.76),dark)
 box('front.entry-canopy',(0,20.0,3.2),(2.3,1.3,.17),steel)
 for y in [-11,10]:box('structure.roof-vent',(0,y,13.37),(2.8,3.3,1.03),steel)


def generic_sam():
 truck(base=True,l=8.8,w=2.75)
 box('launcher.deck',(0,-1.3,1.5),(2.7,5.1,.3),olive)
 cyl('launcher.turntable',(0,-1,1.62),(0,-1,1.97),1.02,steel)
 for x in [-.64,.64]:
  a=Vector((x,-3.2,2.0));b=Vector((x,.5,4.24));cyl('launcher.closed-canister',a,b,.36,olive,N=24)
  d=(b-a).normalized()
  for t in [.05,.35,.75,.97]:cyl('launcher.canister-band',a+(b-a)*t-d*.045,a+(b-a)*t+d*.045,.385,steel,N=24)
 box('launcher.support',(0,-1.45,2.05),(1.4,1.1,.55),olive)
 for y,z in [(-2.5,2.16),(-.8,3.19)]:
  box('launcher.cradle',(0,y,(z+1.61)/2),(1.78,.25,z-1.61+.18),olive)


def aaa():
 tracks(5.85,3);hull('hull.main',2.95,5.8,.95,1.62,2.7,5.2)
 hull('turret.shell',2.4,2.7,1.6,2.76,1.7,1.95,y=-.25)
 for x in [-.64,-.23,.23,.64]:
  a=(x,.68,2.20);b=(x,3.55,3.02);cyl('turret.exterior-barrel',a,b,.055,steel,N=12);cyl('turret.barrel-jacket',a,(x,1.8,2.51),.09,olive,N=16)
 cyl('details.rear-sensor-stalk',(0,-1.5,1.60),(0,-1.5,3.25),.10,steel)
 cyl('details.round-sensor',(0,-1.55,3.2),(0,-1.7,3.2),.65,olive,N=32)
 hatch(-.65,0,2.76,.26);lights(2.7,1.26,2.85);grill(0,-2.02,1.64,1.4,.8)


def sa10():
 # Generic 8x8 chassis family; split front cabins and raised four-canister array.
 wheels(11.8,3.1,ys=[4.33,2.85,-2.6,-4.05],r=.70)
 box('chassis.long-deck',(0,-.2,1.3),(3.0,11.5,.45),olive)
 for s in [-1,1]:
  box('front.split-cab',(s*.83,4.28,2.03),(1.32,2.32,1.8),olive,.11)
  box('front.windshield',(s*.83,5.46,2.43),(1.01,.035,.60),glass,.016)
  box('front.side-window',(s*1.51,4.75,2.39),(.03,.86,.57),glass)
  box('front.step',(s*1.35,3.7,1.14),(.55,.65,.10),steel)
 box('front.center-power-cover',(0,3.6,1.85),(.36,3.4,.65),olive)
 box('chassis.equipment-cabin',(0,.8,2.25),(2.88,2.50,1.63),olive,.05)
 for s in [-1,1]:
  box('chassis.cabin-panel',(s*1.45,.8,2.2),(.04,1.9,1.12),light)
  for j in range(8):box('chassis.side-vent',(s*1.478,.5+j*.10,2.23),(.02,.04,.64),dark,.002)
 box('launcher.erector',(0,-3.1,2.3),(1.8,2.5,1.6),olive)
 for x in [-.57,.57]:
  for y in [-2.7,-3.83]:
   a=Vector((x,y,2));b=Vector((x,y-.55,9.2));cyl('launcher.transport-canister',a,b,.51,olive,N=32)
   d=(b-a).normalized()
   for t in [.02,.18,.49,.80,.98]:cyl('launcher.canister-band',a+(b-a)*t-d*.045,a+(b-a)*t+d*.045,.535,light,N=32)
   cyl('launcher.canister-lid',b,b+d*.09,.49,steel,N=32)
 for s in [-1,1]:
  for y in [1.8,-4.65]:
   box('chassis.outrigger-beam',(s*1.74,y,1.23),(1.08,.25,.22),steel);cyl('chassis.support-leg',(s*2.17,y,.17),(s*2.17,y,1.27),.10,steel);box('chassis.support-foot',(s*2.17,y,.075),(.63,.53,.20),olive)
 lights(5.5,1.63,3.05)


def sa11():
 tracks(7.7,3.30);hull('hull.main',3.25,7.6,.95,1.88,3.02,6.9)
 lights(3.61,1.45,3.05);grill(0,-2.65,1.89,1.9,1.0)
 cyl('turret.turntable',(0,-.05,1.84),(0,-.05,2.17),1.18,steel)
 box('turret.pedestal',(0,-.2,2.48),(2.32,2.2,.7),olive)
 for x in [-.77,.77]:box('launcher.support-bracket',(x,-.45,2.94),(.22,1.45,.79),olive)
 # Angled exterior store shapes, no internals or functional dimensions.
 for x in [-1.09,-.39,.39,1.09]:
  a=Vector((x,-2.97,2.53));b=Vector((x,1.75,3.89));d=(b-a).normalized();cyl('launcher.store-body',a,b,.17,light,N=24);cyl('launcher.store-nose',b,b+d*.72,.17,light,r2=.005,N=24)
  p=Vector((x,-3.15,2.21));q=Vector((x,1.40,3.52));cyl('launcher.rail',p,q,.085,steel,N=12)
  # Four clipped planar tail surfaces maintain recognition, purely visual.
  for t in [.12,.48]:
   c=a+(b-a)*t;u=Vector((1,0,0));v=d.cross(u)
   for ang in [0,pi/2,pi,3*pi/2]:
    n=u*cos(ang)+v*sin(ang);vs=[c-d*.35+n*.15,c+d*.29+n*.15,c-d*.17+n*.44,c-d*.42+n*.44];off=d.cross(n).normalized()*.012;vv=[tuple(p+off) for p in vs]+[tuple(p-off) for p in vs];mesh('launcher.store-fins',vv,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],light)
 # Bulbous forward radome characteristic, visual surface only.
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=(0,2.0,2.52));o=bpy.context.object;o.name='front.curved-radome';o.scale=(1.12,.52,.97);o.data.materials.append(radome);parts.append(o)
 for p in o.data.polygons:p.use_smooth=True
 box('front.radome-base',(0,1.6,2.0),(1.92,.83,.51),olive);hatch(-.9,2.73,1.90,.24);antenna(1.02,-2.5,1.89,.8)


def sa15():
 tracks(7.35,3.35,nw=7);hull('hull.main',3.30,7.2,.97,1.81,3.1,6.65)
 lights(3.46,1.42,3.20);hatch(-.82,2.75,1.84,.29);hatch(.77,2.75,1.84,.26)
 cyl('turret.turntable',(0,-.48,1.79),(0,-.48,2.04),1.30,steel)
 hull('turret.equipment',2.76,3.05,2.0,3.52,2.45,2.90,y=-.65)
 box('front.tracking-panel',(0,.912,2.94),(1.90,.17,1.32),radome,.13)
 for s in [-1,1]:box('turret.side-equipment',(s*1.38,-.32,2.76),(.40,1.89,1.10),olive,.07)
 cyl('turret.antenna-stalk',(0,-1.27,3.40),(0,-1.27,4.10),.12,steel)
 outline=[(-1.1,-.55),(1.1,-.55),(1.53,-.26),(1.57,.10),(1.20,.54),(-1.20,.54),(-1.57,.10),(-1.53,-.26)]
 vs=[(x,y,4.2+z) for y in [-1.45,-1.13] for x,z in outline];fs=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)];mesh('turret.search-panel',vs,fs,radome)
 for x in [-1.0,0,1.0]:box('turret.antenna-rib',(x,-1.45,4.20),(.035,.025,.92),steel,.003)
 for x in [-.63,.63]:
  for y in [-.5,.35]:box('turret.roof-cover',(x,y,3.54),(.97,.71,.06),light)
 grill(0,-2.8,1.825,1.82,.63)

BUILD={'tank':tank,'apc':apc,'truck':truck,'bunker':bunker,'building':building,'sam-site':generic_sam,'aaa':aaa,'sa10':sa10,'sa11':sa11,'sa15':sa15}

def main(aid,args):
 global parts,olive,light,steel,dark,rubber,glass,lamp,red,canvas,concrete,wall,roof,radome
 dest=os.path.join(args.out,aid);os.makedirs(dest,exist_ok=True);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)
 parts=[];olive=mat('olive painted metal',(.20,.255,.13),.18);light=mat('edge and panel paint',(.26,.30,.18),.16);steel=mat('dark exterior metal',(.12,.15,.13),.55,.5);dark=mat('recess shadow',(.018,.025,.024));rubber=mat('rubber and track pads',(.027,.031,.028));glass=mat('smoked glazing',(.045,.115,.14),.42,.16);lamp=mat('headlamp lens',(.7,.72,.57),.15,.22);red=mat('rear marker',(.34,.04,.025),.15,.3);canvas=mat('canvas cover',(.30,.31,.21),0,.9);concrete=mat('concrete',(.38,.40,.36),0,.92);wall=mat('industrial wall',(.44,.45,.40),.05,.8);roof=mat('roof sheet',(.20,.24,.24),.35,.68);radome=mat('exterior radome',(.30,.34,.24),0,.73)
 BUILD[aid]();bpy.context.view_layer.update()
 # Apply modifiers/mesh transforms and merge compatible repeated details by semantic prefix + material.
 for ob in parts:
  bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 groups={}
 for ob in parts:groups.setdefault((ob.name.split('.')[0],ob.data.materials[0].name),[]).append(ob)
 merged=[]
 for (prefix,material),obs in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for ob in obs:ob.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=bpy.context.object;o.name=prefix+'.'+material;merged.append(o)
 parts=merged;points=[v.co for ob in parts for v in ob.data.vertices];mn=[min(p[i] for p in points) for i in range(3)];mx=[max(p[i] for p in points) for i in range(3)]
 # Normalize envelope longitudinal length to the declared approximate game display size.
 scale=LENGTHS[aid]/(mx[1]-mn[1]);offset=Vector(((mx[0]+mn[0])/2,(mx[1]+mn[1])/2,mn[2]))
 for ob in parts:
  for v in ob.data.vertices:v.co=(v.co-offset)*scale
 coll=bpy.data.collections.new(aid+' exterior');bpy.context.scene.collection.children.link(coll);root=bpy.data.objects.new(aid+'.root',None);coll.objects.link(root)
 root['scope']='Original exterior visual game asset; artist approximate; not engineering';root['axes']='native +Y front / +Z up; glTF -Z front / +Y up'
 for ob in parts:
  for c in list(ob.users_collection):c.objects.unlink(ob)
  coll.objects.link(ob);ob.parent=root
 bpy.ops.object.select_all(action='DESELECT')
 for ob in parts:ob.select_set(True)
 root.select_set(True);bpy.context.view_layer.objects.active=parts[0];bpy.ops.export_scene.gltf(filepath=dest+'/model.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
 points=[v.co for ob in parts for v in ob.data.vertices];dims=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)];H=dims[2];L=dims[1];W=dims[0]
 manifest=dict(id=aid,name=NAMES[aid],category='ground',status='review',configuration='Stationary exterior review; no animation or damage states',provenance='Original scripted geometry and procedural PBR values, no imported mesh/image/texture assets.',variant_caveats=[CAVEATS.get(aid,'Explicitly generic fictional game target; not a named real vehicle or structure.'),'Exterior proportions and details are artist approximations; no internals or weapon/radar engineering.','No wheels/tracks/turret animation, LODs, destruction state or production integration.'],refs=[dict(url=u,role='First-party exterior photograph or operator family identification, no images redistributed; exact variant dimensions and details not certified.') for u in REFS.get(aid,[])],axes=dict(blend='metres, front +Y, up +Z, ground Z=0',glb='metres, front -Z, up +Y, ground Y=0'),measured_dimensions_metres=dict(width=round(W,4),length=round(L,4),height=round(H,4)),intended_length_m=LENGTHS[aid],dimension_source='Artist approximate display envelope. Generic lengths follow src/render/attack/groundUnits.ts MODEL_SIZE, named SAM sizes are visual estimates.',stats=dict(triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in parts),mesh_instances=len(parts),glb_bytes=os.path.getsize(dest+'/model.glb')),generator='../generate_ground.py',blender_version=bpy.app.version_string,review=['Front, top, side rendered; inspection pending'])
 open(dest+'/manifest.json','w').write(json.dumps(manifest,indent=2))
 sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.28,.31,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 fm=mat('STUDIO floor',(.065,.080,.089),0,.88);bpy.ops.mesh.primitive_plane_add(size=L*60,location=(0,0,-.025));bpy.context.object.name='STUDIO.floor';bpy.context.object.data.materials.append(fm)
 def area(n,pos,power,size,color):
  bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name='STUDIO.'+n;o.data.energy=power;o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,H*.35))-o.location).to_track_quat('-Z','Y').to_euler()
 area('key',(L*.6,L*.9,L*1.1),L*L*36,L*.85,(1,.92,.82));area('fill',(-L*.8,L*.4,L*.65),L*L*21,L*.8,(.79,.89,1));area('rim',(0,-L,L*.9),L*L*40,L*.6,(.9,.96,1))
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='STUDIO.camera';sc.camera=cam;cam.data.type='ORTHO';sc.render.engine='CYCLES';sc.cycles.samples=16;sc.cycles.use_denoising=True;sc.render.threads_mode='FIXED';sc.render.threads=2;sc.render.resolution_x=1000;sc.render.resolution_y=750;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
 target=Vector((0,0,H*.47))
 def framing(pos):
  cam.location=pos;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
  inv=cam.matrix_world.inverted();vv=[inv@p for p in points];low=[min(p[i] for p in vv) for i in range(2)];high=[max(p[i] for p in vv) for i in range(2)];shift=Vector(((low[0]+high[0])/2,(low[1]+high[1])/2,0));cam.location+=cam.rotation_euler.to_matrix()@shift
  cam.data.ortho_scale=max((high[0]-low[0])*1.16,(high[1]-low[1])*1.16*sc.render.resolution_x/sc.render.resolution_y)
 def view(name,pos,scale):
  framing(pos);sc.render.filepath=dest+'/'+name+'.png';bpy.ops.render.render(write_still=True)
 front=(L*.85,L*1.1,H*.5+L*.7);scal=max(L*1.24,H*1.85,W*1.45)
 view('front',front,scal);view('top',(0,.0001,H+L*2),max(L*1.53,W*1.22));view('side',(L*2,0,H*.47),max(L*1.2,H*1.63))
 framing(front)
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
 for screen in bpy.data.screens:
  for a in screen.areas:
   if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=dest+'/model.blend');print('COMPLETE',aid,json.dumps(manifest['stats']),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',default=os.path.dirname(os.path.abspath(__file__)));parser.add_argument('--only',nargs='+',choices=list(NAMES));args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);args.out=os.path.abspath(args.out)
 for aid in args.only or NAMES:main(aid,args)
