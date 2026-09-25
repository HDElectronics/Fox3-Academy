"""Original, approximate missile exterior art. No functional components or engineering data.
Rebuild: blender --background --threads 2 --python generate_missiles.py -- --out review [--only r77]
"""
import bpy,bmesh,math,json,sys,argparse,os
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi
SPECS={
'r27r':('R-27R',4.08,.23,'r27','point'), 'r27er':('R-27ER',4.78,.26,'r27','point'),
'r27t':('R-27T',3.80,.23,'r27','round'), 'r27et':('R-27ET',4.49,.26,'r27','round'),
'r77':('R-77',3.60,.20,'r77','point'), 'r73':('R-73',2.93,.17,'r73','round'),
'aim120b':('AIM-120B AMRAAM',3.66,.178,'amraam','point'), 'aim120c':('AIM-120C AMRAAM',3.66,.178,'amraam','point'),
'aim7m':('AIM-7M Sparrow',3.66,.203,'sparrow','point'), 'aim9m':('AIM-9M Sidewinder',2.87,.127,'sidewinder','round'),
'aim9x':('AIM-9X Sidewinder',3.02,.127,'sidewinderx','round'), 'aim54a':('AIM-54A Phoenix',3.96,.38,'phoenix','point'),
'aim54c':('AIM-54C Phoenix',3.96,.38,'phoenix','point'), 'sd10':('SD-10',3.93,.203,'sd10','point'),
'pl5e':('PL-5EII family',2.89,.127,'pl5','round'), 's530d':('Super 530D',3.80,.263,'s530','point'),
'magic2':('R.550 Magic 2',2.75,.157,'magic','round')}
REFS={
'r27':['https://roe.ru/pdfs/pdf_4714.pdf','https://commons.wikimedia.org/wiki/File:R-27R_medium-to-long-range_air-to-air_missile_in_Park_Patriot_02.jpg'],
'r77':['https://roe.ru/eng/catalog/aerospace-systems/air-to-air-missile/rvv-ae/'],
'r73':['https://roe.ru/eng/catalog/aerospace-systems/air-to-air-missile/r-73e/'],
'amraam':['https://www.af.mil/News/Article-Display/Article/104576/aim-120-amraam/','https://www.af.mil/News/Art/igcategory/Observances/igsort/Title/igtag/Missiles/'],
'sparrow':['https://www.af.mil/News/Art/igcategory/Observances/igsort/Title/igtag/Missiles/'],
'sidewinder':['https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104557/aim-9-sidewinder/'],
'sidewinderx':['https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104557/aim-9-sidewinder/'],
'phoenix':['https://www.navair.navy.mil/node/12701'],
'sd10':['https://www.pac.org.pk/jf-17'], 'pl5':['https://www.pac.org.pk/jf-17'],
's530':['https://www.mbda-systems.com/our-company/our-history'], 'magic':['https://www.mbda-systems.com/our-company/our-history']}
def mat(name,c,metal=0,rough=.45):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m

def mesh(name,v,f,m,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();ob=bpy.data.objects.new(name,me);COL.objects.link(ob);ob.data.materials.append(m)
 for p in me.polygons:p.use_smooth=smooth
 PARTS.append(ob);return ob

def shell(name,st,m):
 # st contains artist profile fractions from nose (t=0) to tail (t=1).
 v=[];f=[];N=64
 for t,r in st:
  for j in range(N):a=2*pi*j/N;v.append((r*cos(a),L*(.5-t),r*sin(a)))
 for k in range(len(st)-1):
  for j in range(N):a=k*N+j;b=k*N+(j+1)%N;f.append((a,b,b+N,a+N))
 f += [tuple(range(N-1,-1,-1)),tuple((len(st)-1)*N+j for j in range(N))]
 return mesh(name,v,f,m,True)

def ring(t,width=.005,m=None):return shell('exterior.joint',[(t-width/2,R*1.007),(t+width/2,R*1.007)],m or SEAM)

def fin(name,outline,angle,m=None,thick=.004):
 # A simple thick art silhouette in longitudinal/radial plane, not an aerofoil.
 v=[]
 for z in [-thick,thick]:
  for t,rad in outline:
   x=rad*cos(angle)-z*sin(angle);zz=rad*sin(angle)+z*cos(angle);v.append((x,L*(.5-t),zz))
 n=len(outline);f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,v,f,m or FIN)

