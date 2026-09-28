"""Shared Blender mesh/export and Cycles studio helpers for original exterior art.
Recipes live in their aircraft-family or store generators. No imported geometry or internals.
"""
import hashlib
import json
import math
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

def write_manifest(model, out, name, category, generator, stats):
    key=model.key
    caveats=['Original artist approximation for a game tutorial; no weapon internals or engineering data.','No copied meshes, source image textures, cockpit interior, authentic livery or LOD chain.','Small C II-specific fittings and store subvariants are simplified; not a claim of exact DCS mesh parity.']
    if key=='a10c':caveats+=['App envelope: 16.26 m length and 17.53 m span. Closed canopy and eleven empty pylons.','Three gear, two flap and four deceleron pivots; no gear-door sequencing or aileron-roll animation.']
    elif key=='agm65':caveats+=['D/H/L share one simplified external shell; variant-specific optical windows not represented.']
    elif key=='apkws':caveats+=['LAU-131 seven-opening carriage pod only; flying APKWS projectiles retain procedural geometry.']
    elif key=='gbu12':caveats+=['Tail fins shown extended; no deployment animation.']
    meta={'id':key,'name':name,'category':category,'references':REFS,'caveats':caveats,'authorship':'Original Fox3 scripted exterior art; repository MIT licence.','authoring_tool':'Blender Python (bpy/bmesh); Blender glTF exporter','blender_version':bpy.app.version_string,'openvsp_used':False,'source_axes':'Blender +Y forward, +Z up, +X right','export_axes':'metres: -Z forward, +Y up, +X right','part_names':model.labels,'generator':generator,**stats}
    (out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
