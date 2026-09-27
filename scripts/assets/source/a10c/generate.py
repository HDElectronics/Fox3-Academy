"""Original A-10C II and CAS exterior art; visual approximations, no weapon internals.

Standard-library GLB authoring path (also importable into Blender). No external meshes/textures.
python3 scripts/assets/source/a10c/generate.py --out .shots/a10c-model-review
Optional Blender source conversion is documented in docs/assets/a10c.md.
Axes throughout: metres, right +X, up +Y, nose -Z. Geometry is deterministic.
"""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

MATERIALS = [
    ('Airframe grey', (.39, .43, .46), .18, .55),
    ('Canopy glass', (.035, .095, .125), .48, .2),
    ('Recess rubber dark', (.022, .028, .032), .12, .62),
    ('Dull metal', (.28, .32, .34), .58, .37),
    ('Store olive', (.24, .28, .17), .12, .58),
    ('Store band ochre', (.56, .43, .12), .1, .5),
]
REFS = [
    {'url': 'https://www.digitalcombatsimulator.com/en/products/planes/tank_killer/', 'use': 'DCS variant identity; page image access returned 403 during this task'},
    {'url': 'https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104490/a-10c-thunderbolt-ii/', 'use': 'A-10C family reference; page access returned 403, not used for measured geometry'},
    {'url': 'https://www.usafe.af.mil/News/Article-Display/Article/748059/incirlik-ab-receives-a-10-forces-in-support-of-oir', 'use': 'USAF A-10C exterior reference lead; exact fittings artist approximations'},
]
NAMES = {'a10c': 'A-10C II Tank Killer', 'gbu12': 'GBU-12 Paveway II', 'agm65': 'AGM-65 Maverick family (D/H/L shared exterior)', 'apkws': 'LAU-131 seven-tube APKWS carriage pod', 'mk82': 'Mk 82 low-drag bomb', 'cbu97': 'CBU-97 closed canister', 'tgp': 'Litening targeting pod'}


