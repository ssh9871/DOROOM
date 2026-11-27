import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { Kit } from './petRoomDecor';
import { boulder, mix, noise, paint, rockColor, softPuff } from './petSanctuary';
import { pondDistance } from './petPond';
import { BRIDGE, BRIDGES, POND, POOL, STREAM, terrainHeight as H } from './petRoomMap';

// 폭포 아래 소 → 연못으로 흐르는 물길.
//  - 바닥: 가운데는 깊은 청록, 가장자리는 얕은 물풀빛, 그 밖은 젖은 흙이 풀밭으로 번져 사라집니다.
//  - 수면: 물결 무늬가 아래로 흘러가고, 그 위에 더 빠르게 반짝이는 잔물결이 한 겹 더 흐릅니다.
//  - 폭이 굽이마다 조금씩 넓어졌다 좁아지고, 연못에 닿으며 넓게 퍼져 연못 물에 섞입니다.
//  - 물길 가운데 몇 군데 돌이 솟아 있고, 그 앞에 흰 물거품이 일렁입니다.
type RGB = [number, number, number];
const hex = (h: string): RGB => { const c = Color3.FromHexString(h); return [c.r, c.g, c.b]; };

// 물길 중심선: 소 안쪽에서 시작해 연못 안쪽까지 살짝 더 들어갑니다.
const LINE: [number, number][] = (() => {
  const [ex, ez] = STREAM[STREAM.length - 1]!, [px, pz] = STREAM[STREAM.length - 2]!;
  const d = Math.hypot(ex - px, ez - pz);
  const raw: [number, number][] = [[POOL.x, POOL.z - .3], ...STREAM, [ex + (ex - px) / d * .6, ez + (ez - pz) / d * .6], [ex + (ex - px) / d * 1.2, ez + (ez - pz) / d * 1.2]];
  // 약 0.2m 간격으로 촘촘히 나눕니다(성긴 면에서는 투명도가 직선으로 이어져 이음매가 보입니다).
  const fine: [number, number][] = [raw[0]!];
  for (let i = 1; i < raw.length; i++) {
    const [ax, az] = raw[i - 1]!, [bx, bz] = raw[i]!, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / .2));
    for (let k = 1; k <= n; k++) fine.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return fine;
})();
const LENGTH = LINE.reduce((sum, p, i) => i ? sum + Math.hypot(p[0] - LINE[i - 1]![0], p[1] - LINE[i - 1]![1]) : 0, 0);

// 물 폭(반폭): 굽이마다 조금씩 달라지고 연못에 닿는 끝에서 넓게 퍼집니다.
const halfWidth = (s: number, i: number) => {
  const end = Math.max(0, (s - (LENGTH - 1.6)) / 1.6);
  return .48 + noise(s * .6, 3, i * .02) * .08 + end * end * .22;
};

// 중심선을 따라 가로로 여러 줄의 꼭짓점을 둔 띠 메시. across는 -1(왼쪽 끝)~1(오른쪽 끝)에서 반폭의 몇 배까지 펼칠지.
function band(scene: Scene, name: string, reach: number, lift: number, cols: number, vScale: number,
  color: (across: number, along: number, x: number, z: number) => [number, number, number, number]) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  let s = 0;
  LINE.forEach(([x, z], i) => {
    if (i) s += Math.hypot(x - LINE[i - 1]![0], z - LINE[i - 1]![1]);
    const next = LINE[Math.min(i + 1, LINE.length - 1)]!, prev = LINE[Math.max(i - 1, 0)]!;
    const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
    const sx = (next[1] - prev[1]) / len, sz = -(next[0] - prev[0]) / len;
    const hw = halfWidth(s, i);
    for (let k = 0; k <= cols; k++) {
      const across = (k / cols * 2 - 1) * reach, px = x + sx * across * hw, pz = z + sz * across * hw;
      // 연못 안쪽에서는 연못 물 높이를 넘지 않게 합니다.
      const ground = Math.hypot(px - POND.x, pz - POND.z) < POND.r ? H(POND.x, POND.z) : H(px, pz);
      positions.push(px, ground + lift, pz);
      colors.push(...color(across, s, px, pz));
      uvs.push(k / cols, s / vScale);
    }
  });
  const row = cols + 1;
  for (let i = 0; i < LINE.length - 1; i++) for (let k = 0; k < cols; k++) {
    const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  if (normals[1]! < 0) { for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2]!, indices[k + 1]!]; VertexData.ComputeNormals(positions, indices, normals); }
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals, colors, uvs });
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

