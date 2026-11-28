"""Build self-contained, texture-free DOROLAND-inspired low-poly GLB pets.

DOROOM: 결과는 client/public/assets/pet/pet-{id}.glb 로 바로 저장된다. 실행: python3 client/tools/pet-models/generate.py

Coordinates: metres, +Y up, +Z face. Each part is a named glTF node.
This is procedural mesh construction, not image-to-3D reconstruction.
"""
import json, math, struct, pathlib, zipfile
from collections import defaultdict

import os
OUT = pathlib.Path(os.environ.get('PET_OUT') or pathlib.Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'pet')   # client/public/assets/pet
TAU = math.tau
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def mul(a,s): return tuple(x*s for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):
    d=math.sqrt(dot(a,a)); return mul(a,1/d) if d>1e-9 else (0,1,0)
# glTF baseColorFactor 는 선형 값이다. 화면 색(sRGB 16진수)을 그대로 넣으면 실제보다 훨씬 연하게 보이므로 변환한다.
def srgb_to_linear(c): return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def rgb(h): return [srgb_to_linear(int(h[i:i+2],16)/255) for i in (0,2,4)]+[1]
def quat_mul(a,b):
    ax,ay,az,aw=a;bx,by,bz,bw=b
    return [aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz]
def quat(axis,angle): return list(mul(norm(axis),math.sin(angle/2)))+[math.cos(angle/2)]

def orient(p,n,idx):
    for i in range(0,len(idx),3):
        a,b,c=idx[i:i+3]
        if dot(cross(sub(p[b],p[a]),sub(p[c],p[a])),add(add(n[a],n[b]),n[c]))<0:
            idx[i+1],idx[i+2]=c,b
    return p,n,idx

def boxmesh(size,r,steps=7):
    h=tuple(x/2 for x in size); r=min(r,*h); inner=tuple(x-r for x in h)
    p=[]; normals=[]; idx=[]
    for axis in range(3):
        for sign in (-1,1):
            other=[i for i in range(3) if i!=axis]; start=len(p)
            for v in range(steps+1):
                for u in range(steps+1):
                    q=[0.,0.,0.];q[axis]=sign*h[axis]
                    q[other[0]]=(2*u/steps-1)*h[other[0]]
                    q[other[1]]=(2*v/steps-1)*h[other[1]]
                    core=tuple(max(-inner[i],min(inner[i],q[i])) for i in range(3))
                    normal=norm(sub(q,core));p.append(add(core,mul(normal,r)));normals.append(normal)
            for v in range(steps):
                for u in range(steps):
                    a=start+v*(steps+1)+u;b=a+steps+1
                    idx.extend((a,a+1,b+1,a,b+1,b))
    return orient(p,normals,idx)

def sphere(seg=16,rings=10):
    p=[];n=[];idx=[]
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(seg+1):
            f=TAU*i/seg;q=(math.sin(t)*math.cos(f),math.cos(t),math.sin(t)*math.sin(f))
            p.append(q);n.append(q)
    for j in range(rings):
        for i in range(seg):
            a=j*(seg+1)+i;b=a+seg+1;idx.extend((a,b,a+1,a+1,b,b+1))
    return orient(p,n,idx)

def tube(points,radii,sides=9):
    p=[];n=[];idx=[]
    for j,point in enumerate(points):
        tangent=norm(sub(points[min(j+1,len(points)-1)],points[max(0,j-1)]))
        ref=(0,0,1) if abs(tangent[2])<.85 else (0,1,0)
        u=norm(cross(tangent,ref));v=cross(tangent,u)
        for i in range(sides):
            normal=add(mul(u,math.cos(TAU*i/sides)),mul(v,math.sin(TAU*i/sides)))
            p.append(add(point,mul(normal,radii[j])));n.append(normal)
    for j in range(len(points)-1):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;c=b+sides;d=a+sides
            idx.extend((a,b,c,a,c,d))
    # Closed end caps with independent flat normals.
    for j,sgn in ((0,-1),(len(points)-1,1)):
        tangent=norm(sub(points[min(j+1,len(points)-1)],points[max(0,j-1)]));normal=mul(tangent,sgn)
        center=len(p);p.append(points[j]);n.append(normal);start=len(p)
        for i in range(sides):p.append(p[j*sides+i]);n.append(normal)
        for i in range(sides):idx.extend((center,start+i,start+(i+1)%sides))
    return orient(p,n,idx)


