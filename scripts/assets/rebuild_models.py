"""Rebuild original source art and optimized assets from the repository's preferred sources.
python3 scripts/assets/rebuild_models.py --blender /path/to/blender --work /tmp/fox3-models [--only r77]
"""
import argparse,json,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--blender',default='blender');p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,default=ROOT/'src/assets/models');p.add_argument('--only',nargs='*');a=p.parse_args()
catalog=json.loads((ROOT/'scripts/assets/catalog.json').read_text());selected={r['id'] for r in catalog} if not a.only else set(a.only)
assert selected<=set(r['id'] for r in catalog),'Unknown asset ID'
groups=[('aircraft/hornet/create_hornet.py',['fa18c']),('aircraft/western/generate_fleet.py','f15c f16c f14b jf17 m2000c'.split()),('aircraft/eastern/create_fleet.py','su27 su33 j11a mig29s su25t'.split()),('missiles/generate_missiles.py','r27r r27er r27t r27et r77 r73 aim120b aim120c aim7m aim9m aim9x aim54a aim54c sd10 pl5e s530d magic2'.split()),('stores/generate_stores.py','vikhr kh25ml kh29l kh29t kh58 sa10-missile sa11-missile sa15-missile r60 s8 s13 kab500kr fab250'.split()),('ground/generate_ground.py','tank apc truck bunker building sam-site aaa sa10 sa11 sa15'.split())]
review=a.work.resolve()/'review';review.mkdir(parents=True,exist_ok=True);(review/'fleet.json').write_text(json.dumps(catalog,indent=2)+'\n')
for script,ids in groups:
 ids=[i for i in ids if i in selected]
 if not ids:continue
 output=a.work.resolve()/Path(script).parent;output.mkdir(parents=True,exist_ok=True)
 cmd=[a.blender,'--background','--threads','2','--python',str(ROOT/'scripts/assets/source'/script),'--','--out',str(output)]
 if ids!=['fa18c']:cmd+=['--only',*ids]
 subprocess.run(cmd,check=True)
 for id in ids:
  dst=review/id;dst.mkdir(exist_ok=True)
  src=output if id=='fa18c' else output/id
  shutil.copy2(src/('F18C-refined.glb' if id=='fa18c' else 'model.glb'),dst/'model.glb');shutil.copy2(src/'manifest.json',dst/'manifest.json')
subprocess.run([a.blender,'--background','--threads','2','--python',str(ROOT/'scripts/assets/prepare_models.py'),'--','--source',str(review),'--out',str(a.out.resolve()),'--only',*sorted(selected)],check=True)
