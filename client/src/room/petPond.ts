import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { Kit } from './petRoomDecor';
import { boulder, mix, noise, paint, rockColor, shade } from './petSanctuary';
import { POND, STREAM, onPath, terrainHeight as H } from './petRoomMap';

// 아래층 연못: 손으로 판 듯한 고르지 않은 물가, 가운데로 갈수록 깊어지는 물빛, 젖은 흙 물가,
// 무리 지어 놓인 크고 작은 각진 바위(사이사이 비어 풀과 부들이 자람), 크기가 제각각인 연잎과 수련,
// 수면에 천천히 흐르는 잔물결, 물속을 헤엄치는 비단잉어 세 마리.
// 충돌은 petRoomMap의 POND 원(반지름 r)이 맡고, 물가 모양은 그 원 안쪽에서만 들쭉날쭉합니다.
const { x: CX, z: CZ, r: R } = POND;
const Y = H(CX, CZ);
// 물길이 연못으로 들어오는 방향(이쪽 물가는 바위 없이 비웁니다)
const [inX, inZ] = STREAM[STREAM.length - 1]!;
const INLET = Math.atan2(inZ - CZ, inX - CX);
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 물가 반지름: 낮은 주파수 굴곡 몇 개를 겹치고, 가장 넓은 곳이 충돌 원에 살짝 걸치도록 맞춥니다.
const rawEdge = (a: number) => 1 + Math.sin(a * 2 + 1.1) * .07 + Math.sin(a * 3 + .4) * .05 + Math.sin(a * 5 + 2.3) * .025;
const EDGE_MAX = Math.max(...Array.from({ length: 360 }, (_, i) => rawEdge(i / 360 * Math.PI * 2)));
export const pondEdge = (a: number) => rawEdge(a) / EDGE_MAX * (R + .05);
// 물가까지의 거리(물 안쪽이면 음수). 물길이 연못에 스며드는 경계를 맞출 때 씁니다.
export const pondDistance = (x: number, z: number) => Math.hypot(x - CX, z - CZ) - pondEdge(Math.atan2(z - CZ, x - CX));
// 물길 입구 쪽일수록 1(입구 좌우 약 30°에서 0으로)
const inletness = (x: number, z: number) => Math.max(0, Math.min(1, (.55 - angleGap(Math.atan2(z, x), INLET)) / .3));

type RGB = [number, number, number];
const hex = (h: string): RGB => { const c = Color3.FromHexString(h); return [c.r, c.g, c.b]; };

// 물가 모양을 따르는 고리 메시. t는 안쪽(0)~바깥(1) 비율, 색은 꼭짓점마다 정합니다.
function ring(scene: Scene, name: string, inner: (a: number) => number, outer: (a: number) => number, y: number, rings: number,
  color: (t: number, x: number, z: number) => RGB | [number, number, number, number], alpha = 1, uvScale = 0) {
  const seg = 144, positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, r = inner(a) + (outer(a) - inner(a)) * t;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      positions.push(x, 0, z);
      const c = color(t, x, z);
      colors.push(c[0], c[1], c[2], (c[3] ?? 1) * alpha);
      uvs.push(x * uvScale, z * uvScale);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * seg + i, b = j * seg + (i + 1) % seg, c = a + seg, d = b + seg;
    indices.push(a, b, c, b, d, c);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  // 감는 방향과 상관없이 윗면이 위를 보도록 맞춥니다.
  if (normals[1]! < 0) { for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2]!, indices[k + 1]!]; VertexData.ComputeNormals(positions, indices, normals); }
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals, colors, uvs });
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.hasVertexAlpha = colors.some((v, i) => i % 4 === 3 && v < 1);
  mesh.position.set(CX, y, CZ);
  mesh.isPickable = false;
  return mesh;
}

