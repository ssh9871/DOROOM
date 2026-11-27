"""Build self-contained, texture-free DOROLAND-inspired low-poly GLB pets.

DOROOM: 결과는 client/public/assets/pet/pet-{id}.glb 로 바로 저장된다. 실행: python3 client/tools/pet-models/generate.py

Coordinates: metres, +Y up, +Z face. Each part is a named glTF node.
This is procedural mesh construction, not image-to-3D reconstruction.
"""
import json, math, struct, pathlib, zipfile
from collections import defaultdict

OUT = pathlib.Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'pet'   # client/public/assets/pet
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

class Pet:
    def __init__(self,id,name,color):
        self.id=id;self.name=name;self.color=color;self.parts=[]
    def mesh(self,name,geo,pos=(0,0,0),color=None,scale=(1,1,1),rot=None):
        self.parts.append(dict(name=name,geo=geo,pos=pos,color=color or self.color,scale=scale,rot=rot))
    def box(self,name,pos,size,color=None,r=.09,rot=None):
        self.mesh(name,boxmesh(size,r),pos,color,rot=rot)
    def ell(self,name,pos,size,color=None,rot=None):
        self.mesh(name,sphere(),pos,color,size,rot)
    def path(self,name,points,radii,color=None):self.mesh(name,tube(points,radii),color=color)
    def body(self,color=None,size=(1.12,1.12,.96),center=(0,.82,0)):
        self.box('body',center,size,color,r=.15)
    def feet(self,color=None,count=4):
        for x in (-.32,.32):
            for z in ((-.28,.29) if count==4 else (.12,)):
                self.box('foot_'+('L' if x<0 else 'R')+('_back' if z<0 else '_front'),(x,.13,z),(.29,.26,.32),color,r=.08)   # PNG처럼 짧고 통통한 다리
    def eyes(self,y=.94,x=.235,z=.51):
        for side in (-1,1):
            self.ell('eye_white_'+str(side),(x*side,y,z),(.165,.18,.095),'F8F5FF')
            self.ell('pupil_'+str(side),(x*side-.014,y-.014,z+.085),(.083,.105,.027),'37313F')
    def smile(self,y=.62,z=.501):
        pts=[(-.11,y+.045,z),(-.07,y-.003,z+.012),(0,y-.025,z+.017),(.07,y-.003,z+.012),(.11,y+.045,z)]
        self.path('smile',pts,[.017]*5,'533541')
    def nose(self,pos=(0,.72,.56),size=(.075,.055,.047),color='4C3540'):self.ell('nose',pos,size,color)
    def muzzle(self,color='EBC0AA',y=.71):self.ell('muzzle',(0,y,.518),(.235,.15,.07),color)
    def ears(self,color=None,kind='round',inner=None):
        for side in (-1,1):
            if kind=='round':
                self.ell('ear_'+str(side),(side*.4,1.4,.01),(.17,.17,.095),color)
                if inner:self.ell('ear_inner_'+str(side),(side*.4,1.4,.09),(.102,.105,.025),inner)
            elif kind=='point':
                self.path('ear_'+str(side),[(side*.4,1.27,.03),(side*.45,1.58,.03)],[.145,.008],color)
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
def plain(p,muzzle=None,smile=True):
    p.body();p.feet();p.eyes()
    if muzzle:p.muzzle(muzzle);p.nose((0,.76,.6))
    if smile:p.smile()
    return p