def slab(size,r,axis=2,seg=6):
    """둥근 사각형을 axis 방향으로 민 판 (몸통을 감싸는 띠·줄무늬용). 모서리 둥글기는 단면에만 적용."""
    ax=[i for i in range(3) if i!=axis]; w,h=size[ax[0]]/2,size[ax[1]]/2; d=size[axis]/2; r=min(r,w,h)
    ring=[]
    for cu,cv,a0 in ((w-r,h-r,0),(-(w-r),h-r,math.pi/2),(-(w-r),-(h-r),math.pi),(w-r,-(h-r),1.5*math.pi)):
        for i in range(seg+1):
            a=a0+math.pi/2*i/seg;ring.append((cu+r*math.cos(a),cv+r*math.sin(a),math.cos(a),math.sin(a)))
    def P(u,v,t):
        q=[0.,0.,0.];q[ax[0]]=u;q[ax[1]]=v;q[axis]=t;return tuple(q)
    p=[];n=[];idx=[];N=len(ring)
    for t in (-d,d):
        for u,v,nu,nv in ring:p.append(P(u,v,t));n.append(P(nu,nv,0))
    for i in range(N):
        j=(i+1)%N;idx.extend((i,j,N+j,i,N+j,N+i))
    for sgn,t in ((-1,-d),(1,d)):
        c=len(p);p.append(P(0,0,t));n.append(P(0,0,sgn));st=len(p)
        for u,v,_,_ in ring:p.append(P(u,v,t));n.append(P(0,0,sgn))
        for i in range(N):idx.extend((c,st+i,st+(i+1)%N))
    return orient(p,n,idx)

def prism(outline,r,depth,seg=5):
    """모서리를 둥글린 다각형(xy 평면)을 z 방향으로 민 판 — 세모 귀 같은 납작한 부품용."""
    n=len(outline);ring=[]
    for i in range(n):
        a=outline[i-1];b=outline[i];c=outline[(i+1)%n]
        d1=norm((b[0]-a[0],b[1]-a[1],0));d2=norm((c[0]-b[0],c[1]-b[1],0))
        n1=(d1[1],-d1[0]);n2=(d2[1],-d2[0])
        a1=math.atan2(n1[1],n1[0]);a2=math.atan2(n2[1],n2[0])
        while a2<a1:a2+=TAU
        ctr=None
        # 꼭짓점 안쪽으로 r 만큼 들어간 원의 중심
        bis=norm((n1[0]+n2[0],n1[1]+n2[1],0));half=(a2-a1)/2
        dist=r/max(.2,math.cos(half));ctr=(b[0]-bis[0]*dist,b[1]-bis[1]*dist)
        for k in range(seg+1):
            t=a1+(a2-a1)*k/seg;ring.append((ctr[0]+r*math.cos(t),ctr[1]+r*math.sin(t),math.cos(t),math.sin(t)))
    p=[];nn=[];idx=[];N=len(ring);d=depth/2
    for z in (-d,d):
        for u,v,nu,nv in ring:p.append((u,v,z));nn.append((nu,nv,0))
    for i in range(N):
        j=(i+1)%N;idx.extend((i,j,N+j,i,N+j,N+i))
    cx=sum(q[0] for q in ring)/N;cy=sum(q[1] for q in ring)/N
    for sgn,z in ((-1,-d),(1,d)):
        c=len(p);p.append((cx,cy,z));nn.append((0,0,sgn));st=len(p)
        for u,v,_,_ in ring:p.append((u,v,z));nn.append((0,0,sgn))
        for i in range(N):idx.extend((c,st+i,st+(i+1)%N))
    return orient(p,nn,idx)

