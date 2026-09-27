"""CPU orthographic review of the actual exported GLB; requires NumPy, no GPU.
python3 scripts/assets/source/a10c/review.py --models src/assets/models --out .shots/a10c-model-review
This is a geometry/normal review, not a browser or Blender appearance check.
"""
import argparse, json, math, struct, zlib
from pathlib import Path
import numpy as np


def png(path, pixels):
    h,w,_=pixels.shape
    def chunk(kind, data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    raw=b''.join(b'\0'+row.tobytes() for row in pixels)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))


def load(path, deployed=False):
    data=path.read_bytes();jlen=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jlen]);start=28+jlen
    def read(i):
        a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
        return np.frombuffer(data,dtype='<f4',count=a['count']*3,offset=start+v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).copy()
    result=[]
    def walk(i,parent):
        node=doc['nodes'][i];local=np.eye(4);local[:3,3]=node.get('translation',[0,0,0]);angle=0;name=node.get('name','')
        if deployed:
            if name.startswith('gear.') and 'mesh' not in node: angle=-math.pi/2
            if name.startswith('flap.') and 'mesh' not in node: angle=math.pi/6
            if name.startswith('deceleron.') and 'mesh' not in node: angle=(-1 if name.endswith('upper') else 1)*math.pi/3
        c,s=math.cos(angle),math.sin(angle);local[:3,:3]=[[1,0,0],[0,c,-s],[0,s,c]];world=parent@local
        if 'mesh' in node:
            for p in doc['meshes'][node['mesh']]['primitives']:
                v=read(p['attributes']['POSITION'])@world[:3,:3].T+world[:3,3];n=read(p['attributes']['NORMAL'])@world[:3,:3].T
                rgb=doc['materials'][p['material']]['pbrMetallicRoughness']['baseColorFactor'][:3]
                result.append((v.reshape(-1,3,3),n.reshape(-1,3,3),np.array(rgb)))
        for child in node.get('children',[]): walk(child,world)
    for i in doc['scenes'][0]['nodes']: walk(i,np.eye(4))
    return result


def render(parts,eye,width=1100,height=820):
    view=np.array(eye,dtype=float);view/=np.linalg.norm(view)
    up=np.array([0,0,-1] if abs(view[1])>.99 else [0,1,0]);right=np.cross(up,view);right/=np.linalg.norm(right);up=np.cross(view,right);basis=np.array([right,up,view])
    vertices=np.concatenate([v.reshape(-1,3) for v,_,_ in parts])@basis.T;lo=vertices.min(axis=0);hi=vertices.max(axis=0)
    scale=min(width*.85/(hi[0]-lo[0]),height*.85/(hi[1]-lo[1]));center=(lo+hi)/2
    buf=np.zeros((height,width,3),np.float32)+np.array([.075,.095,.12]);depth=np.full((height,width),-np.inf)
    light=np.array([-.45,.82,-.50]);light/=np.linalg.norm(light)
    for positions,normals,rgb in parts:
        for vv,nn in zip(positions,normals):
            if np.mean(nn@view)<-.06:continue
            q=vv@basis.T;xy=(q[:,:2]-center[:2])*scale;xy[:,1]*=-1;xy+=np.array([width/2,height/2])
            x0=max(0,int(math.floor(xy[:,0].min())));x1=min(width-1,int(math.ceil(xy[:,0].max())))
            y0=max(0,int(math.floor(xy[:,1].min())));y1=min(height-1,int(math.ceil(xy[:,1].max())))
            if x1<x0 or y1<y0:continue
            x,y=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
            a,b,c=xy;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-8:continue
            w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;w2=1-w0-w1
            z=w0*q[0,2]+w1*q[1,2]+w2*q[2,2];sub=depth[y0:y1+1,x0:x1+1];mask=(w0>=0)&(w1>=0)&(w2>=0)&(z>sub)
            shade=np.clip(nn@light,0,1)*.63+.33;values=w0*shade[0]+w1*shade[1]+w2*shade[2]
            dst=buf[y0:y1+1,x0:x1+1];color=np.clip(rgb[None,None,:]*values[:,:,None],0,1)**(1/2.2)
            dst[mask]=color[mask];sub[mask]=z[mask]
    return (np.clip(buf,0,1)*255).astype(np.uint8)


def main():
    p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    for name,eye in [('front',(1,.7,-1.3)),('top',(0,1,0)),('side',(1,0,0)),('rear',(1,.55,1.3))]:
        png(args.out/('a10c-'+name+'.png'),render(load(args.models/'a10c.glb'),eye));print(name,flush=True)
    png(args.out/'a10c-deployed.png',render(load(args.models/'a10c.glb',True),(1,.65,1.3)))
    sheets=[]
    for key in ['gbu12','agm65','apkws','mk82','cbu97','tgp']:
        parts=load(args.models/(key+'.glb'))
        row=np.concatenate([render(parts,(1,.65,-1.1),600,420),render(parts,(1,0,0),600,420),render(parts,(0,1,0),600,420)],axis=1)
        png(args.out/(key+'-views.png'),row);sheets.append(row)
    png(args.out/'stores-contact.png',np.concatenate(sheets,axis=0))

if __name__=='__main__':main()