def pet_models():
    pets=[]
    p=make('bee','꿀벌','F9C532');p.body();p.feet('363044');p.eyes();p.smile()
    p.box('black_band',(0,.82,-.12),(1.133,1.13,.25),'363044',.08)
    for s in (-1,1):
        p.ell('wing_'+str(s),(s*.25,1.55,-.08),(.22,.39,.05),'DBD5F5',quat((0,0,1),s*-.55))
        p.path('antenna_'+str(s),[(s*.18,1.35,.24),(s*.2,1.53,.25),(s*.27,1.61,.23)],[.04,.04,.055],'363044')
    pets.append(p)
    p=plain(make('rabbit','토끼','C97A57'),'EDC9BB');
    for s in (-1,1):
        rot=quat((0,0,1),-s*.16);p.box('ear_'+str(s),(s*.3,1.68,0),(.46,.8,.16),r=.2,rot=rot)   # PNG: 넓고 끝이 둥근 귀
        p.box('ear_inner_'+str(s),(s*.3,1.68,.085),(.27,.58,.025),'EFA27F',.12,rot)
    p.nose((0,.76,.63),(.072,.055,.04),'E58B9E');p.ell('tail',(0,.63,-.58),(.18,.18,.18),'F7E8DF');pets.append(p)
    p=plain(make('caterpillar','애벌레','259E7B'))
    p.box('yellow_back',(0,1.26,-.12),(1.14,.26,.8),'F6C941',.12)
    for s in (-1,1):
        p.ell('antenna_'+str(s),(s*.25,1.44,.22),(.085,.19,.08))
        for z in (-.35,0,.35):p.ell('side_foot',(s*.51,.15,z),(.12,.11,.12))
    pets.append(p)
    p=make('chick','병아리','F8C232');p.body();p.feet('EC8B31',2);p.eyes()
    p.ell('beak',(0,.71,.59),(.15,.095,.115),'ED8A2D')
    for s in (-1,1):p.ell('wing_'+str(s),(s*.62,.8,.02),(.2,.16,.3),rot=quat((0,0,1),s*.3))   # PNG: 옆으로 펼친 둥근 날개
    for dz in (-.1,.1):p.box('crest',(0,1.43,dz),(.2,.22,.17),r=.08)   # 두 갈래 볏
    pets.append(p)
    p=make('cow','소','E8E5F1');p.body();p.feet('DCAABB');p.eyes()
    p.muzzle('E9B0BA',.69)
    for s in (-1,1):
        p.ell('nostril_'+str(s),(s*.095,.7,.588),(.025,.04,.012),'8D5667')
        p.path('horn_'+str(s),[(s*.26,1.34,-.04),(s*.3,1.58,-.02)],[.10,.012],'CFA178')
        p.ell('ear_'+str(s),(s*.57,1.21,.02),(.19,.105,.085));p.ell('ear_inner_'+str(s),(s*.59,1.21,.088),(.11,.06,.02),'D7A0AE')
    for pos,size in [((.565,.88,-.15),(.012,.21,.17)),((.565,1.18,.21),(.012,.13,.12)),((-.565,.77,-.05),(.012,.19,.19)),((.25,1.386,-.18),(.16,.008,.12))]:p.ell('spot',pos,size,'484353')
    pets.append(p)
    p=make('fish','물고기','F39534');p.body(size=(1.02,.92,.66),center=(0,.72,0));p.eyes(.83,.21,.365);p.smile(.52,.35)
    p.box('white_band',(0,.72,-.07),(1.035,.93,.20),'F6F0EF',.12)
    for z in (-.195,.05):p.box('black_band',(0,.72,z),(1.04,.935,.035),'3B3542',.014)
    for s in (-1,1):p.ell('side_fin',(s*.57,.65,.04),(.16,.12,.045))
    p.ell('dorsal',(0,1.25,-.06),(.06,.22,.2),'3B3542')
    p.ell('tail',(0,.72,-.56),(.34,.3,.095));pets.append(p)
    p=make('penguin','펭귄','49455F');p.body();p.feet('EC9236',2)
    p.box('face_belly',(0,.74,.486),(.77,.93,.045),'DBD7EB',.14);p.eyes(.96,.2,.54)
    p.ell('beak',(0,.73,.64),(.105,.08,.105),'EC9236')
    for s in (-1,1):p.ell('flipper',(s*.61,.73,0),(.18,.11,.30),rot=quat((0,0,1),-s*.2))
    pets.append(p)
    p=make('pig','돼지','D984B5');p.body();p.feet();p.eyes();p.smile(.53)
    p.ell('snout',(0,.72,.57),(.21,.15,.095),'E39AC3')
    for s in (-1,1):p.ell('nostril',(s*.075,.73,.66),(.025,.044,.012),'7D496B')
    for s in (-1,1):p.ell('floppy_ear',(s*.36,1.33,.20),(.19,.065,.18),rot=quat((0,0,1),s*.2))
    points=[(.35+math.cos(t)*.10,.78+math.sin(t)*.10,-.58-.04*t) for t in [i*TAU/15 for i in range(19)]];p.path('curly_tail',points,[.035]*len(points));pets.append(p)
    p=plain(make('beaver','비버','B77550'),'C59975');p.ears()
    for s in (-1,1):p.box('tooth',(s*.062,.55,.59),(.11,.17,.035),'F4ECE2',.025)
    p.ell('paddle_tail',(0,1.05,-.63),(.28,.49,.07),'81543E',quat((1,0,0),-.18));pets.append(p)
    p=make('crab','게','E95A35');p.body(size=(1.12,.92,.96),center=(0,.68,0));p.eyes(.76,.23,.53);p.smile(.5,.5)   # PNG: 거의 정육면체 몸
    for s in (-1,1):
        for i,z in enumerate((-.3,0,.30)):
            p.path('leg_'+str(s)+'_'+str(i),[(s*.5,.42,z),(s*.66,.3,z+.03),(s*.7,.12,z+.05)],[.085,.075,.05],'D9452B')   # 짧고 굵은 옆다리
        # 집게: 몸 위 앞쪽 모서리에 붙은 큰 집게 (PNG)
        p.ell('claw_base',(s*.5,1.16,.3),(.2,.18,.15),'D9452B')
        for dx in (-.1,.1):p.ell('claw_finger',(s*.5+dx,1.33,.3),(.08,.15,.09),'D9452B',quat((0,0,1),dx*2.5))
    pets.append(p)
    p=make('boar','멧돼지','B86843');p.body();p.feet();p.eyes();p.ears();p.muzzle('C47A55',.70)   # PNG: 둥근 귀
    for s in (-1,1):
        p.ell('nostril',(s*.08,.72,.585),(.025,.04,.012),'694735')
        p.path('tusk',[(s*.21,.61,.52),(s*.30,.68,.58),(s*.31,.78,.59)],[.065,.045,.005],'EFE1BD')
    for z in (-.36,-.14,.08):p.box('bristle_ridge',(0,1.42,z),(.5,.22,.2),'94502F',.09)   # 등을 따라 큰 갈기
    pets.append(p)
    p=plain(make('koala','코알라','8E88AA'),'BCB4D1')
    for s in (-1,1):
        p.ell('ear',(s*.6,1.26,.0),(.33,.33,.13));p.ell('ear_inner',(s*.6,1.26,.12),(.2,.2,.026),'B9B1CF')   # PNG: 위 모서리의 큰 둥근 귀
    p.nose((0,.82,.65),(.12,.18,.07),'51485E');pets.append(p)
    p=make('monkey','원숭이','C47648');p.body();p.feet()
    for s in (-1,1):p.ell('ear_'+str(s),(s*.6,.95,0),(.12,.25,.25));p.ell('ear_inner_'+str(s),(s*.67,.95,0),(.03,.16,.16),'EFA98A')   # PNG: 옆쪽 가운데의 큰 귀
    p.box('face_mask',(0,.86,.49),(.84,.83,.06),'DCB493',.18);p.eyes(.98,.22,.55);p.muzzle('E4BC9C');p.nose((0,.74,.61),color='805A4C');p.smile(.61,.59)
    p.path('curled_tail',[(.12,.58,-.48),(.18,1.03,-.64),(.21,1.52,-.59),(.37,1.66,-.48),(.50,1.56,-.4),(.43,1.43,-.39)],[.055]*6);pets.append(p)
    p=make('parrot','앵무새','E45936');p.body();p.feet('E9983C',2);p.eyes()
    p.path('beak',[(0,.75,.54),(0,.76,.7),(0,.63,.75)],[.12,.095,.01],'59516B')
    for s in (-1,1):p.ell('wing',(s*.6,.78,0),(.14,.3,.3),'6A64D8',quat((0,0,1),s*.35))   # PNG: 옆으로 뻗은 파란 날개
    for dx in (-.11,.11):p.ell('tail_feather',(dx,1.3,-.52),(.1,.32,.11),'6A64D8',quat((1,0,0),-.75))   # 뒤쪽 위로 뻗은 꼬리깃 두 개
    pets.append(p)
    p=plain(make('deer','사슴','C38B66'),'E2BBA0');p.ears(kind='point')
    for s in (-1,1):
        p.path('antler',[(s*.26,1.36,-.03),(s*.32,1.61,-.02),(s*.42,1.83,0)],[.055,.05,.025],'81563C')
        p.path('antler_branch',[(s*.33,1.62,-.02),(s*.17,1.75,0)],[.04,.022],'81563C')
    pets.append(p)
    p=make('elephant','코끼리','B2ACD7');p.body();p.feet();p.eyes(.97,.22,.51)
    for s in (-1,1):
        p.ell('ear',(s*.62,.91,-.01),(.26,.38,.11),'A49BCB')
        p.path('tusk',[(s*.2,.70,.49),(s*.25,.64,.70),(s*.22,.74,.79)],[.06,.045,.005],'F5E8D3')
    p.path('trunk',[(0,.80,.54),(0,.62,.70),(0,.36,.82),(0,.31,1.0),(0,.40,1.08)],[.12,.115,.10,.09,.075]);pets.append(p)
    p=plain(make('giraffe','기린','EFC445'),'D9A16E');p.ears(inner='DFA775')
    for s in (-1,1):
        p.path('ossicone',[(s*.22,1.35,0),(s*.25,1.63,.0)],[.055,.05]);p.ell('ossicone_tip',(s*.25,1.64,0),(.09,.075,.08),'B47B52')
    for x,y,sz in [(-.36,1.15,.08),(.34,1.17,.09),(0,1.25,.1)]:p.ell('face_spot',(x,y,.489),(sz,sz,.009),'B78051')
    for y,z,sz in [(.7,-.2,.16),(1.1,.18,.11),(1.2,-.26,.1)]:p.ell('side_spot',(.563,y,z),(.009,sz,sz),'B78051')
    pets.append(p)
    p=plain(make('polarbear','북극곰','DCD5F3'),'EFEAFB');p.ears(inner='C8BEEA');pets.append(p)   # PNG: 연보라 톤
    p=make('lion','사자','E3B13F');p.body();p.feet();p.ears()
    p.box('mane',(0,.87,.29),(1.24,1.26,.52),'C85F35',.22)
    p.box('face',(0,.86,.58),(.92,.95,.11),'E8B13F',.16);p.eyes(.99,.21,.66);p.ell('muzzle',(0,.71,.65),(.235,.15,.07),'EAD0A6');p.nose((0,.75,.73));p.smile(.60,.73)
    p.path('tail',[(0,.55,-.5),(0,1.1,-.68),(0,1.49,-.65)],[.045]*3);p.ell('tail_tuft',(0,1.5,-.65),(.12,.14,.10),'AE7148');pets.append(p)
    p=plain(make('tiger','호랑이','E9A13B'),'F0E2CE');p.ears(inner='F0CE9E')
    for s in (-1,1):
        for y in (.66,1.13):p.box('cheek_stripe',(s*.43,y,.491),(.16,.065,.022),'49424D',.025,quat((0,0,1),s*.2))
    for z in (-.27,.0,.27):
        p.box('top_stripe',(0,1.386,z),(1.00,.018,.085),'49424D',.008)
        for s in (-1,1):p.box('side_stripe',(s*.563,1.08,z),(.018,.47,.085),'49424D',.008)
    p.path('tail',[(0,.6,-.49),(0,1.07,-.69),(.0,1.58,-.62)],[.065]*3);p.ell('tail_tip',(0,1.59,-.62),(.08,.1,.075),'ECE2D5');pets.append(p)
    return pets

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    items=[p.export() for p in pet_models()]
    for x in items:print(x['id'],x['parts'],'parts',x['triangles'],'triangles',round(x['bytes']/1024),'KB')
