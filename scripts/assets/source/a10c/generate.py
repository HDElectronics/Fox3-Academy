"""Original A-10C II and CAS exterior meshes, authored and rendered inside Blender.
blender --background --threads 2 --python generate.py -- --out REVIEW [--only a10c]
Recipe coordinates: metres, nose -Z, up +Y, right +X. The mesh builder converts to
Blender +Y forward/+Z up, so Blender's standard glTF export returns the runtime axes.
No imported meshes, textures, weapon internals or engineering models.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector

MATERIALS = [
    ('Airframe grey', (.39, .43, .46), .18, .55),
    ('Canopy glass', (.035, .095, .125), .48, .2),
    ('Recess rubber dark', (.022, .028, .032), .12, .62),
    ('Dull metal', (.28, .32, .34), .58, .37),
    ('Store olive', (.24, .28, .17), .12, .58),
    ('Store band ochre', (.56, .43, .12), .1, .5),
]
REFS = [
    {'url': 'https://commons.wikimedia.org/wiki/File:Fairchild_Republic_A-10_Thunderbolt_II_3-view.svg', 'use': 'Three-view exterior silhouette inspected 2026-09-28; family reference, not exact C II fitting certification; no image included in assets'},
    {'url': 'https://www.digitalcombatsimulator.com/en/products/planes/tank_killer/', 'use': 'DCS variant identity and store family context'},
]
NAMES = {'a10c': 'A-10C II Tank Killer', 'gbu12': 'GBU-12 Paveway II', 'agm65': 'AGM-65 Maverick family (D/H/L shared exterior)', 'apkws': 'LAU-131 seven-tube APKWS carriage pod', 'mk82': 'Mk 82 low-drag bomb', 'cbu97': 'CBU-97 closed canister', 'tgp': 'Litening targeting pod'}


def add(a, b): return tuple(x+y for x, y in zip(a, b))
def sub(a, b): return tuple(x-y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def unit(a):
    n = math.sqrt(sum(x*x for x in a)) or 1
    return tuple(x/n for x in a)


def native(p): return (p[0], -p[2], p[1])


def material(name, rgb, metal, rough):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*rgb,1);mat.use_nodes=True
    bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value=(*rgb,1)
    bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=rough
    return mat


class Art:
    def __init__(self,key):
        self.key=key;self.objects=[];self.pivots={};self.labels=[]
        self.collection=bpy.data.collections.new(key+' exterior');bpy.context.scene.collection.children.link(self.collection)
        self.materials=[material(*m) for m in MATERIALS]

    def pivot(self,name,xyz):
        node=bpy.data.objects.new(name,None);self.collection.objects.link(node);node.location=native(xyz)
        node.empty_display_size=.25;self.pivots[name]=node

    def mesh(self,name,verts,faces,material=0,parent=None,smooth=False):
        self.labels.append(name)
        origin=self.pivots[parent].location if parent else Vector((0,0,0))
        me=bpy.data.meshes.new(name);me.from_pydata([Vector(native(v))-origin for v in verts],[],faces);me.update()
        bm=bmesh.new();bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.000001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.update()
        ob=bpy.data.objects.new(name,me);self.collection.objects.link(ob);ob.data.materials.append(self.materials[material]);ob['fox3_group']=parent or 'static'
        if parent:ob.parent=self.pivots[parent]
        self.objects.append(ob)
        for face in me.polygons:face.use_smooth=smooth and len(face.vertices)==4
        if not smooth:
            mod=ob.modifiers.new('Rounded exterior edges','BEVEL');mod.width=.012 if self.key=='a10c' else .004;mod.segments=2
            mod.limit_method='ANGLE'
            self.apply(ob,mod)
        return ob

    def apply(self,ob,mod):
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)

    def seam(self,name,points,radius=.014,material=3,parent=None):
        curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2
        poly=curve.splines.new('POLY');poly.points.add(len(points)-1)
        origin=self.pivots[parent].location if parent else Vector((0,0,0))
        for p,xyz in zip(poly.points,points):p.co=(*(Vector(native(xyz))-origin),1)
        ob=bpy.data.objects.new(name,curve);self.collection.objects.link(ob);curve.materials.append(self.materials[material]);ob['fox3_group']=parent or 'static'
        if parent:ob.parent=self.pivots[parent]
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.convert(target='MESH');ob.select_set(False);self.objects.append(ob);self.labels.append(name)

    def wing(self,name,sections,side=1):
        # Artist airfoil-like sections: rounded leading edge and tapered trailing edge, no aero data.
        chord_profile=[(0,0),(.04,.57),(.16,1),(.48,.77),(1,.06),(1,-.06),(.48,-.60),(.16,-.75),(.04,-.48)]
        verts=[]
        for x,leading,trailing,y,half_t in sections:
            for t,h in chord_profile:verts.append((side*x,y+half_t*h,leading+t*(trailing-leading)))
        n=len(chord_profile);faces=[]
        for k in range(len(sections)-1):
            for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
        faces.extend([tuple(range(n-1,-1,-1)),tuple((len(sections)-1)*n+j for j in range(n))])
        return self.mesh(name,verts,faces,smooth=True)

    def retract_gear(self,name):
        rotation=Matrix.Rotation(math.pi/2,4,'X')
        for ob in self.objects:
            if ob.parent==self.pivots[name]:ob.data.transform(rotation)

    def export(self,path):
        bpy.context.scene['partNames']=self.labels
        bpy.context.scene['axes']='metres: nose -Z, up +Y, right +X after glTF export'
        bpy.ops.object.select_all(action='DESELECT')
        for ob in [*self.objects,*self.pivots.values()]:ob.select_set(True)
        bpy.context.view_layer.objects.active=self.objects[0]
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
            export_texcoords=False,export_normals=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
        return {'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

    def loft(self, name, rows, material=0, x=0, parent=None, segments=40, caps=True):
        # Rows: z, half-width, half-height, centre-y. Increasing z = nose to tail.
        v = [(x+w*math.cos(a), y+h*math.sin(a), z) for z, w, h, y in rows for a in (2*math.pi*j/segments for j in range(segments))]
        f = []
        for k in range(len(rows)-1):
            for j in range(segments):
                a=k*segments+j; b=k*segments+(j+1)%segments
                f.append((a,b,b+segments,a+segments))
        if caps: f += [tuple(range(segments-1, -1, -1)), tuple((len(rows)-1)*segments+j for j in range(segments))]
        ob=self.mesh(name, v, f, material, parent, True)
        if name in ['Fuselage','Bubble canopy','Canopy rear fairing','Bomb body','Paveway body','Closed canister'] or name.startswith('Main gear pod'):
            mod=ob.modifiers.new('Curved exterior subdivision','SUBSURF');mod.levels=1;mod.render_levels=1
            self.apply(ob,mod)
            for polygon in ob.data.polygons:polygon.use_smooth=True

    def plate(self, name, outline, material=0, thickness=.08, parent=None):
        # Arbitrary horizontal outline xyz, clockwise viewed from above gives upward normal.
        v = [(x,y+d,z) for d in (-thickness/2,thickness/2) for x,y,z in outline]
        n=len(outline)
        f=[tuple(range(n-1,-1,-1)), tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        # Correct winding using signed projected area (outline expected clockwise in x/z).
        area=sum(outline[j][0]*outline[(j+1)%n][2]-outline[(j+1)%n][0]*outline[j][2] for j in range(n))
        if area>0: f=[tuple(reversed(face)) for face in f]
        self.mesh(name,v,f,material,parent)

    def box(self, name, center, size, material=0, parent=None):
        x,y,z=center;w,h,l=size
        self.plate(name,[(x-w/2,y,z-l/2),(x-w/2,y,z+l/2),(x+w/2,y,z+l/2),(x+w/2,y,z-l/2)],material,h,parent)

    def fin(self, name, yz, x, thickness=.12, material=0):
        v=[(x+d,y,z) for d in (-thickness/2,thickness/2) for y,z in yz]; n=len(yz)
        f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        # Winding is corrected against the prism centroid for each face.
        c=tuple(sum(p[i] for p in v)/len(v) for i in range(3)); fs=[]
        for face in f:
            normal=cross(sub(v[face[1]],v[face[0]]), sub(v[face[2]],v[face[0]]))
            fc=tuple(sum(v[j][i] for j in face)/len(face) for i in range(3))
            fs.append(tuple(reversed(face)) if sum(a*b for a,b in zip(normal,sub(fc,c)))<0 else face)
        self.mesh(name,v,fs,material)

    def cylinder(self,name,a,b,r,material=0,parent=None,segments=24):
        axis=unit(sub(b,a)); u=unit(cross(axis,(0,1,0) if abs(axis[1])<.9 else (1,0,0))); w=cross(axis,u)
        v=[tuple(p[i]+r*(math.cos(t)*u[i]+math.sin(t)*w[i]) for i in range(3)) for p in (a,b) for t in (2*math.pi*j/segments for j in range(segments))]
        f=[(j,(j+1)%segments,(j+1)%segments+segments,j+segments) for j in range(segments)]
        f += [tuple(range(segments-1,-1,-1)),tuple(range(segments,2*segments))]
        self.mesh(name,v,f,material,parent,True)

    def ring(self,name,x,y,z,r,inner,material=3,depth=.06):
        n=48;v=[(x+rr*math.cos(t),y+rr*math.sin(t),zz) for zz,rr in [(z,r),(z,inner),(z+depth,inner),(z+depth,r)] for t in (2*math.pi*j/n for j in range(n))]
        f=[]
        for k in range(4):
            for j in range(n):
                a=k*n+j;b=k*n+(j+1)%n;c=((k+1)%4)*n+(j+1)%n;d=((k+1)%4)*n+j
                f.append((d,c,b,a))
        self.mesh(name,v,f,material,None,True)



def aircraft():
    a=Art('a10c')
    a.loft('Fuselage', [(-7.96,.11,.19,-.20),(-7.72,.48,.52,-.11),(-7.1,.68,.70,0),(-6,.79,.80,.02),(-4.5,.85,.88,.05),(-2.7,.83,.86,.06),(-1,.76,.79,.02),(1.5,.66,.70,.04),(3.6,.55,.54,.33),(5.5,.40,.38,.48),(6.9,.25,.24,.58),(7.8,.07,.09,.3)],segments=56)
    a.loft('Bubble canopy', [(-6.55,.10,.06,.57),(-6.20,.37,.31,.70),(-5.6,.51,.72,.76),(-4.7,.52,.76,.80),(-3.85,.43,.52,.87),(-3.3,.10,.04,.94)],1,segments=48)
    # Windshield bow is an exterior frame, no cockpit internals.
    canopy=next(ob for ob in a.objects if ob.name=='Bubble canopy')
    bow=[]
    for j in range(25):
        x=-.34+j*.68/24
        hit,point,normal,_=canopy.ray_cast(Vector((x,5.91,4)),Vector((0,0,-1)))
        if hit:
            point+=normal*.008
            bow.append((point.x,point.z,-point.y))
    a.seam('Windshield bow',bow,.018,0)
    # Raised sill and rear fairing; a closed shaded canopy, no cockpit interior.
    a.loft('Canopy rear fairing',[(-3.7,.40,.20,.92),(-3.0,.34,.17,.88),(-2.0,.17,.06,.80)],0)
    for s in [-1,1]:
        # Inner/outer wing panels stop at separate flap/deceleron hinge lines.
        def wing(name,points): a.plate(name,[(s*x,y,z) for x,y,z in points],thickness=.18)
        wing('Wing root '+str(s),[(.65,-.32,-1.75),(1.05,-.32,-1.73),(1.05,-.32,2.0),(.65,-.32,2.05)])
        a.wing('Straight wing '+str(s),[(1.05,-1.73,1.1,-.32,.18),(2.1,-1.58,1.075,-.30,.17),(5.65,-1.1,1.0,-.23,.10)],s)
        a.wing('Outer wing '+str(s),[(5.65,-1.1,.88,-.23,.10),(8.35,-.75,.88,-.22,.07)],s)
        wing('Drooped wingtip '+str(s),[(8.35,-.22,-.75),(8.765,-.51,-.52),(8.765,-.51,1.53),(8.35,-.22,1.67)])
        # Small transition aft of flap to split aileron.
        wing('Flap outboard separator '+str(s),[(5.60,-.23,.87),(5.72,-.23,.87),(5.72,-.23,1.76),(5.60,-.23,1.76)])
        name='flap.'+('port' if s<0 else 'starboard');a.pivot(name,(s*1.05,-.32,1.10))
        a.plate('Trailing flap '+str(s),[(s*1.05,-.32,1.10),(s*5.60,-.23,1.00),(s*5.60,-.23,1.76),(s*1.05,-.32,2.00)],parent=name,thickness=.12)
        for up in [True,False]:
            name='deceleron.'+('port' if s<0 else 'starboard')+('.upper' if up else '.lower');y=-.19 if up else -.27
            a.pivot(name,(s*5.72,y,.89))
            a.plate(name,[(s*5.72,y,.89),(s*8.33,y,.89),(s*8.33,y,1.67),(s*5.72,y,1.76)],parent=name,thickness=.06)
        # Landing-gear sponsons, correctly forward of the wing's leading edge.
        a.loft('Main gear pod '+str(s),[(-3.15,.07,.09,-.43),(-2.75,.32,.36,-.55),(-2.15,.43,.48,-.62),(-.8,.44,.44,-.61),(.65,.35,.26,-.51),(1.5,.05,.04,-.36)],x=s*2.10)
        # High aft engine mounts and circular nacelles; shallow dark intake/exhaust surfaces only.
        a.plate('Engine support '+str(s),[(s*.3,.58,1.9),(s*1.75,.92,2.18),(s*1.75,.92,4.3),(s*.3,.58,4.48)],thickness=.30)
        a.loft('TF34 nacelle '+str(s),[(1.28,.70,.70,1.25),(1.48,.80,.80,1.25),(2.2,.82,.82,1.25),(3.7,.79,.79,1.25),(4.75,.69,.69,1.25),(5.18,.56,.57,1.25)],x=s*1.65,segments=56,caps=False)
        a.ring('Nacelle join '+str(s),s*1.65,1.25,2.19,.822,.816,3,.018)
        a.ring('Intake lip '+str(s),s*1.65,1.25,1.27,.71,.60,0,.11)
        a.cylinder('Intake recess '+str(s),(s*1.65,1.25,1.36),(s*1.65,1.25,1.42),.60,2,segments=48)
        a.loft('Intake centre cap '+str(s),[(1.30,.04,.04,1.25),(1.40,.13,.13,1.25)],3,x=s*1.65)
        a.ring('Exhaust rim '+str(s),s*1.65,1.25,5.13,.56,.47,3,.08)
        a.cylinder('Exhaust recess '+str(s),(s*1.65,1.25,5.12),(s*1.65,1.25,5.14),.47,2)
        wing('Horizontal stabiliser '+str(s),[(.12,.24,5.70),(3.14,.25,6.17),(3.14,.25,7.89),(.12,.24,7.89)])
        a.fin('Twin vertical tail '+str(s),[(-.59,6.52),(.23,6.15),(1.86,6.25),(2.08,6.42),(2.08,7.71),(1.87,7.96),(-.38,8.13)],s*3.10,.17)
        a.seam('Rudder join '+str(s),[(s*3.191,-.29,7.62),(s*3.191,1.90,7.48)],.011,3)
        # 4 stations under each wing plus 3 on the fuselage = 11.
        for j,x in enumerate([2.90,4.25,5.68,7.15]):
            y=-.35+(x/8)*.10;z=-.12+(x/8)*.15
            a.fin('Pylon '+str((4-j) if s<0 else (8+j)),[(y,z-.70),(y-.37,z-.49),(y-.44,z+.55),(y,z+.86)],s*x,.11)
    for i,x in enumerate([-.64,0,.64]):
        a.fin('Pylon '+str(5+i),[(-.63,-.95),(-1.02,-.56),(-1.04,.62),(-.61,.9)],x,.10)
    # GAU-8 muzzle shroud and visible muzzle-face dots only (no barrel interiors).
    a.loft('GAU-8 muzzle shroud',[(-8.125,.155,.155,-.40),(-7.55,.21,.21,-.40)],3,x=-.12)
    a.cylinder('Muzzle face',(-.12,-.4,-8.128),(-.12,-.4,-8.126),.128,3)
    for j in range(7):
        t=j*2*math.pi/7;x=-.12+.082*math.cos(t);y=-.4+.082*math.sin(t)
        a.cylinder('Muzzle marking '+str(j),(x,y,-8.130),(x,y,-8.129),.025,2,segments=12)
    # External refuelling receptacle mark and two restrained dorsal aerials.
    a.plate('Refuelling receptacle', [(-.22,.70,-6.74),(-.20,.83,-6.2),(.20,.83,-6.2),(.22,.70,-6.74)],3,.014)
    a.fin('Dorsal aerial',[(.76,-1.55),(1.20,-1.4),(.83,-.97)],0,.05)
    a.fin('Rear aerial',[(.70,2.0),(1.02,2.23),(.67,2.42)],0,.04)
    # Leg meshes authored down, then baked into their retracted pose about each hinge.
    for name,x,y,z,r in [('gear.nose',.23,-.55,-5.8,.30),('gear.port',-2.10,-.68,-.23,.43),('gear.starboard',2.10,-.68,-.23,.43)]:
        a.pivot(name,(x,y,z));wheel_y=-1.95+r
        a.cylinder(name+' strut',(x,y,z),(x,wheel_y,z),.066,3,name)
        a.cylinder(name+' tyre',(x-.14,wheel_y,z),(x+.14,wheel_y,z),r,2,name,32)
        a.cylinder(name+' hub',(x-.145,wheel_y,z),(x+.145,wheel_y,z),r*.47,3,name,24)
        # Rotate +90 degrees around local X: down -> forward. Runtime reverses this as gear deploys.
        a.retract_gear(name)
    return a


def radial_fins(a,name,outline,material=4):
    for k in range(4):
        angle=math.pi/4+k*math.pi/2;c=math.cos(angle);s=math.sin(angle)
        v=[(r*c-d*s,r*s+d*c,z) for d in [-.012,.012] for z,r in outline];n=len(outline)
        f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        # Surface winding corrected using centroid (convex fins).
        center=tuple(sum(p[i] for p in v)/len(v) for i in range(3))
        for i,face in enumerate(f):
            normal=cross(sub(v[face[1]],v[face[0]]),sub(v[face[2]],v[face[0]]));fc=tuple(sum(v[j][i] for j in face)/len(face) for i in range(3))
            if sum(x*y for x,y in zip(normal,sub(fc,center)))<0: f[i]=tuple(reversed(face))
        a.mesh(name+' '+str(k),v,f,material)


def store(key):
    a=Art(key)
    if key=='apkws':
        a.loft('Pod shell',[(-.88,.23,.23,0),(-.80,.255,.255,0),(.80,.255,.255,0),(.88,.22,.22,0)],0)
        # Seven shallow opening discs and rims. No tubes or rocket internals.
        for i in range(7):
            t=(i-1)*math.pi/3;x=.145*math.cos(t) if i else 0;y=.145*math.sin(t) if i else 0
            a.cylinder('Tube opening '+str(i),(x,y,-.893),(x,y,-.891),.061,2)
            a.ring('Tube rim '+str(i),x,y,-.900,.068,.061,3,.016)
        a.box('Mount',(0,.264,.05),(.14,.10,.62),3)
    elif key=='tgp':
        a.loft('Litening body',[(-1.04,.18,.18,0),(-.85,.21,.21,0),(.76,.21,.21,0),(1.07,.16,.16,0)],0)
        a.loft('External sensor head',[(-1.28,.07,.07,0),(-1.22,.16,.16,0),(-1.02,.20,.20,0)],0)
        a.cylinder('Opaque sensor window',(0,0,-1.288),(0,0,-1.281),.074,1)
        a.box('Optical side window',(.178,0,-1.095),(.025,.09,.09),1)
        a.box('Upper mounting rail',(0,.23,.04),(.16,.10,.84),3)
        a.box('Cooling fairing',(.19,.02,.35),(.18,.24,.50),0)
    elif key=='agm65':
        a.loft('Maverick shell',[(-1.24,.13,.13,0),(-1.06,.155,.155,0),(.90,.155,.155,0),(1.24,.13,.13,0)],0)
        a.loft('Opaque nose window',[(-1.26,.085,.085,0),(-1.245,.13,.13,0)],1)
        radial_fins(a,'Long cruciform wing',[(-.55,.15),(.50,.36),(.91,.36),(.91,.15)],0)
        radial_fins(a,'Tail fin',[(.93,.14),(1.02,.26),(1.23,.26),(1.23,.13)],0)
        a.cylinder('Aft dark cap',(0,0,1.239),(0,0,1.244),.105,2)
    elif key=='mk82':
        a.loft('Bomb body',[(-1.10,.02,.02,0),(-1.02,.09,.09,0),(-.83,.13,.13,0),(-.55,.145,.145,0),(.46,.145,.145,0),(.76,.074,.074,0),(1.10,.046,.046,0)],4)
        radial_fins(a,'Tail fin',[(.58,.12),(.76,.25),(1.10,.25),(1.10,.045)])
        a.loft('Yellow identification band',[(-.70,.140,.140,0),(-.65,.143,.143,0)],5)
    elif key=='gbu12':
        a.loft('Paveway body',[(-1.56,.04,.04,0),(-1.46,.07,.07,0),(-1.11,.084,.084,0),(-.90,.11,.11,0),(-.60,.145,.145,0),(.63,.145,.145,0),(.88,.095,.095,0),(1.56,.08,.08,0)],4)
        a.loft('Nose window',[(-1.60,.035,.035,0),(-1.55,.045,.045,0)],1)
        radial_fins(a,'Forward control fin',[(-1.25,.075),(-1.14,.21),(-.94,.21),(-.94,.085)],0)
        radial_fins(a,'Deployed tail wing',[(.71,.14),(1.0,.60),(1.48,.60),(1.55,.08)],4)
        a.loft('Identification band',[(-.61,.147,.147,0),(-.55,.147,.147,0)],5)
    elif key=='cbu97':
        a.loft('Closed canister',[(-1.17,.055,.055,0),(-1.09,.15,.15,0),(-.91,.20,.20,0),(-.70,.205,.205,0),(.71,.205,.205,0),(.93,.14,.14,0),(1.17,.10,.10,0)],4)
        radial_fins(a,'Tail fin',[(.73,.20),(.88,.30),(1.17,.30),(1.17,.10)],4)
        a.loft('Identification band',[(-.83,.204,.204,0),(-.76,.207,.207,0)],5)
    if key not in ['apkws','tgp']:
        for z in [-.3,.25]: a.box('Mount pad '+str(z),(0,.16,z),(.07,.08,.10),3)
    return a


def aim(obj, point): obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()


def studio(model, out, render=True):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new('Neutral review world');scene.world.use_nodes=True
    background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');background.inputs['Color'].default_value=(.19,.22,.27,1);background.inputs['Strength'].default_value=.45
    bpy.context.view_layer.update()
    coords=[ob.matrix_world@Vector(v) for ob in model.objects for v in ob.bound_box]
    lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)));center=(lo+hi)/2
    length=max(hi.x-lo.x,hi.y-lo.y,hi.z-lo.z)
    bpy.ops.mesh.primitive_plane_add(size=length*200,location=(0,0,lo.z-.2));floor=bpy.context.object;floor.name='Review floor (excluded from export)';floor.data.materials.append(material('Studio charcoal',(.08,.10,.13),0,.85))
    for name,xyz,energy,size in [('Key',(1,1.3,2.0),95,1.2),('Fill',(-1.5,.4,1.0),65,1.4),('Rim',(.5,-1.2,1.7),125,1.0)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=energy*length*length;light.shape='DISK';light.size=length*size
        ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob);ob.location=center+Vector(xyz)*length;aim(ob,center)
    camera=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camera);scene.collection.objects.link(cam);scene.camera=cam
    camera.type='ORTHO';camera.clip_end=length*100;camera.ortho_scale=length*1.25
    views={'front':(0,2.5,.18),'side':(2.5,0,.08),'top':(0,0,2.5),'quarter':(1.3,1.8,1.2)}
    if model.key=='a10c':views['rear']=(1.35,-1.8,1.1)
    for name,position in views.items():
        cam.location=center+Vector(position)*length;aim(cam,center)
        if name=='top':cam.rotation_euler=(0,0,0)
        camera.ortho_scale=length*(1.25 if name!='side' else 1.38)
        # Ensure portrait-long stores and top aircraft fit vertical resolution too.
        if name=='top':camera.ortho_scale=length*1.65
        floor.hide_render=name in ['front','side']
        scene.render.filepath=str(out/(name+'.png'))
        if render:bpy.ops.render.render(write_still=True)
    if model.key=='a10c':
        originals={name:(root.rotation_mode,root.matrix_basis.copy()) for name,root in model.pivots.items()}
        for name,root in model.pivots.items():
            angle=-math.pi/2 if name.startswith('gear.') else (math.pi/6 if name.startswith('flap.') else (-math.pi/3 if name.endswith('upper') else math.pi/3))
            base=root.matrix_basis.to_quaternion()
            root.rotation_mode='QUATERNION'
            root.rotation_quaternion=base @ Quaternion((1,0,0),angle)
        cam.location=center+Vector((1.35,-1.8,1.1))*length;aim(cam,center);camera.ortho_scale=length*1.25
        floor.hide_render=True;scene.render.filepath=str(out/'deployed.png')
        if render:bpy.ops.render.render(write_still=True)
        for name,root in model.pivots.items():
            mode,basis=originals[name];root.rotation_mode=mode;root.matrix_basis=basis
    # Save a clean rig configuration with an immediately useful studio view.
    floor.hide_render=False;cam.location=center+Vector((1.3,1.8,1.2))*length;aim(cam,center);camera.ortho_scale=length*1.25


def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--only',nargs='*');p.add_argument('--no-render',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    selected=args.only or list(NAMES)
    if not set(selected)<=NAMES.keys():p.error('Unknown asset ID')
    for key in selected:
        out=args.out.resolve()/key;out.mkdir(parents=True,exist_ok=True)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
        model=aircraft() if key=='a10c' else store(key)
        bpy.context.view_layer.update()
        stats=model.export(out/'model.glb')
        caveats=['Original artist approximation for a game tutorial; no weapon internals or engineering data.','No copied meshes, source image textures, cockpit interior, authentic livery or LOD chain.','Small C II-specific fittings and store subvariants are simplified; not a claim of exact DCS mesh parity.']
        if key=='a10c':caveats+=['App envelope: 16.26 m length and 17.53 m span. Closed canopy and eleven empty pylons.','Three gear, two flap and four deceleron pivots; no gear-door sequencing or aileron-roll animation.']
        elif key=='agm65':caveats+=['D/H/L share one simplified external shell; variant-specific optical windows not represented.']
        elif key=='apkws':caveats+=['LAU-131 seven-opening carriage pod only; flying APKWS projectiles retain procedural geometry.']
        elif key=='gbu12':caveats+=['Tail fins shown extended; no deployment animation.']
        meta={'id':key,'name':NAMES[key],'category':'aircraft' if key=='a10c' else 'store','references':REFS,'caveats':caveats,'authorship':'Original Fox3 scripted exterior art; repository MIT licence.','authoring_tool':'Blender Python (bpy/bmesh); Blender glTF exporter','blender_version':bpy.app.version_string,'openvsp_used':False,'source_axes':'Blender +Y forward, +Z up, +X right','export_axes':'metres: -Z forward, +Y up, +X right','part_names':model.labels,'generator':'scripts/assets/source/a10c/generate.py',**stats}
        (out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
        studio(model,out,not args.no_render)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'model.blend'))
        print('BLENDER_AUTHORED',key,stats,flush=True)


if __name__=='__main__':main()