def four(name,outline,offset=0,m=None):
 for i in range(4):fin(name+'.'+str(i),outline,i*pi/2+offset,m)

def gridfin(angle,index):
 # Coarse decorative open grille; intentionally simplified cell spacing.
 verts=[];faces=[]
 def box(r0,r1,w0,w1,t0,t1):
  start=len(verts)
  for t in [t0,t1]:
   for r,w in [(r0,w0),(r1,w0),(r1,w1),(r0,w1)]:verts.append((r*cos(angle)-w*sin(angle),L*(.5-t),r*sin(angle)+w*cos(angle)))
  faces.extend(tuple(start+k for k in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 for j in range(6):
  rr=R+.018+j*.052;box(rr,rr+.009,-.097,.097,.91,.929)
 for j in range(5):
  w=-.097+j*.046;box(R+.018,R+.287,w,w+.008,.91,.929)
 box(R*.92,R+.032,-.034,.034,.899,.940)
 mesh('tail.lattice.'+str(index),verts,faces,STEEL)

def build(aid):
 fam=SPECS[aid][3];nose=SPECS[aid][4]
 if nose=='point':
  nb=.20 if fam in ['phoenix','s530'] else .17
  st=[(0,.0008),(.018,R*.16),(.05,R*.44),(.09,R*.72),(.13,R*.89),(nb,R)]
  shell('nose.radome',st,NOSE)
 else:
  nb=.08
  shell('nose.window',[(0,.0008),(.006,R*.35),(.015,R*.65),(.030,R*.88),(.042,R*.98)],DARK)
  shell('nose.collar',[(.042,R*.98),(.058,R),(.08,R)],STEEL)
 shell('body.shell',[(nb,R),(.91,R),(.98,R*.98),(1,R*.84)],PAINT)
 ring(nb,.006,SEAM)
 for t in [.31,.60,.85]:ring(t,.002)
 # Restrained generic colored identification bands, no labels or functional interpretation.
 if aid.startswith('aim'):
  for t in [.24,.64]:ring(t,.009,BAND)
 if fam=='r27':
  four('forward.strake',[(.20,R*.96),(.23,R+.07),(.285,R+.07),(.285,R*.96)])
  four('butterfly.surface',[(.34,R*.97),(.365,.47),(.46,.48),(.49,R*.97)])
  four('tail.surface',[(.80,R*.97),(.91,.37),(.985,.37),(.97,R*.97)])
 elif fam=='r77':
  four('body.surface',[(.45,R*.97),(.48,.21),(.64,.21),(.655,R*.97)])
  for i in range(4):gridfin(i*pi/2,i)
 elif fam=='r73':
  four('nose.tabs',[(.12,R*.95),(.145,R+.042),(.18,R+.042),(.18,R*.95)])
  four('forward.surface',[(.22,R*.97),(.245,.19),(.30,.18),(.315,R*.97)])
  four('tail.surface',[(.70,R*.97),(.85,.26),(.96,.25),(.985,R*.97)])
 elif fam=='amraam':
  span=.265 if aid=='aim120b' else .225
  four('main.surface',[(.43,R*.97),(.55,span),(.625,span if aid=='aim120c' else .20),(.63,R*.97)])
  four('tail.surface',[(.83,R*.97),(.90,span),(.975,span),(.98,R*.97)])
 elif fam=='sparrow':
  four('main.surface',[(.35,R*.97),(.50,.51),(.66,R*.97)])
  four('tail.surface',[(.79,R*.97),(.89,.48),(.97,.43),(.98,R*.97)])
 elif fam in ['sidewinder','pl5']:
  four('forward.double-delta',[(.14,R*.95),(.20,.13),(.215,.18),(.26,.16),(.27,R*.95)],m=STEEL)
  span=.315 if fam=='sidewinder' else .285
  four('tail.surface',[(.765,R*.97),(.84,span),(.965,span),(.98,R*.97)])
  for i in range(4):fin('tail.tip-block.'+str(i),[(.932,span-.033),(.966,span-.033),(.966,span),(.932,span)],i*pi/2,STEEL,.012)
 elif fam=='sidewinderx':
  four('forward.surface',[(.155,R*.97),(.185,.105),(.245,.105),(.255,R*.97)],m=STEEL)
  four('tail.surface',[(.855,R*.97),(.915,.222),(.983,.21),(.985,R*.97)])
 elif fam=='phoenix':
  four('long.surface',[(.29,R*.97),(.49,.46),(.80,.46),(.85,R*.97)])
  four('tail.surface',[(.87,R*.97),(.89,.40),(.977,.40),(.99,R*.97)])
 elif fam=='sd10':
  four('main.surface',[(.43,R*.97),(.54,.30),(.67,.24),(.68,R*.97)])
  four('tail.surface',[(.84,R*.97),(.90,.32),(.98,.32),(.98,R*.97)])
 elif fam=='s530':
  four('long.surface',[(.32,R*.97),(.49,.31),(.75,.31),(.80,R*.97)])
  four('tail.surface',[(.85,R*.97),(.895,.31),(.98,.31),(.985,R*.97)])
 elif fam=='magic':
  four('front.fixed-surface',[(.15,R*.97),(.175,.155),(.235,.155),(.245,R*.97)])
  four('front.second-surface',[(.26,R*.97),(.285,.19),(.35,.19),(.36,R*.97)])
  four('tail.surface',[(.72,R*.97),(.84,.325),(.96,.325),(.98,R*.97)])
 shell('aft.rim',[(.981,R*.988),(.996,R*.90),(1,R*.84)],STEEL)
 # Flat shaded end-cap only; there are no internal components.
 shell('aft.endcap',[(.999,R*.77),(1.0,R*.77)],DARK)

def main(aid,out):
 global COL,PARTS,L,R,PAINT,FIN,NOSE,DARK,STEEL,SEAM,BAND
 name,L,D,fam,nose=SPECS[aid];R=D/2;dest=out/aid;dest.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene
 COL=bpy.data.collections.new(aid+'.exterior');sc.collection.children.link(COL);PARTS=[]
 warm=aid=='aim54a';PAINT=mat('paint',(.69,.70,.68) if warm else (.49,.54,.57),.12,.46)
 if aid.startswith('r') or aid in ['pl5e','sd10','s530d','magic2']:PAINT=mat('paint.offwhite',(.72,.74,.73),.08,.5)
 FIN=mat('fin.paint',(.44,.48,.49) if aid.startswith('aim') else (.61,.65,.65),.20,.40)
 NOSE=mat('nose.shell',(.72,.73,.70),.02,.5);DARK=mat('dark.glass',(.023,.032,.031),.3,.18);STEEL=mat('exterior.metal',(.22,.24,.24),.65,.32);SEAM=mat('joint.grey',(.24,.27,.28),.2,.5);BAND=mat('illustrative.band',(.49,.30,.075),.03,.52)
 build(aid)
 root=bpy.data.objects.new(aid+'.root',None);COL.objects.link(root)
 for ob in PARTS:ob.parent=root
 root['scope']='Original simplified game exterior; no internals or functional parts';root['axes']='Blender nose +Y / up +Z; GLB nose -Z / up +Y'
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for ob in PARTS:ob.select_set(True)
 bpy.context.view_layer.objects.active=PARTS[0]
 bpy.ops.export_scene.gltf(filepath=str(dest/'model.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
 caveats=['Original simplified exterior art. Dimensions, surface outlines, panel joints and palette are artist approximations. No serial or operational marking accuracy is claimed.','Static deployed exterior only; no attachment, folding, fin or launch animation. No textures or meshes copied from DCS or external sources.']
 if aid=='pl5e':caveats.append('Application display name is PL-5EII. This uses a provisional PL-5 family exterior stand-in; exact EII variant shape and markings are not verified.')
 if fam in ['sd10','pl5']:caveats.append('Chinese family silhouette study: accessible manufacturer material did not verify exact variant proportions. SD-10/PL-5E identification remains approximate and needs reference refinement.')
 if fam in ['magic','s530']:caveats.append('French family silhouette study. Manufacturer history confirms family names, not exact variant geometry; detailed Magic 2/Super 530D fidelity is unverified.')
 if fam=='phoenix':caveats.append('AIM-54A and C intentionally share the family exterior; palette difference is illustrative and is not a reliable variant identifier.')
 if fam in ['r73','r77']:caveats.append('R-73E/RVV-AE export-family references stand in for domestic model exterior. Exact domestic variant fidelity is unverified.')
 manifest=dict(id=aid,name=name,category='missile',status='review',configuration='Static full exterior; simplified silhouette',length=L,nominal_dimensions_metres={'length':L,'body_diameter':D},dimension_source='Approximate public family dimensions for visual scale, not a precision survey or engineering model',axes={'blend':'metres, nose +Y, up +Z, right +X','glb':'metres, nose -Z, up +Y, right +X'},refs=[{'url':u,'role':'Family reference only; no source assets redistributed','accessed':'2026-09-25'} for u in REFS[fam]],variant_caveats=caveats,provenance='Original Blender Python geometry and PBR materials. No imported meshes, images, or textures.',generator='../generate_missiles.py',rebuild=f'blender --background --threads 2 --python generate_missiles.py -- --out OUTPUT --only {aid}',blender_version=bpy.app.version_string,stats={'triangles':sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in PARTS),'objects':len(PARTS),'glb_bytes':(dest/'model.glb').stat().st_size},review=['Actual geometry rendered front quarter, top orthographic and side orthographic; inspection pending'],integration_checks_pending=['App attachment scale and transform','Missile trail anchor','Shared material/disposal contract','Real-device performance and LOD','Flight/explosion animation treatment'])
 (dest/'manifest.json').write_text(json.dumps(manifest,indent=2))
 # Actual-geometry studio, with simple physically supported glTF materials.
 floor=mat('STUDIO.floor',(.035,.05,.065),0,.8);bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.62));bpy.context.object.data.materials.append(floor);bpy.context.object.name='STUDIO.floor'
 world=bpy.data.worlds.new('STUDIO.world');sc.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.28,.34,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
 for nm,pos,power,size in [('key',(-3,4,6),480,5),('rim',(4,-3,5),600,4),('fill',(1,5,2),250,3)]:
  bpy.ops.object.light_add(type='AREA',location=pos);ob=bpy.context.object;ob.name='STUDIO.'+nm;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size;ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='STUDIO.camera';sc.camera=cam;cam.data.type='ORTHO'
 sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.use_denoising=True;sc.render.threads_mode='FIXED';sc.render.threads=2
 sc.render.resolution_x=1000;sc.render.resolution_y=650;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
 for view,pos,scale in [('front',(L*.7,L*.68,L*.55),L*1.03),('top',(0,0,L*2),L*1.14),('side',(L*2,0,0),L*1.14)]:
  cam.location=pos;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
  if view=='top':cam.rotation_euler=(0,0,pi/2)
  sc.render.filepath=str(dest/(view+'.png'));bpy.ops.render.render(write_still=True)
 cam.location=(L*.7,L*.68,L*.55);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=L*1.03
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
 for screen in bpy.data.screens:
  for a in screen.areas:
   if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=str(dest/'model.blend'));print('COMPLETE',aid,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',default=str(Path(__file__).resolve().parent));p.add_argument('--only',nargs='+',choices=list(SPECS));a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
 for aid in a.only or SPECS:main(aid,out)