def add(a, b): return tuple(x+y for x, y in zip(a, b))
def sub(a, b): return tuple(x-y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def unit(a):
    n = math.sqrt(sum(x*x for x in a)) or 1
    return tuple(x/n for x in a)


class Art:
    def __init__(self, key):
        self.key, self.meshes, self.pivots, self.labels = key, {}, {}, []

    def pivot(self, name, xyz): self.pivots[name] = xyz

    def mesh(self, name, verts, faces, material=0, parent=None, smooth=False):
        """Batch by material and moving group; preserve component labels in extras."""
        self.labels.append(name)
        normals = [(0., 0., 0.) for _ in verts]
        tris = []
        for face in faces:
            for j in range(1, len(face)-1):
                t = (face[0], face[j], face[j+1])
                n = cross(sub(verts[t[1]], verts[t[0]]), sub(verts[t[2]], verts[t[0]]))
                if sum(x*x for x in n) < 1e-15: continue
                tris.append((t, unit(n)))
                for i in t: normals[i] = add(normals[i], n)
        ns = list(map(unit, normals))
        batch = self.meshes.setdefault((parent, material), {'positions': [], 'normals': [], 'components': []})
        batch['components'].append(name)
        origin = self.pivots.get(parent, (0, 0, 0))
        for tri, normal in tris:
            for i in tri:
                batch['positions'].extend(sub(verts[i], origin))
                batch['normals'].extend(ns[i] if smooth else normal)

    def loft(self, name, rows, material=0, x=0, parent=None, segments=40, caps=True):
        # Rows: z, half-width, half-height, centre-y. Increasing z = nose to tail.
        v = [(x+w*math.cos(a), y+h*math.sin(a), z) for z, w, h, y in rows for a in (2*math.pi*j/segments for j in range(segments))]
        f = []
        for k in range(len(rows)-1):
            for j in range(segments):
                a=k*segments+j; b=k*segments+(j+1)%segments
                f.append((a,b,b+segments,a+segments))
        if caps: f += [tuple(range(segments-1, -1, -1)), tuple((len(rows)-1)*segments+j for j in range(segments))]
        self.mesh(name, v, f, material, parent, True)

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
        n=40;v=[(x+rr*math.cos(t),y+rr*math.sin(t),zz) for zz,rr in [(z,r),(z,inner),(z+depth,inner),(z+depth,r)] for t in (2*math.pi*j/n for j in range(n))]
        f=[]
        for k in range(4):
            for j in range(n):
                a=k*n+j;b=k*n+(j+1)%n;c=((k+1)%4)*n+(j+1)%n;d=((k+1)%4)*n+j
                f.append((d,c,b,a))
        self.mesh(name,v,f,material,None,True)

    def export(self,path):
        doc={'asset':{'version':'2.0','generator':'Fox3 original exterior art (Python)','copyright':'MIT; original geometry, no third-party assets'},'scene':0,'scenes':[{'nodes':[]}], 'nodes':[],'meshes':[],'materials':[], 'buffers':[], 'bufferViews':[],'accessors':[]}
        binary=bytearray()
        for name,rgb,metal,rough in MATERIALS:
            doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*rgb,1],'metallicFactor':metal,'roughnessFactor':rough}})
        roots={}
        for name,xyz in self.pivots.items():
            roots[name]=len(doc['nodes']);doc['scenes'][0]['nodes'].append(len(doc['nodes']));doc['nodes'].append({'name':name,'translation':xyz,'children':[]})
        def accessor(values,position=False):
            data=struct.pack('<'+'f'*len(values),*values); offset=len(binary);binary.extend(data)
            view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':34962})
            a={'bufferView':view,'componentType':5126,'count':len(values)//3,'type':'VEC3'}
            if position:
                a['min']=[min(values[i::3]) for i in range(3)];a['max']=[max(values[i::3]) for i in range(3)]
            doc['accessors'].append(a);return len(doc['accessors'])-1
        for (parent,mat),batch in self.meshes.items():
            primitive={'attributes':{'POSITION':accessor(batch['positions'],True),'NORMAL':accessor(batch['normals'])},'material':mat,'mode':4}
            name=(parent or 'static')+'.'+MATERIALS[mat][0]
            node={'name':name,'mesh':len(doc['meshes']),'extras':{'components':batch['components']}}
            doc['meshes'].append({'name':name,'primitives':[primitive]})
            (doc['nodes'][roots[parent]]['children'] if parent else doc['scenes'][0]['nodes']).append(len(doc['nodes']));doc['nodes'].append(node)
        doc['buffers']=[{'byteLength':len(binary)}]
        doc['scenes'][0]['extras']={'partNames':self.labels,'axes':'metres: right +X, up +Y, forward -Z'}
        raw=json.dumps(doc,separators=(',',':')).encode(); raw+=b' '*((-len(raw))%4)
        binary+=b'\0'*((-len(binary))%4)
        data=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
        path.write_bytes(data)
        return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':sum(len(m['positions'])//9 for m in self.meshes.values()),'meshes':len(self.meshes)}


def aircraft():
    a=Art('a10c')
    a.loft('Fuselage', [(-7.96,.11,.19,-.20),(-7.72,.48,.52,-.11),(-7.1,.68,.70,0),(-6,.79,.80,.02),(-4.5,.85,.88,.05),(-2.7,.83,.86,.06),(-1,.76,.79,.02),(1.5,.66,.70,.04),(3.6,.53,.52,.12),(5.5,.40,.38,.21),(6.9,.25,.24,.26),(7.8,.07,.09,.3)],segments=56)
    a.loft('Bubble canopy', [(-6.55,.10,.06,.57),(-6.20,.37,.31,.70),(-5.6,.51,.72,.76),(-4.7,.52,.76,.80),(-3.85,.43,.52,.87),(-3.3,.10,.04,.94)],1,segments=48)
    # Raised sill and rear fairing; a closed shaded canopy, no cockpit interior.
    a.loft('Canopy rear fairing',[(-3.7,.40,.20,.92),(-3.0,.34,.17,.88),(-2.0,.17,.06,.80)],0)
    for s in [-1,1]:
        # Inner/outer wing panels stop at separate flap/deceleron hinge lines.
        def wing(name,points): a.plate(name,[(s*x,y,z) for x,y,z in points],thickness=.18)
        wing('Wing root '+str(s),[(.65,-.32,-1.75),(1.05,-.32,-1.73),(1.05,-.32,2.0),(.65,-.32,2.05)])
        wing('Straight wing '+str(s),[(1.05,-.32,-1.73),(5.65,-.23,-1.1),(5.65,-.23,1.0),(1.05,-.32,1.1)])
        wing('Outer wing '+str(s),[(5.65,-.23,-1.1),(8.35,-.22,-.75),(8.35,-.22,.88),(5.65,-.23,.88)])
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
        a.ring('Intake lip '+str(s),s*1.65,1.25,1.27,.71,.60,0,.11)
        a.cylinder('Intake recess '+str(s),(s*1.65,1.25,1.36),(s*1.65,1.25,1.42),.60,2,segments=48)
        a.loft('Intake centre cap '+str(s),[(1.30,.04,.04,1.25),(1.40,.13,.13,1.25)],3,x=s*1.65)
        a.ring('Exhaust rim '+str(s),s*1.65,1.25,5.13,.56,.47,3,.08)
        a.cylinder('Exhaust recess '+str(s),(s*1.65,1.25,5.12),(s*1.65,1.25,5.14),.47,2)
        wing('Horizontal stabiliser '+str(s),[(.12,.24,5.70),(3.14,.25,6.17),(3.14,.25,7.89),(.12,.24,7.89)])
        a.fin('Twin vertical tail '+str(s),[(-.59,6.52),(.23,6.15),(1.86,6.25),(2.08,6.42),(2.08,7.71),(1.87,7.96),(-.38,8.13)],s*3.10,.17)
        # 4 stations under each wing plus 3 on the fuselage = 11.
        for j,x in enumerate([2.90,4.25,5.68,7.15]):
            y=-.35+(x/8)*.10;z=-.12+(x/8)*.15
            a.fin('Pylon '+str((4-j) if s<0 else (8+j)),[(y,z-.70),(y-.37,z-.49),(y-.44,z+.55),(y,z+.86)],s*x,.11)
    for i,x in enumerate([-.64,0,.64]):
        a.fin('Pylon '+str(5+i),[(-.63,-.95),(-1.02,-.56),(-1.04,.62),(-.61,.9)],x,.10)
    # GAU-8 muzzle shroud and visible muzzle-face dots only (no barrel interiors).
    a.loft('GAU-8 muzzle shroud',[(-8.125,.155,.155,-.40),(-7.55,.21,.21,-.40)],3,x=-.12)
    a.cylinder('Muzzle face',(-.12,-.4,-8.128),(-.12,-.4,-8.126),.128,2)
    for j in range(7):
        t=j*2*math.pi/7;x=-.12+.082*math.cos(t);y=-.4+.082*math.sin(t)
        a.cylinder('Muzzle marking '+str(j),(x,y,-8.130),(x,y,-8.129),.025,3,segments=8)
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
        for (parent,_),batch in a.meshes.items():
            if parent!=name: continue
            for attr in ['positions','normals']:
                vals=batch[attr]
                for j in range(0,len(vals),3): vals[j+1],vals[j+2]=-vals[j+2],vals[j+1]
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
        a.loft('Yellow identification band',[(-.70,.140,.140,0),(-.65,.142,.142,0)],5)
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


def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--only',nargs='*');p.add_argument('--production',type=Path);args=p.parse_args()
    selected=args.only or list(NAMES)
    if not set(selected)<=NAMES.keys(): p.error('Unknown asset ID')
    records=[]
    for key in selected:
        out=args.out/key;out.mkdir(parents=True,exist_ok=True)
        model=aircraft() if key=='a10c' else store(key)
        stats=model.export(out/'model.glb')
        caveats=['Original exterior artist approximation; dimensions and fittings are visual display proportions, not engineering data.','No copied game geometry, texture imagery, internals, or authentic livery.','Direct Python GLB authoring; Blender CLI crashed during Metal initialization in the restricted session.','Independent exact-variant fidelity and physical-device performance remain unverified.']
        if key=='a10c': caveats+=['Nominal app envelope: 16.26 m length, 17.53 m span. Closed shaded canopy, eleven empty pylons.','Named pivots drive three gear legs, two flaps and four split-deceleron leaves; no skeletal rig, gear-door sequence, cockpit or pilot.']
        elif key=='agm65': caveats+=['D/H/L deliberately share this exterior; optical-window differences are not represented.']
        elif key=='apkws': caveats+=['Seven-tube LAU-131 carriage pod only; NOT a flying APKWS rocket. Runtime projectile retains procedural geometry.']
        else: caveats+=['Static store exterior, no animation. GBU-12 tail fins shown extended; exact subvariant detail not verified.']
        meta={'id':key,'name':NAMES[key],'category':'aircraft' if key=='a10c' else 'store','references':REFS,'source_caveats':caveats,'authorship':'Original Fox3 scripted exterior art; no third-party meshes or textures. Distributed under the repository MIT license.',**stats}
        meta['source_sha256']=meta['sha256']
        (out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
        records.append(meta)
        if args.production:
            args.production.mkdir(parents=True,exist_ok=True);(args.production/(key+'.glb')).write_bytes((out/'model.glb').read_bytes())
        print(key,stats,flush=True)
    if args.production:
        mf=args.production/'manifest.json';old=json.loads(mf.read_text()) if mf.exists() else []
        mf.write_text(json.dumps([r for r in old if r['id'] not in selected]+records,indent=2)+'\n')

if __name__=='__main__': main()