class Pet:
    """Body cube: x ±.56, y .24~1.36, z ±.50 (front face z=.50). Legs y 0~.28."""
    FRONT=.50
    def __init__(self,id,name,color):
        self.id=id;self.name=name;self.color=color;self.parts=[]
    def mesh(self,name,geo,pos=(0,0,0),color=None,scale=(1,1,1),rot=None):
        self.parts.append(dict(name=name,geo=geo,pos=pos,color=color or self.color,scale=scale,rot=rot))
    def box(self,name,pos,size,color=None,r=.09,rot=None):
        self.mesh(name,boxmesh(size,r),pos,color,rot=rot)
    def band(self,name,pos,size,color=None,r=.29,axis=2,rot=None):
        self.mesh(name,slab(size,r,axis),pos,color,rot=rot)
    def ell(self,name,pos,size,color=None,rot=None):
        self.mesh(name,sphere(),pos,color,size,rot)
    def path(self,name,points,radii,color=None):self.mesh(name,tube(points,radii),color=color)
    # 몸통: 그림처럼 모서리가 크게 둥근 정육면체
    def body(self,color=None,size=(1.12,1.12,1.0),center=(0,.80,0),r=.28):
        self.box('body',center,size,color,r=r)
    # 다리: 네 모서리 아래의 짧고 둥근 기둥 (이름 foot_* 는 걷기 동작에서 사용)
    def feet(self,color=None,count=4,hoof=None):
        zs=(-.27,.27) if count==4 else (.10,)
        for x in (-.31,.31):
            for z in zs:
                name='foot_'+('L' if x<0 else 'R')+('_back' if z<0 else '_front')
                self.box(name,(x,.15,z),(.28,.30,.28),color,r=.12)
    # 눈: 큰 흰자 + 큰 검은 눈동자 (그림처럼 살짝 아래·안쪽을 봄)
    def eyes(self,y=.90,x=.22,z=None,size=1.0,white='F6F3FC',pupil='2E2933'):
        z=self.FRONT if z is None else z
        for side in (-1,1):
            self.ell('eye_white_'+str(side),(x*side,y,z+.005),(.145*size,.15*size,.07),white)
            self.ell('pupil_'+str(side),(x*side-.018*side,y-.022,z+.058),(.088*size,.10*size,.03),pupil)
    # 웃는 입 (닫힘)
    def smile(self,y=.60,z=None,w=.09,color='3E2A33'):
        z=self.FRONT if z is None else z
        pts=[(-w,y+.035,z),(-w*.6,y-.002,z+.01),(0,y-.02,z+.014),(w*.6,y-.002,z+.01),(w,y+.035,z)]
        self.path('smile',pts,[.016]*5,color)
    # 벌린 입 + 분홍 혀 (그림의 '헤' 하고 웃는 입)
    def mouth(self,y=.58,z=None,w=.12,h=.09):
        z=self.FRONT if z is None else z
        # 위는 평평하고 아래가 둥근 'D' 모양 → 웃으며 벌린 입
        arc=lambda W,H:[(W,0,0),(-W,0,0)]+[(W*math.cos(t),H*math.sin(t),0) for t in [math.pi+math.pi*i/10 for i in range(1,10)]]
        self.mesh('mouth',prism(arc(w,h*1.5),.012,.03),(0,y+h*.55,z+.012),'5E2734')
        self.ell('tongue',(0,y-h*.55,z+.03),(w*.5,h*.36,.02),'EE7F93')
    def nose(self,pos,size=(.075,.055,.045),color='4C3540'):self.ell('nose',pos,size,color)
    def muzzle(self,color,y=.66,w=.24,h=.17,z=None,depth=.08):
        z=self.FRONT if z is None else z
        self.ell('muzzle',(0,y,z+.01),(w,h,depth),color)
    def round_ears(self,color=None,inner=None,x=.38,y=1.36,z=.10,size=.17):
        for side in (-1,1):
            self.ell('ear_'+str(side),(side*x,y,z),(size,size,size*.62),color)
            if inner:self.ell('ear_inner_'+str(side),(side*x,y-.01,z+size*.52),(size*.6,size*.6,.03),inner)
    def point_ears(self,color=None,inner=None,x=.40,y=1.33,z=.16,tilt=.35):
        for side in (-1,1):
            rot=quat((0,0,1),-side*tilt)
            self.path('ear_'+str(side),[(side*x,y,z),(side*(x+.07),y+.26,z)],[.15,.02],color)
            if inner:self.path('ear_inner_'+str(side),[(side*x,y+.01,z+.07),(side*(x+.06),y+.2,z+.06)],[.085,.012],inner)
    def export(self):
        buf=bytearray();views=[];access=[];meshes=[];nodes=[];mats=[];matmap={};cache={}
        def acc(values,components,typ,comp):
            while len(buf)%4:buf.append(0)
            offset=len(buf);flat=[v for row in values for v in row] if components>1 else values
            fmt='f' if comp==5126 else 'I';buf.extend(struct.pack('<'+str(len(flat))+fmt,*flat))
            views.append(dict(buffer=0,byteOffset=offset,byteLength=len(buf)-offset,target=34963 if comp==5125 else 34962))
            a=dict(bufferView=len(views)-1,componentType=comp,count=len(values),type=typ)
            if typ=='VEC3':a.update(min=[min(row[k] for row in values) for k in range(3)],max=[max(row[k] for row in values) for k in range(3)])
            access.append(a);return len(access)-1
        for part in self.parts:
            color=part['color']
            if color not in matmap:
                matmap[color]=len(mats);mats.append(dict(name='color_'+color,pbrMetallicRoughness=dict(baseColorFactor=rgb(color),metallicFactor=0,roughnessFactor=.82)))
            p,n,ind=part['geo'];key=(str(p),str(n),str(ind),color)
            if key not in cache:
                pa=acc(p,3,'VEC3',5126);na=acc(n,3,'VEC3',5126);ia=acc(ind,1,'SCALAR',5125)
                cache[key]=len(meshes);meshes.append(dict(name=part['name'],primitives=[dict(attributes=dict(POSITION=pa,NORMAL=na),indices=ia,material=matmap[color])]))
            node=dict(name=part['name'],mesh=cache[key],translation=list(part['pos']),scale=list(part['scale']))
            if part['rot']:node['rotation']=part['rot']
            nodes.append(node)
        root=len(nodes);nodes.append(dict(name=self.id,children=list(range(root))))
        doc=dict(asset=dict(version='2.0',generator='DOROOM procedural pet builder',copyright='Original procedural meshes based on supplied DOROLAND references'),scene=0,scenes=[dict(nodes=[root])],nodes=nodes,meshes=meshes,materials=mats,buffers=[dict(byteLength=len(buf))],bufferViews=views,accessors=access,extras=dict(id=self.id,name_ko=self.name,units='metres',front='+Z',up='+Y',rigged=False,reference='Supplied PNG reference; simplified procedural interpretation'))
        raw=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();raw+=b' '*((-len(raw))%4)
        buf+=b'\x00'*((-len(buf))%4)
        glb=struct.pack('<III',0x46546C67,2,28+len(raw)+len(buf))+struct.pack('<II',len(raw),0x4E4F534A)+raw+struct.pack('<II',len(buf),0x004E4942)+buf
        (OUT/f'pet-{self.id}.glb').write_bytes(glb)
        return dict(id=self.id,name=self.name,file=f'pet-{self.id}.glb',bytes=len(glb),parts=root,triangles=sum(len(a['geo'][2])//3 for a in self.parts))

def make(id,name,c):return Pet(id,name,c)
F=Pet.FRONT
def pet_models():
    pets=[]
    # 꿀벌: 노란 몸, 뒤쪽 검은 띠, 더듬이, 큰 반투명 날개, 검은 다리, 작은 벌린 입
    p=make('bee','꿀벌','F7B932');p.body();p.feet('3C3446');p.eyes(.88)
    p.ell('mouth',(0,.62,F),(.05,.045,.03),'B0402F')
    p.band('black_band',(0,.80,-.10),(1.135,1.135,.26),'3C3446')
    for s in (-1,1):
        # 날개: 두께를 주고 뒤로 눕히고 바깥으로 벌려서 위에서 봐도 입체적으로 (큰 날개 + 뒤쪽 작은 날개)
        lean=lambda tz,ty,tx:quat_mul(quat_mul(quat((0,1,0),ty),quat((1,0,0),tx)),quat((0,0,1),tz))
        p.ell('wing_'+str(s),(s*.26,1.66,-.12),(.24,.40,.11),'DCD6F4',lean(s*-.45,s*.55,-.35))
        p.ell('wing_small_'+str(s),(s*.30,1.50,-.30),(.15,.24,.09),'CFC8EE',lean(s*-.9,s*.7,-.6))
        p.path('antenna_'+str(s),[(s*.17,1.30,.30),(s*.19,1.50,.32),(s*.27,1.55,.30)],[.045,.045,.06],'3C3446')
    pets.append(p)
    # 토끼: 긴 귀(안쪽 살구색), 분홍 코, 흰 볼, 흰 꼬리
    p=make('rabbit','토끼','D9774B');p.body(size=(1.32,1.12,1.14));p.feet();FR=.57   # 펭귄처럼 통통하게 (앞뒤로 두껍게)
    p.eyes(.86,.27,FR)
    p.ell('cheek',(-.06,.63,FR+.005),(.09,.07,.04),'F6DCCF');p.ell('cheek',(.06,.63,FR+.005),(.09,.07,.04),'F6DCCF')
    p.nose((0,.71,FR+.04),(.07,.05,.04),'EE7A98')
    for s in (-1,1):
        rot=quat((0,0,1),-s*.12)
        p.ell('ear_'+str(s),(s*.30,1.62,.02),(.22,.38,.11),rot=rot)
        p.ell('ear_inner_'+str(s),(s*.30,1.60,.10),(.13,.27,.03),'F2A982',rot)
    p.ell('tail',(.24,.70,-.60),(.18,.18,.16),'F6F2F4');pets.append(p)
    # 애벌레: 초록 몸, 등 위 노란 띠, 더듬이 두 개, 아래 다리 6개, 벌린 입
    p=make('caterpillar','애벌레','2FA265');p.body();p.eyes(.90,.21);p.mouth(.60,w=.13,h=.08)
    p.band('yellow_back',(0,.93,-.14),(1.135,.90,.14),'F7C43A')   # 등 위를 가로질러 양옆으로 내려오는 노란 줄 (안장 모양)
    for s in (-1,1):
        p.box('antenna_'+str(s),(s*.22,1.44,.26),(.17,.24,.17),r=.08)
        for z in (-.32,0,.32):p.box('side_foot',(s*.33,.13,z),(.22,.26,.22),r=.1)
    pets.append(p)
    # 병아리: 노란 몸, 위 볏, 옆 날개, 주황 부리·발
    p=make('chick','병아리','F9C02E');p.body();p.feet('F07A2E',2);p.eyes(.88)
    p.ell('beak',(0,.66,F+.04),(.12,.08,.10),'F27C30')
    for s in (-1,1):p.ell('wing_'+str(s),(s*.66,.82,.06),(.20,.10,.24),rot=quat((0,0,1),s*.35))
    p.box('crest',(0,1.44,.02),(.18,.24,.42),r=.09);p.box('crest',(0,1.40,-.22),(.16,.18,.16),r=.07)
    pets.append(p)
    # 소: 흰 몸, 검은 점, 주황 뿔, 분홍 코·발굽·귀 안쪽
    p=make('cow','소','E4DCF6');p.body()
    for x in (-.30,.30):
        for z in (-.27,.27):
            name='foot_'+('L' if x<0 else 'R')+('_back' if z<0 else '_front')
            p.box(name,(x,.15,z),(.25,.30,.25),r=.11)
    p.eyes(.88,.21);p.ell('snout',(0,.60,F+.03),(.26,.15,.08),'F29AA8')
    for s in (-1,1):
        p.ell('nostril_'+str(s),(s*.09,.61,F+.10),(.03,.045,.012),'7A3A4A')
        p.path('horn_'+str(s),[(s*.25,1.32,.05),(s*.30,1.58,.06)],[.10,.02],'E0A05A')
        p.ell('ear_'+str(s),(s*.62,1.14,.12),(.17,.10,.10),rot=quat((0,0,1),s*-.3));p.ell('ear_inner_'+str(s),(s*.64,1.13,.19),(.10,.055,.02),'F29AA8',quat((0,0,1),s*-.3))
    for pos,size in [((.565,.80,-.12),(.012,.24,.22)),((.565,1.12,.22),(.012,.10,.09)),((-.565,.86,-.02),(.012,.20,.20)),((.12,1.365,-.16),(.17,.012,.14))]:p.ell('spot',pos,size,'3A3442')
    pets.append(p)
    # 물고기: 주황 흰띠(검은 테두리), 검은 등지느러미, 옆·꼬리 지느러미, 벌린 입
    p=make('fish','물고기','F2862E');p.body(size=(1.04,.96,.92),center=(0,.70,0),r=.28);FF=.46
    p.eyes(.82,.20,FF);p.mouth(.52,FF,.10,.065)
    p.band('white_band',(0,.70,-.08),(1.055,.975,.34),'F4F0F8')
    for z in (-.265,.105):p.band('black_band',(0,.70,z),(1.06,.98,.04),'3A3442')
    for s in (-1,1):p.ell('side_fin',(s*.58,.52,.20),(.20,.16,.08),rot=quat((0,1,0),s*.9))
    p.ell('dorsal',(0,1.22,-.12),(.06,.28,.26),'3A3442',quat((1,0,0),.6))
    p.ell('tail',(0,.72,-.52),(.08,.15,.15));p.ell('tail',(0,.90,-.72),(.07,.22,.15),rot=quat((1,0,0),.65));p.ell('tail',(0,.54,-.72),(.07,.22,.15),rot=quat((1,0,0),-.65))
    pets.append(p)
    # 펭귄: 남색 몸, 하트 모양 연보라 얼굴·배, 옆 날개, 주황 부리·발
    p=make('penguin','펭귄','4A4565');p.body();p.feet('F08A3A',2)
    for s in (-1,1):p.ell('face',(s*.20,.98,F-.02),(.27,.28,.05),'DCD3F2')
    p.box('face',(0,.64,F-.02),(.84,.68,.07),'DCD3F2',.22)
    p.eyes(.92,.20,F+.025);p.ell('beak',(0,.70,F+.06),(.10,.07,.09),'F08A3A')
    for s in (-1,1):p.ell('flipper_'+str(s),(s*.68,.78,.04),(.24,.12,.26),rot=quat((0,0,1),-s*.25))
    pets.append(p)
    # 돼지: 분홍 몸, 앞으로 접힌 세모 귀, 큰 코, 웃는 입, 꼬불 꼬리
    p=make('pig','돼지','EE80B5');p.body();p.feet();p.eyes(.90,.22)
    p.ell('snout',(0,.68,F+.04),(.20,.14,.09),'F294C2')
    for s in (-1,1):p.ell('nostril_'+str(s),(s*.07,.69,F+.13),(.03,.05,.012),'6B2E4C')
    p.smile(.49)
    tri=[(-.17,0,0),(.17,0,0),(0,.30,0)]
    for s in (-1,1):p.mesh('ear_'+str(s),prism(tri,.05,.06),(s*.30,1.30,.22),rot=quat((1,0,0),1.0))
    pts=[(.30+math.cos(t)*.07,.92+math.sin(t)*.07,-.53-.03*t) for t in [i*TAU/14 for i in range(17)]];p.path('curly_tail',pts,[.03]*len(pts));pets.append(p)
    # 비버: 갈색 몸, 작은 귀, 살구색 주둥이, 큰 앞니 두 개, 뒤에 선 넓적 꼬리
    p=make('beaver','비버','C97A4E');p.body();p.feet();p.eyes(.90);p.round_ears(x=.36,size=.13)
    p.muzzle('F2B48C',.62,.25,.15);p.nose((0,.71,F+.08),(.09,.065,.05),'5A3328')
    for s in (-1,1):p.box('tooth',(s*.05,.51,F+.06),(.09,.14,.04),'FFFFFF',.03)
    p.ell('paddle_tail',(0,1.08,-.64),(.34,.50,.14),'7A4630',quat((1,0,0),-.15));pets.append(p)
    # 게: 빨간 정육면체, 위 앞쪽에 큰 집게, 옆 다리 3쌍, 벌린 입
    p=make('crab','게','F25A38');p.body(size=(1.16,.96,1.0),center=(0,.62,0));p.eyes(.68,.21);p.mouth(.40)
    for s in (-1,1):
        for i,z in enumerate((-.30,0,.30)):
            p.path('leg_'+str(s)+'_'+str(i),[(s*.50,.26,z),(s*.64,.16,z),(s*.66,.09,z)],[.11,.105,.095],'E2453A')   # 짧고 통통한 옆다리
        p.ell('claw_base',(s*.46,1.10,.30),(.18,.16,.13),'E2453A')
        for dx in (-.09,.09):p.ell('claw_finger',(s*.46+dx,1.26,.30),(.08,.14,.09),'E2453A',quat((0,0,1),dx*2.6))
    pets.append(p)
    # 멧돼지: 갈색 몸, 등 갈기, 둥근 귀, 큰 코, 휜 엄니, 벌린 입
    p=make('boar','멧돼지','C9714B');p.body();p.feet();p.eyes(.92);p.round_ears(x=.36,size=.14)
    p.ell('snout',(0,.68,F+.04),(.22,.14,.08),'D27E58')
    for s in (-1,1):
        p.ell('nostril',(s*.065,.70,F+.11),(.025,.04,.012),'5A3328')
        p.path('tusk',[(s*.20,.60,F+.02),(s*.30,.66,F+.06),(s*.31,.78,F+.06)],[.06,.045,.006],'F2DDB4')
    p.mouth(.50,w=.08,h=.06)
    for z in (-.36,-.12,.12):p.ell('bristle_ridge',(0,1.40,z),(.22,.17,.17),'B5603C')
    pets.append(p)
    # 코알라: 회보라 몸, 위 모서리 큰 둥근 귀(밝은 안쪽), 큰 코, 밝은 주둥이, 벌린 입
    p=make('koala','코알라','7F7BA0');p.body();p.feet('A9A2CC');p.eyes(.90,.26)
    p.muzzle('A9A2CC',.56,.28,.18,depth=.05)
    p.nose((0,.74,F+.07),(.13,.16,.08),'4E4766');p.mouth(.50,F+.03,.12,.075)
    for s in (-1,1):
        p.ell('ear_'+str(s),(s*.66,1.06,-.06),(.36,.36,.14));p.ell('ear_inner_'+str(s),(s*.68,1.04,.06),(.22,.22,.03),'B8B0DA')
    pets.append(p)
    # 원숭이: 주황 몸, 하트 모양 살구색 얼굴, 옆 큰 귀, 볼록 주둥이, 꼬리
    p=make('monkey','원숭이','E38C55');p.body();p.feet()
    for s in (-1,1):p.ell('face_mask',(s*.19,.90,F-.02),(.27,.26,.05),'F8BE9E')
    p.ell('face_mask',(0,.64,F-.02),(.40,.26,.05),'F8BE9E')
    p.eyes(.88,.19,F+.02);p.muzzle('F8BE9E',.62,.17,.12,F+.03,.07)
    p.nose((0,.68,F+.11),(.05,.035,.02),'5A3328');p.smile(.58,F+.11,.06)
    for s in (-1,1):p.ell('ear_'+str(s),(s*.60,.92,0),(.10,.22,.22));p.ell('ear_inner_'+str(s),(s*.67,.92,0),(.03,.14,.14),'F8BE9E')
    curl=[(.85,-.50),(1.15,-.60),(1.45,-.62),(1.70,-.68),(1.88,-.82),(1.90,-1.00),(1.78,-1.12),(1.62,-1.10),(1.56,-.98),(1.62,-.90)]
    p.path('curled_tail',[(.12,y,z) for y,z in curl],[.065]*len(curl));pets.append(p)
    # 앵무새: 빨간 몸, 파란 날개·꼬리깃, 회색 부리, 벌린 입, 주황 발
    p=make('parrot','앵무새','F05A38');p.body();p.feet('F28C2E',2);p.eyes(.90,.21)
    p.path('beak',[(0,.80,F+.02),(0,.80,F+.16),(0,.66,F+.20)],[.11,.08,.01],'5E5866')
    for s in (-1,1):p.ell('wing_'+str(s),(s*.64,.80,-.04),(.20,.08,.30),'6B63E0',quat((0,0,1),s*.45))
    for dx in (-.10,.10):p.ell('tail_feather',(dx,1.30,-.50),(.10,.30,.11),'6B63E0',quat((1,0,0),-.75))
    pets.append(p)
    # 사슴: 갈색 몸, 뾰족 귀, 가지 뿔, 살구 주둥이, 웃는 입
    p=make('deer','사슴','D9784E');p.body();p.feet();p.eyes(.90)
    for s in (-1,1):p.ell('ear_'+str(s),(s*.60,1.30,.12),(.27,.13,.08),rot=quat((0,0,1),s*.5));p.ell('ear_inner_'+str(s),(s*.61,1.30,.19),(.17,.075,.02),'F2A982',quat((0,0,1),s*.5))
    p.muzzle('F2B48C',.62,.24,.16);p.nose((0,.70,F+.08),(.07,.05,.04),'5A3328');p.smile(.58,F+.08,.07)
    for s in (-1,1):
        p.path('antler',[(s*.22,1.34,.0),(s*.26,1.58,.0),(s*.36,1.80,.0)],[.085,.08,.07],'8A4A30')
        p.path('antler_branch',[(s*.27,1.58,.0),(s*.13,1.72,.0)],[.07,.06],'8A4A30')
    pets.append(p)
    # 코끼리: 연보라 몸, 옆 큰 귀, 아래로 휜 코, 상아, 작게 벌린 입
    p=make('elephant','코끼리','9C99DC');p.body();p.feet();p.eyes(.92,.22)
    for s in (-1,1):
        p.ell('ear_'+str(s),(s*.60,.90,.12),(.07,.36,.32),'8783CC')
        p.path('tusk',[(s*.16,.64,F+.02),(s*.24,.58,F+.16),(s*.22,.66,F+.24)],[.05,.04,.006],'F2E8D8')
    p.ell('mouth',(0,.55,F+.005),(.06,.05,.03),'5E2734')
    p.path('trunk',[(0,.78,F),(0,.66,F+.12),(0,.46,F+.18),(0,.36,F+.28),(0,.42,F+.36)],[.11,.10,.09,.08,.07]);pets.append(p)
    # 기린: 노란 몸, 갈색 점, 뿔(공), 귀, 주둥이, 웃는 입
    p=make('giraffe','기린','F6B42E');p.body();p.feet();p.eyes(.90)
    for s in (-1,1):p.ell('ear_'+str(s),(s*.58,1.24,.10),(.20,.11,.08),rot=quat((0,0,1),s*.35));p.ell('ear_inner_'+str(s),(s*.59,1.24,.16),(.12,.06,.02),'F2A982',quat((0,0,1),s*.35))
    p.muzzle('F2A56E',.60,.25,.17);p.nose((0,.70,F+.08),(.06,.045,.04),'6B3A2E');p.smile(.58,F+.08,.06)
    for s in (-1,1):
        p.path('ossicone',[(s*.22,1.34,0),(s*.24,1.60,0)],[.07,.065]);p.ell('ossicone_tip',(s*.24,1.66,0),(.12,.11,.12),'D9773E')
    for x,y,sz in [(-.34,1.14,.08),(.32,1.12,.07),(.02,1.22,.06)]:p.ell('face_spot',(x,y,F+.002),(sz,sz,.012),'D9773E')
    for y,z,sz in [(.62,-.20,.15),(1.06,.16,.10),(1.12,-.28,.11)]:p.ell('side_spot',(.562,y,z),(.012,sz,sz),'D9773E')
    for x,z,sz in [(.0,.0,.13),(-.28,-.26,.09)]:p.ell('top_spot',(x,1.362,z),(sz,.012,sz),'D9773E')
    pets.append(p)
    # 북극곰: 연보라 흰 몸, 둥근 귀, 흰 주둥이, 검은 코, 웃는 입
    p=make('polarbear','북극곰','D9D0F4');p.body();p.feet();p.eyes(.92,.22);p.round_ears(inner='C4B9EC',x=.38,size=.15)
    p.muzzle('EEE9FB',.62,.24,.17);p.nose((0,.70,F+.09),(.08,.06,.045),'2E2A3A');p.smile(.59,F+.09,.07)
    pets.append(p)
    # 사자: 노란 몸, 얼굴을 감싼 둥근 주황 갈기, 앞 귀, 베이지 주둥이, 벌린 입, 꼬리 끝 털
    p=make('lion','사자','F4A93A');p.body();p.feet()
    p.box('mane',(0,.84,.24),(1.36,1.32,.64),'D8643A',.32)
    p.box('face',(0,.82,.56),(.84,.82,.12),'F4A93A',.24);FL=.62
    p.round_ears(inner='EE9C80',x=.33,y=1.20,z=.58,size=.12)
    p.eyes(.90,.20,FL);p.muzzle('F2D2B4',.64,.20,.14,FL,.06);p.nose((0,.72,FL+.06),(.07,.05,.04),'5A3328');p.mouth(.57,FL+.05,.07,.055)
    p.path('tail',[(.10,.80,-.48),(.12,1.00,-.62),(.12,1.30,-.66),(.10,1.55,-.60)],[.055]*4);p.ell('tail_tuft',(.08,1.62,-.56),(.14,.16,.12),'D8643A',quat((1,0,0),-.4));pets.append(p)
    # 호랑이: 주황 몸, 검은 줄(위·옆), 큰 흰 주둥이, 귀, 줄무늬 꼬리 흰 끝
    p=make('tiger','호랑이','F28A2E');p.body();p.feet();p.eyes(.94,.22);p.round_ears(inner='F5B388',x=.38,size=.14)
    p.ell('muzzle',(0,.56,F-.01),(.37,.27,.06),'EDE4F2')
    p.nose((0,.68,F+.05),(.075,.055,.04),'3E3445');p.smile(.58,F+.05,.07)
    for z in (-.30,.04):p.band('stripe',(0,1.00,z),(1.135,.76,.15),'3E3445')   # 등 위 굵은 줄 2개 (옆구리 중간까지)
    for s in (-1,1):
        p.ell('low_stripe',(s*.562,.52,-.13),(.014,.07,.20),'3E3445')   # 등 줄 아래 옆구리에 줄 하나 더
        for y in (.98,.80):p.ell('cheek_stripe',(s*.44,y,.42),(.12,.04,.035),'3E3445',quat((0,1,0),s*.75))   # 얼굴 양옆 무늬
    p.ell('forehead_stripe',(0,1.32,.36),(.07,.03,.12),'3E3445',quat((1,0,0),-.6))
    p.path('tail',[(.12,.70,-.48),(.16,1.08,-.68),(.12,1.52,-.62)],[.085]*3)
    for y in (.98,1.28):p.ell('tail_stripe',(.145,y,-.665),(.095,.035,.095),'3E3445')
    p.ell('tail_tip',(.12,1.60,-.62),(.13,.13,.13),'EDE4F2');pets.append(p)
    return pets

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    items=[p.export() for p in pet_models()]
    for x in items:print(x['id'],x['parts'],'parts',x['triangles'],'triangles',round(x['bytes']/1024),'KB')
