"""Original A-10C II exterior. Geometry preserved from the approved Blender model.
blender --background --threads 2 --python create_a10c.py -- --out REVIEW --only a10c
"""
import argparse
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from blender_exterior import Art, studio, write_manifest

NAMES={'a10c':'A-10C II Tank Killer'}

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

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--only',nargs='*');p.add_argument('--no-render',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    selected=args.only or list(NAMES)
    if not set(selected)<=NAMES.keys():p.error('Unknown asset ID')
    for key in selected:
        out=args.out.resolve()/key;out.mkdir(parents=True,exist_ok=True)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
        model=aircraft()
        bpy.context.view_layer.update()
        stats=model.export(out/'model.glb')
        write_manifest(model,out,NAMES[key],'aircraft','../create_a10c.py',stats)
        studio(model,out,not args.no_render)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'model.blend'))
        print('BLENDER_AUTHORED',key,stats,flush=True)

if __name__=='__main__':main()