// 흐르는 물결 무늬(세로 = 흐르는 방향). 위아래가 이어지도록 그립니다.
function flowTexture(scene: Scene, name: string, rand: () => number, draw: (ctx: CanvasRenderingContext2D, line: (x: number, y: number, len: number) => void) => void) {
  const texture = new DynamicTexture(name, { width: 128, height: 256 }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const line = (x: number, y: number, len: number) => {
    for (const dy of [0, -256, 256]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy);
      ctx.bezierCurveTo(x + (rand() - .5) * 10, y + dy + len * .35, x + (rand() - .5) * 10, y + dy + len * .65, x + (rand() - .5) * 6, y + dy + len);
      ctx.stroke();
    }
  };
  draw(ctx, line);
  texture.update();
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

// 폭포 아래 소: 가운데가 깊은 바닥, 가장자리로 갈수록 투명해지는 수면, 물이 떨어지는 곳에서 퍼져 나가는 물결 고리.
// 물길이 나가는 남쪽 가장자리는 수면을 풀어 물길 수면과 자연스럽게 겹칩니다.
function buildPool(kit: Kit) {
  const { scene, rand } = kit;
  const y0 = H(POOL.x, POOL.z), r = POOL.r + .15;
  const disc = (name: string, lift: number, color: (t: number, a: number) => [number, number, number, number]) => {
    const seg = 64, rings = 8, positions: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i < seg; i++) {
      const t = j / rings, a = i / seg * Math.PI * 2, rr = r * t * (1 + Math.sin(a * 3 + 1) * .05);
      positions.push(POOL.x + Math.cos(a) * rr, y0 + lift, POOL.z + Math.sin(a) * rr);
      colors.push(...color(t, a));
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * seg + i, b = j * seg + (i + 1) % seg;
      indices.push(a, b, a + seg, b, b + seg, a + seg);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    if (normals[seg * 3 + 1]! < 0) { for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2]!, indices[k + 1]!]; VertexData.ComputeNormals(positions, indices, normals); }
    const data = new VertexData();
    Object.assign(data, { positions, indices, normals, colors });
    const mesh = new Mesh(name, scene);
    data.applyToMesh(mesh);
    mesh.hasVertexAlpha = true;
    mesh.isPickable = false;
    const material = new StandardMaterial(name, scene);
    material.specularColor = Color3.Black();
    mesh.material = material;
    return { mesh, material };
  };
  // 남쪽(물길이 나가는 쪽, -z)일수록 1
  const outlet = (a: number) => Math.max(0, Math.min(1, (-Math.sin(a) - .55) / .35));
  const DEEP = hex('#1F5470'), EDGE = hex('#6FA48A');
  disc('pool-bed', .03, (t, a) => [...mix(DEEP, EDGE, Math.pow(t, 1.6) * (1 - outlet(a) * .6)), Math.min(1, (1 - t) / .25 + outlet(a))]);
  const surface = disc('pool-surface', .09, (t, a) => [...mix(hex('#3F86B5'), hex('#8CCBE0'), t * t), .7 * Math.min(1, (1 - t) / .3) * (1 - outlet(a) * Math.max(0, (t - .4) / .6))]);
  surface.material.specularColor = new Color3(.5, .55, .6);
  surface.material.specularPower = 40;
  surface.material.emissiveColor = new Color3(.1, .14, .18);

  // 물결 고리: 물이 떨어지는 곳(소의 북쪽)에서 생겨 퍼지며 옅어집니다.
  const ringTexture = new DynamicTexture('pool-ripple', { width: 128, height: 128 }, scene, false);
  ringTexture.hasAlpha = true;
  const ctx = ringTexture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 40, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.6, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  ringTexture.update();
  const ringMaterial = new StandardMaterial('pool-ripple', scene);
  ringMaterial.diffuseColor = Color3.Black();
  ringMaterial.emissiveColor = Color3.FromHexString('#EAF6FB');
  ringMaterial.opacityTexture = ringTexture;
  ringMaterial.disableLighting = true;
  const cx = POOL.x, cz = POOL.z + .4;
  const ripples = Array.from({ length: 4 }, (_, i) => {
    const mesh = MeshBuilder.CreateGround('pool-ripple', { width: 1, height: 1 }, scene);
    mesh.position.set(cx + (rand() - .5) * .3, y0 + .1, cz);
    mesh.material = ringMaterial;
    mesh.isPickable = false;
    return { mesh, phase: i / 4 };
  });
  // 소 위에 낮게 떠도는 물안개
  const puff = softPuff(scene);
  const mists = Array.from({ length: 5 }, () => {
    const mesh = MeshBuilder.CreatePlane('pool-mist', { size: 1 }, scene);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.material = puff;
    mesh.isPickable = false;
    return { mesh, x: cx + (rand() - .5) * 1.2, z: cz - rand() * .6, size: .5 + rand() * .4, phase: rand() * 10 };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const p of ripples) {
      const life = (t * .45 + p.phase) % 1, size = .3 + life * 1.5;
      p.mesh.scaling.set(size, 1, size * .9);
      p.mesh.visibility = (1 - life) * .55;
    }
    for (const m of mists) {
      m.mesh.position.set(m.x + Math.sin(t * .3 + m.phase) * .15, y0 + .3 + Math.sin(t * .5 + m.phase) * .08, m.z);
      m.mesh.scaling.setAll(m.size);
      m.mesh.visibility = .3 + Math.sin(t * .7 + m.phase) * .1;
    }
  });
}