export function buildPond(kit: Kit) {
  const { scene, rand } = kit;
  const plain = (name: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.White();
    m.specularColor = Color3.Black();
    return m;
  };

  // 물가 띠: 물에 닿은 곳은 젖은 흙, 바깥으로 갈수록 풀빛에 섞여 사라집니다.
  const WET = hex('#6E6450'), SAND = hex('#A89A78'), GRASS = hex('#86C46E');
  const shore = ring(scene, 'pond-shore', a => pondEdge(a) - .15, a => pondEdge(a) + .5 + noise(Math.cos(a) * 3, 0, Math.sin(a) * 3) * .12, Y + .02, 3, (t, x, z) => {
    const n = noise(x * 2.3, 1, z * 2.3);
    const c = t < .4 ? mix(WET, SAND, t / .4 + n * .3) : mix(SAND, GRASS, (t - .4) / .6 + n * .25);
    // 물길 입구에서는 물길의 물가 띠가 이어받으므로 비웁니다.
    return [...c, 1 - inletness(x, z)];
  });
  shore.material = plain('pond-shore');
  shore.receiveShadows = true;

  // 물 바닥: 가장자리는 얕은 모래·물풀 빛, 가운데는 깊은 청록
  const SHALLOW = hex('#6FA48A'), DEEP = hex('#1E4F6E');
  // 물길이 들어오는 곳은 물길 가운데처럼 깊은 물빛이 연못 안까지 이어집니다.
  const bed = ring(scene, 'pond-bed', () => 0, pondEdge, Y + .025, 10, (t, x, z) =>
    shade(mix(DEEP, SHALLOW, Math.pow(t, 2.2) * (1 - inletness(x, z) * .75) + noise(x * 1.7, 2, z * 1.7) * .12), 1));
  bed.material = plain('pond-bed');
  bed.receiveShadows = true;

  // 수면: 반투명 하늘빛(가장자리는 더 투명), 잔물결 무늬가 천천히 흐릅니다.
  // 물길 입구 가장자리는 투명하게 풀어 물길 수면과 끊김 없이 겹치게 합니다.
  // 입구 쪽 가장자리는 물길 물빛과 같은 색으로, 투명도는 부드러운 곡선으로 풀어 줍니다.
  const surface = ring(scene, 'pond-surface', () => 0, pondEdge, Y + .1, 14, (t, x, z) => {
    const k = inletness(x, z), fade = Math.max(0, Math.min(1, (t - .55) / .45));
    const color = mix(mix(hex('#3F86B5'), hex('#9AD3E3'), t * t), hex('#5E9FC6'), k);
    return [...color, 1 - k * fade * fade * (3 - 2 * fade)];
  }, 1, .35);
  const ripples = new DynamicTexture('pond-ripples', { width: 256, height: 256 }, scene, true);
  const ctx = ripples.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 256, 256);
  // 흰 바탕 위에 투명도를 그려 넣습니다: 바탕은 거의 투명, 잔물결 곡선만 밝게.
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = alphaCanvas.height = 256;
  const a2 = alphaCanvas.getContext('2d')!;
  a2.fillStyle = 'rgba(0,0,0,.5)'; a2.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = rand() * 256, y = rand() * 256, w = 14 + rand() * 30;
    a2.strokeStyle = `rgba(0,0,0,${.75 + rand() * .25})`; a2.lineWidth = 1.5 + rand() * 1.5;
    for (const dx of [0, -256, 256]) for (const dy of [0, -256, 256]) {
      a2.beginPath(); a2.moveTo(x + dx - w, y + dy); a2.quadraticCurveTo(x + dx, y + dy - 4 - rand() * 3, x + dx + w, y + dy); a2.stroke();
    }
  }
  const pixels = ctx.getImageData(0, 0, 256, 256), mask = a2.getImageData(0, 0, 256, 256);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = mask.data[i]!;
  ctx.putImageData(pixels, 0, 0);
  ripples.hasAlpha = true;
  ripples.update();
  ripples.wrapU = ripples.wrapV = Texture.WRAP_ADDRESSMODE;
  const water = new StandardMaterial('pond-surface', scene);
  water.diffuseColor = Color3.White();
  water.opacityTexture = ripples;
  water.emissiveColor = new Color3(.12, .16, .2);
  water.specularColor = new Color3(.55, .6, .65);
  water.specularPower = 48;
  water.alpha = .62;
  surface.material = water;

  // 바위: 큰 바위 하나에 작은 돌 몇 개가 기대는 무리를 물가를 따라 띄엄띄엄 놓습니다. 무리 사이는 비워 둡니다.
  const rocks: Mesh[] = [], gaps: number[] = [];
  let a = rand() * .5;
  while (a < Math.PI * 2 - .2) {
    if (angleGap(a, INLET) < .45) { a += .25; continue; }
    if (rand() < .3) { gaps.push(a); a += .35 + rand() * .3; continue; }
    const big = .55 + rand() * .45, count = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < count; k++) {
      const size = k === 0 ? big : big * (.35 + rand() * .3);
      const ang = a + (k === 0 ? 0 : (rand() - .5) * .28), out = pondEdge(ang) + (k === 0 ? .1 : (rand() - .3) * .5);
      const rock = boulder(kit, size, .5 + rand() * .2);
      const x = CX + Math.cos(ang) * out, z = CZ + Math.sin(ang) * out;
      rock.position.set(x, Y + size * .1, z);
      rocks.push(rock);
    }
    a += big * .32 + .12 + rand() * .2;
  }
  // 물가 흙 위에 흩어진 조약돌
  for (let i = 0; i < 26; i++) {
    const ang = rand() * Math.PI * 2;
    if (angleGap(ang, INLET) < .35) continue;
    const out = pondEdge(ang) + .15 + rand() * .4, size = .1 + rand() * .12;
    const pebble = boulder(kit, size, .55);
    pebble.position.set(CX + Math.cos(ang) * out, Y + .02, CZ + Math.sin(ang) * out);
    rocks.push(pebble);
  }
  paint(kit.merge('pond-rocks', rocks, '#FFFFFF'), rockColor(H, .45));

  // 비워 둔 물가에는 부들과 붓꽃이 자랍니다(길 위는 피함).
  const blades: Mesh[] = [], heads: Mesh[] = [], irises: Mesh[] = [];
  for (const g of [...gaps, INLET + .6, INLET - .65]) {
    const bx = CX + Math.cos(g) * (pondEdge(g) + .05), bz = CZ + Math.sin(g) * (pondEdge(g) + .05);
    if (onPath(bx, bz, .3)) continue;
    for (let k = 0; k < 9; k++) {
      const h = .5 + rand() * .55, x = bx + (rand() - .5) * .5, z = bz + (rand() - .5) * .5;
      const blade = MeshBuilder.CreateCylinder('reed', { diameterTop: 0, diameterBottom: .05, height: h, tessellation: 3 }, scene);
      blade.position.set(x, Y + h / 2, z);
      blade.rotation.set((rand() - .5) * .35, rand() * 3, (rand() - .5) * .35);
      blades.push(blade);
      if (k < 3) {
        const head = MeshBuilder.CreateCylinder('cattail', { diameter: .06, height: .16, tessellation: 6 }, scene);
        head.position.set(x, Y + h + .02, z);
        heads.push(head);
      } else if (k > 6) {
        const iris = MeshBuilder.CreateCylinder('iris', { diameterTop: .15, diameterBottom: .02, height: .1, tessellation: 3 }, scene);
        iris.position.set(x, Y + h * .7, z);
        iris.rotation.y = rand() * 3;
        irises.push(iris);
      }
    }
  }
  kit.merge('pond-reeds', blades, '#4E8A43', false);
  kit.merge('pond-cattails', heads, '#7A5134', false);
  kit.merge('pond-irises', irises, '#8D7BE3', false);

  // 연잎: 작은 무리로 모여 떠 있고, 크기·각도·색이 제각각. 몇 장에는 수련이 핍니다.
  const pads: Mesh[] = [], petals: Mesh[] = [], hearts: Mesh[] = [];
  for (const [ca, cr] of [[INLET + 2.3, .55], [INLET - 1.9, .7], [INLET + .9, .62]] as const) {
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const ang = ca + (rand() - .5) * .5, dist = pondEdge(ang) * (cr + (rand() - .5) * .18);
      const x = CX + Math.cos(ang) * dist, z = CZ + Math.sin(ang) * dist, size = .16 + rand() * .2;
      const pad = MeshBuilder.CreateDisc('lily-pad', { radius: size, tessellation: 20, arc: .9 + rand() * .06 }, scene);
      pad.rotation.x = Math.PI / 2;
      pad.rotation.y = rand() * Math.PI * 2;
      pad.position.set(x, Y + .105 + k * .002, z);
      pads.push(pad);
      if (rand() < .4) {
        for (let p = 0; p < 6; p++) {
          const petal = MeshBuilder.CreateSphere('lily-petal', { diameter: .1, segments: 4 }, scene);
          petal.scaling.set(.55, .35, 1);
          const pa = p / 6 * Math.PI * 2;
          petal.rotation.set(-.5, pa, 0);
          petal.position.set(x + Math.sin(pa) * .045, Y + .14, z + Math.cos(pa) * .045);
          petals.push(petal);
        }
        const heart = MeshBuilder.CreateSphere('lily-heart', { diameter: .05, segments: 4 }, scene);
        heart.position.set(x, Y + .16, z);
        hearts.push(heart);
      }
    }
  }
  paint(kit.merge('lily-pads', pads, '#FFFFFF', false), (x, _y, z) => shade(mix(hex('#3F8A3E'), hex('#7DBA5A'), .5 + noise(x * 4, 0, z * 4)), 1), false);
  kit.merge('lily-petals', petals, '#F6C3D8', false, .15);
  kit.merge('lily-hearts', hearts, '#F4D35E', false, .3);

  // 비단잉어: 물속에서 저마다 다른 원을 그리며 헤엄치고 꼬리를 흔듭니다.
  const koi = [
    { body: '#F7F1E8', spot: '#E8572A', radius: 1.5, speed: .32, phase: 0 },
    { body: '#EE7A2E', spot: '#F7F1E8', radius: 2.05, speed: -.22, phase: 2 },
    { body: '#E9C04A', spot: '#E9C04A', radius: 1.05, speed: .4, phase: 4.2 },
  ].map(spec => {
    const node = new TransformNode('koi', scene);
    const body = MeshBuilder.CreateSphere('koi-body', { diameter: .2, segments: 10 }, scene);
    body.scaling.set(.75, .3, 2.1);
    body.material = kit.mat(spec.body);
    body.parent = node;
    const spot = MeshBuilder.CreateSphere('koi-spot', { diameter: .12, segments: 6 }, scene);
    spot.scaling.set(.9, .3, 1.4);
    spot.position.set(.01, .03, .06);
    spot.material = kit.mat(spec.spot);
    spot.parent = node;
    const tail = MeshBuilder.CreateDisc('koi-tail', { radius: .11, tessellation: 3, sideOrientation: Mesh.DOUBLESIDE }, scene);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -.25;
    tail.material = kit.mat(spec.body);
    const tailPivot = new TransformNode('koi-tail-pivot', scene);
    tailPivot.parent = node;
    tailPivot.position.z = -.18;
    tail.parent = tailPivot;
    tail.position.z = -.08;
    for (const m of [body, spot, tail]) m.isPickable = false;
    node.position.y = Y + .065;
    return { node, tailPivot, ...spec };
  });

  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    ripples.uOffset = (t * .012) % 1;
    ripples.vOffset = (t * .007) % 1;
    for (const f of koi) {
      const ang = f.phase + t * f.speed, r = f.radius + Math.sin(t * .27 + f.phase) * .35;
      f.node.position.x = CX + Math.cos(ang) * r;
      f.node.position.z = CZ + Math.sin(ang) * r;
      // 원의 접선 방향을 바라봅니다(도는 방향에 따라 반대).
      const dir = Math.sign(f.speed);
      f.node.rotation.y = Math.atan2(-Math.sin(ang) * dir, Math.cos(ang) * dir) + Math.sin(t * 2 + f.phase) * .08;
      f.tailPivot.rotation.y = Math.sin(t * 7 + f.phase) * .45;
    }
  });
}