export function buildStream(kit: Kit) {
  buildPool(kit);
  const { scene, rand, merge } = kit;
  // 시작(소 안쪽)은 서서히 나타나고, 끝은 연못 물가를 지나며 사라집니다(d: 물가까지 거리, 연못 안쪽이 음수).
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const fadeIn = (s: number) => clamp01(s / .8);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const intoPond = (x: number, z: number, from: number, to: number) => clamp01((pondDistance(x, z) - to) / (from - to));

  // 바닥과 물가: 물 폭의 두 배까지 펼쳐, 바깥쪽은 젖은 흙 → 풀빛으로 번집니다.
  const DEEP = hex('#2A6A86'), SHALLOW = hex('#6FA48A'), WET = hex('#6E6450'), SAND = hex('#A89A78'), GRASS = hex('#86C46E');
  // 높이는 연못 물가(.02)·연못 바닥(.025)과 겹쳐 깜빡이지 않게 조금 더 띄웁니다.
  const bed = band(scene, 'stream-bed', 1.6, .045, 12, 1, (across, s, x, z) => {
    const d = Math.abs(across), n = noise(x * 2.1, 5, z * 2.1) * .18;
    let c: RGB;
    if (d < 1) c = mix(DEEP, SHALLOW, Math.pow(d, 1.8) + n);
    else if (d < 1.2) c = mix(WET, SAND, (d - 1) / .2 + n);
    else c = mix(SAND, GRASS, (d - 1.2) / .4 + n);
    // 바깥 가장자리는 풀밭에 녹아들고, 연못 안으로 들어가면 연못 바닥에 맡깁니다.
    const edge = clamp01((1.6 - d) / .5) * (d > 1 ? .85 : 1);
    return [...c, edge * clamp01(fadeIn(s) * 2) * intoPond(x, z, .15, -.7)];
  });
  bed.hasVertexAlpha = true;
  const bedMaterial = new StandardMaterial('stream-bed', scene);
  bedMaterial.specularColor = Color3.Black();
  bed.material = bedMaterial;
  bed.receiveShadows = true;

  // 수면 1: 푸른 물빛 위에 길쭉한 밝은 물결이 천천히 흘러갑니다.
  const flow = flowTexture(scene, 'stream-flow', rand, (ctx, line) => {
    ctx.fillStyle = '#6FB2D6'; ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = rand() > .35 ? `rgba(225,245,255,${.18 + rand() * .3})` : `rgba(40,100,140,${.15 + rand() * .2})`;
      ctx.lineWidth = 1.5 + rand() * 3.5;
      line(8 + rand() * 112, rand() * 256, 30 + rand() * 70);
    }
  });
  const surface = band(scene, 'stream-surface', 1, .07, 8, 2.4, (across, s, x, z) =>
    [1, 1, 1, Math.max(0, (.82 - Math.pow(Math.abs(across), 3) * .55) * fadeIn(s) * smooth(intoPond(x, z, .35, -1)))]);
  surface.hasVertexAlpha = true;
  const surfaceMaterial = new StandardMaterial('stream-surface', scene);
  surfaceMaterial.diffuseTexture = flow;
  surfaceMaterial.emissiveColor = new Color3(.12, .16, .2);
  surfaceMaterial.specularColor = new Color3(.5, .55, .6);
  surfaceMaterial.specularPower = 40;
  surface.material = surfaceMaterial;

  // 수면 2: 더 빠르게 흐르는 가는 반짝임(흰 줄만 보이고 나머지는 투명)
  const sparkle = flowTexture(scene, 'stream-sparkle', rand, (ctx, line) => {
    ctx.clearRect(0, 0, 128, 256);
    for (let i = 0; i < 34; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${.5 + rand() * .5})`;
      ctx.lineWidth = 1 + rand() * 1.5;
      line(14 + rand() * 100, rand() * 256, 10 + rand() * 26);
    }
  });
  sparkle.hasAlpha = true;
  const glints = band(scene, 'stream-glints', .85, .085, 6, 1.6, (_across, s, x, z) => [1, 1, 1, fadeIn(s) * smooth(intoPond(x, z, .5, -.3))]);
  glints.hasVertexAlpha = true;
  const glintMaterial = new StandardMaterial('stream-glints', scene);
  glintMaterial.diffuseTexture = sparkle;
  glintMaterial.useAlphaFromDiffuseTexture = true;
  glintMaterial.emissiveColor = new Color3(.75, .85, .9);
  glintMaterial.disableLighting = true;
  glints.material = glintMaterial;

  // 물길 가운데 솟은 돌과 그 앞(하류 쪽)에서 일렁이는 물거품. 다리 아래는 피합니다.
  const stones: Mesh[] = [];
  const foamMaterial = new StandardMaterial('stream-foam', scene);
  foamMaterial.diffuseColor = Color3.White();
  foamMaterial.emissiveColor = new Color3(.8, .88, .92);
  foamMaterial.alpha = .45;
  const foams: { mesh: Mesh; phase: number }[] = [];
  for (const i of [8, 15, 23, 29]) {
    const [x, z] = STREAM[i]!, [nx, nz] = STREAM[i + 1]!;
    if (BRIDGES.some(b => Math.hypot(x - b.x, z - b.z) < BRIDGE.length / 2 + .6)) continue;
    const off = (rand() - .5) * .35, len = Math.hypot(nx - x, nz - z), dx = (nx - x) / len, dz = (nz - z) / len;
    const sx = x + dz * off, sz = z - dx * off, size = .26 + rand() * .14;
    const stone = boulder(kit, size, .55);
    stone.position.set(sx, H(sx, sz) + .05, sz);
    stones.push(stone);
    for (let k = 0; k < 2; k++) {
      const foam = MeshBuilder.CreateDisc('stream-foam', { radius: .06 + rand() * .04, tessellation: 12 }, scene);
      foam.rotation.x = Math.PI / 2;
      foam.scaling.y = 1.8;
      foam.rotation.y = Math.atan2(dx, dz);
      const fx = sx + dx * (size * .55 + k * .12) + dz * (k - .5) * .14, fz = sz + dz * (size * .55 + k * .12) - dx * (k - .5) * .14;
      foam.position.set(fx, H(fx, fz) + .085, fz);
      foam.material = foamMaterial;
      foam.isPickable = false;
      foams.push({ mesh: foam, phase: rand() * 10 });
    }
  }
  paint(merge('stream-stones', stones, '#FFFFFF', false), rockColor(H, .6));

  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    // vOffset을 줄이면 무늬가 v가 커지는 쪽(하류)으로 흘러갑니다.
    flow.vOffset = -((t * .32) % 1);
    sparkle.vOffset = -((t * .75) % 1);
    for (const f of foams) {
      const k = 1 + Math.sin(t * 5 + f.phase) * .18;
      f.mesh.scaling.set(k, 1.8 * k, 1);
    }
  });
}
