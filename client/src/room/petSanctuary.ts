import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Kit } from './petRoomDecor';
import {
  CASCADE, CASCADE_ROCKS, POOL, CAIRNS, FAR_PEAKS, LANTERNS, MOSS_ROCKS, PEAKS, PINES, RAMPS, SANCTUARY_AREAS, SHRINE, SPIRIT_GATE, STELE, STREAM, onPath, petWorld,
  terrainHeight as H,
} from './petRoomMap';

// 성역으로 오르는 왼쪽 경사로(홍살문과 같은 x)
export const SPIRIT_RAMP = RAMPS.findIndex(r => r.x === SPIRIT_GATE.x);

// 영산(靈山) 성역: 1단 테라스 왼쪽을 안개 낀 산신령의 산으로 꾸밉니다. 레전더리 펫이 노는 곳입니다.
//  - 경사로 돌계단 → 홍살문 → 박석 돌길 → 석등 한 쌍 → 산신각
//  - 굽은 소나무, 돌탑, 이끼 낀 바위, 뒤쪽 바위 봉우리와 울타리 밖 먼 산
//  - 땅에 낮게 깔려 흐르는 안개와 봉우리를 감싼 구름띠, 천천히 떠다니는 영기(빛 구슬)
const ROCK = '#8C958F';
const RED = '#B8452F';
const CREAM = '#EFE4CC';
const SLATE = '#4D5866';
const JADE = '#3E8E7E';
const LAMP = '#FFD98C';

export function buildSanctuary(kit: Kit) {
  buildPeaks(kit);
  buildSpiritStairs(kit);
  buildShrineWalk(kit);
  buildMeadow(kit);
  buildCascade(kit);
  buildSpiritGate(kit);
  buildShrine(kit);
  buildPines(kit);
  buildStones(kit);
  buildLanterns(kit);
  buildMist(kit);
}

// 색칠 도우미: 합친 메시를 면마다 평평하게 나눈 뒤(각진 바위·잎 느낌), 면의 위치·기울기로 꼭짓점 색을 칠합니다.
// 재질은 흰색이고 실제 색은 꼭짓점 색이 정합니다.
export type Paint = (x: number, y: number, z: number, ny: number) => [number, number, number];
export function paint(mesh: Mesh | null, color: Paint, flat = true) {
  if (!mesh) return mesh;
  if (flat) mesh.convertToFlatShadedMesh();
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!, nor = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const colors = new Float32Array(pos.length / 3 * 4);
  const step = flat ? 3 : 1;
  for (let v = 0; v < pos.length / 3; v += step) {
    // 평평한 면은 세 꼭짓점의 가운데로 한 색을 정합니다.
    let x = 0, y = 0, z = 0, ny = 0;
    for (let k = 0; k < step; k++) { x += pos[(v + k) * 3]!; y += pos[(v + k) * 3 + 1]!; z += pos[(v + k) * 3 + 2]!; ny += nor[(v + k) * 3 + 1]!; }
    const [r, g, b] = color(x / step, y / step, z / step, ny / step);
    for (let k = 0; k < step; k++) colors.set([r, g, b, 1], (v + k) * 4);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}
// 부드러운 값 잡음(-1~1)
export const noise = (x: number, y: number, z: number) =>
  (Math.sin(x * 1.7 + Math.sin(z * 1.3)) * Math.cos(z * 1.9 + y * .7) + Math.sin(y * 2.3 + x * .9) * .5 + Math.sin((x + z) * 4.1) * .25) / 1.75;
export const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + (b[i]! - v) * Math.max(0, Math.min(1, t))) as [number, number, number];
export const shade = (c: [number, number, number], k: number) => c.map(v => Math.max(0, Math.min(1, v * k))) as [number, number, number];

// 바위 색: 회색 바탕에 얼룩, 아래쪽은 어둡게, 위를 향한 면에는 이끼, 군데군데 연한 지의류
const STONE_GRAY = [.56, .58, .56], STONE_WARM = [.6, .56, .5], STONE_LOW = [.36, .38, .37];
const MOSS_DARK = [.25, .4, .22], MOSS_LIGHT = [.42, .58, .3], LICHEN = [.78, .77, .64];
export const rockColor = (ground: (x: number, z: number) => number, mossiness: number): Paint => (x, y, z, ny) => {
  const n = noise(x * 1.3, y * 1.3, z * 1.3), fine = noise(x * 5.1, y * 4.3, z * 5.7);
  let c = mix(STONE_GRAY, STONE_WARM, .5 + n * .8);
  c = mix(STONE_LOW, c, (y - ground(x, z)) / .6 + .2);
  if (ny > .45 - mossiness * .25 && n + fine * .5 > .1 - mossiness) c = mix(MOSS_DARK, MOSS_LIGHT, .5 + fine);
  else if (fine > .72) c = mix(c, LICHEN, .6);
  return shade(c, .92 + fine * .1);
};

// 각진 바위: 정이십면체를 잡음으로 울퉁불퉁하게 밀고 납작하게 누릅니다.
export function boulder({ scene, rand }: Kit, size: number, squash: number) {
  const rock = MeshBuilder.CreateIcoSphere('boulder', { radius: size / 2, subdivisions: 2, flat: false, updatable: true }, scene);
  const salt = rand() * 40;
  rock.updateMeshPositions(positions => {
    for (let i = 0; i < positions.length; i += 3) {
      const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
      const k = 1 + noise(px * 3 / size + salt, py * 3 / size, pz * 3 / size - salt) * .22 + noise(px * 9 / size, py * 9 / size + salt, pz * 9 / size) * .06;
      positions[i] = px * k; positions[i + 1] = py * k * squash; positions[i + 2] = pz * k;
    }
  }, true);
  rock.rotation.y = rand() * Math.PI * 2;
  return rock;
}

// 각진 바위 봉우리: 위가 좁은 원뿔을 층층이 비틀어 바위 절벽처럼 만들고, 평평한 턱마다 이끼와 작은 소나무를 둡니다.
function rockPeak({ scene, rand }: Kit, x: number, z: number, r: number, h: number, base: number) {
  const peak = MeshBuilder.CreateCylinder('peak', { diameterTop: r * .22, diameterBottom: r * 2, height: h, tessellation: 11, subdivisions: 7, updatable: true }, scene);
  const salt = rand() * 50;
  peak.updateMeshPositions(positions => {
    for (let i = 0; i < positions.length; i += 3) {
      const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
      // 층(턱)을 만들기 위해 높이에 따라 계단처럼 안팎으로 들고 납니다.
      const ledge = Math.sin(py / h * 14 + salt) * .07;
      const k = 1 + noise(px * 1.6 / r + salt, py * 2.4 / h, pz * 1.6 / r) * .2 + ledge;
      positions[i] = px * k + Math.sin(py / h * 3 + salt) * r * .12;
      positions[i + 2] = pz * k + Math.cos(py / h * 2.3 + salt) * r * .06;
    }
  }, true);
  peak.rotation.y = rand() * Math.PI * 2;
  peak.position.set(x, base + h / 2 - .2, z);
  return peak;
}

function buildPeaks(kit: Kit) {
  const { merge, rand } = kit;
  const rocks: Mesh[] = [], far: Mesh[] = [], boulders: Mesh[] = [];
  const trunks: Mesh[] = [], crowns: Mesh[] = [];
  for (const p of PEAKS) {
    const ground = H(p.x, p.z);
    rocks.push(rockPeak(kit, p.x, p.z, p.r, p.h, ground));
    // 봉우리 발치에 굴러 떨어진 바위
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2, size = .7 + rand() * .7;
      const b = boulder(kit, size, .7);
      b.position.set(p.x + Math.cos(a) * p.r * .95, ground + size * .22, p.z + Math.sin(a) * p.r * .95);
      boulders.push(b);
    }
    // 봉우리 허리 턱에 뿌리내린 작은 소나무
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2, t = .3 + rand() * .35;
      const reach = p.r * (1 - t) * .9;
      pine(kit, p.x + Math.cos(a) * reach, ground + p.h * t, p.z + Math.sin(a) * reach, .38 + rand() * .12, trunks, crowns);
    }
  }
  for (const p of FAR_PEAKS) far.push(rockPeak(kit, p.x, p.z, p.r, p.h, H(p.x, p.z) - 1));
  paint(merge('sanctuary-peaks', rocks, '#FFFFFF'), rockColor(H, 1));
  paint(merge('sanctuary-peak-boulders', boulders, '#FFFFFF'), rockColor(H, .6));
  paint(merge('sanctuary-peak-pine-trunks', trunks, '#FFFFFF', false), barkColor);
  paint(merge('sanctuary-peak-pine-crowns', crowns, '#FFFFFF', false), needleColor);
  // 먼 산은 안개 속에 잠긴 듯 푸른 회색(위는 밝고 아래로 갈수록 안개에 묻힘)
  const farPeaks = paint(merge('far-peaks', far, '#FFFFFF', false), (x, y, z, ny) => {
    const n = noise(x * .3, y * .3, z * .3);
    const c = mix([.55, .63, .66], [.42, .52, .5], .5 + n * .6 + (ny > .5 ? .4 : 0));
    return mix([.86, .91, .93], c, y / 14);
  });
  if (farPeaks) (farPeaks.material as StandardMaterial).emissiveColor = new Color3(.18, .2, .22);
}

// 홍살문: 붉은 기둥 두 개, 위아래 가로대 사이의 붉은 살, 가운데 태극 문양
function buildSpiritGate({ scene, mat, merge, cast }: Kit) {
  const { x, z, half } = SPIRIT_GATE;
  const y = H(x, z);
  const red: Mesh[] = [];
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateCylinder('spirit-gate-post', { diameter: .32, height: 4.4, tessellation: 12 }, scene);
    post.position.set(x + side * half, y + 2.2, z);
    red.push(post);
    const foot = MeshBuilder.CreateCylinder('spirit-gate-foot', { diameter: .55, height: .35, tessellation: 8 }, scene);
    foot.position.set(x + side * half, y + .17, z);
    foot.material = mat(ROCK);
    cast(foot);
  }
  for (const h of [3.3, 4.05]) {
    const beam = MeshBuilder.CreateBox('spirit-gate-beam', { width: half * 2 + .6, height: .16, depth: .18 }, scene);
    beam.position.set(x, y + h, z);
    red.push(beam);
  }
  for (let i = 1; i < 12; i++) {
    const bx = x - half + i * half * 2 / 12;
    const rod = MeshBuilder.CreateBox('spirit-gate-arrow', { width: .05, height: 1.1, depth: .05 }, scene);
    rod.position.set(bx, y + 3.85, z);
    red.push(rod);
    const tip = MeshBuilder.CreateCylinder('spirit-gate-tip', { diameterTop: 0, diameterBottom: .1, height: .18, tessellation: 4 }, scene);
    tip.position.set(bx, y + 4.47, z);
    red.push(tip);
  }
  merge('spirit-gate', red, RED);
  // 가운데 태극 문양(앞뒤 양면)
  const texture = new DynamicTexture('taegeuk', { width: 128, height: 128 }, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#F4EBDA'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#C8323A'; ctx.beginPath(); ctx.arc(64, 64, 52, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#2A55A3'; ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#C8323A'; ctx.beginPath(); ctx.arc(90, 64, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2A55A3'; ctx.beginPath(); ctx.arc(38, 64, 26, 0, Math.PI * 2); ctx.fill();
  texture.update();
  const material = new StandardMaterial('taegeuk', scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  const emblem = MeshBuilder.CreateDisc('spirit-gate-emblem', { radius: .38, tessellation: 32 }, scene);
  emblem.position.set(x, y + 3.68, z - .1);
  emblem.material = material;
}

// 산신각: 돌 기단 위 붉은 기둥, 크림색 벽, 단청 띠, 끝이 살짝 들린 짙은 기와지붕, 현판
function buildShrine({ scene, mat, merge, cast, fitText, glow }: Kit) {
  const { x, z, hw, hd } = SHRINE;
  const y = H(x, z);
  const base = cast(MeshBuilder.CreateBox('shrine-base', { width: hw * 2 + .4, height: .45, depth: hd * 2 + .4 }, scene));
  base.position.set(x, y + .22, z);
  base.material = mat(ROCK);
  const step = cast(MeshBuilder.CreateBox('shrine-step', { width: 1.6, height: .22, depth: .5 }, scene));
  step.position.set(x, y + .11, z - hd - .4);
  step.material = mat(ROCK);
  const floor = y + .45, wallH = 2;
  const walls: Mesh[] = [], pillars: Mesh[] = [];
  const back = MeshBuilder.CreateBox('shrine-back', { width: hw * 2 - .3, height: wallH, depth: .15 }, scene);
  back.position.set(x, floor + wallH / 2, z + hd - .3);
  walls.push(back);
  for (const side of [-1, 1]) {
    const wall = MeshBuilder.CreateBox('shrine-side', { width: .15, height: wallH, depth: hd * 2 - .6 }, scene);
    wall.position.set(x + side * (hw - .3), floor + wallH / 2, z);
    walls.push(wall);
  }
  merge('shrine-walls', walls, CREAM);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pillar = MeshBuilder.CreateCylinder('shrine-pillar', { diameter: .24, height: wallH + .1, tessellation: 10 }, scene);
    pillar.position.set(x + sx * (hw - .3), floor + wallH / 2, z + sz * (hd - .3));
    pillars.push(pillar);
  }
  const lintel = MeshBuilder.CreateBox('shrine-lintel', { width: hw * 2 - .2, height: .18, depth: .2 }, scene);
  lintel.position.set(x, floor + wallH - .05, z - hd + .3);
  pillars.push(lintel);
  merge('shrine-pillars', pillars, RED);
  // 어두운 안쪽과 제단
  const inside = MeshBuilder.CreatePlane('shrine-inside', { width: hw * 2 - .6, height: wallH - .2 }, scene);
  inside.position.set(x, floor + (wallH - .2) / 2, z + hd - .39);
  inside.rotation.y = Math.PI;
  inside.material = mat('#3B2F2A');
  inside.material.backFaceCulling = false;
  const altar = cast(MeshBuilder.CreateBox('shrine-altar', { width: 1.4, height: .6, depth: .5 }, scene));
  altar.position.set(x, floor + .3, z + hd - .7);
  altar.material = mat('#6E4B36');
  const candle = MeshBuilder.CreateSphere('shrine-candle', { diameter: .14, segments: 8 }, scene);
  candle.position.set(x, floor + .72, z + hd - .7);
  candle.material = mat(LAMP, 1);
  glow.addIncludedOnlyMesh(candle);
  // 단청 띠와 지붕
  const band = MeshBuilder.CreateBox('shrine-dancheong', { width: hw * 2 + .1, height: .22, depth: hd * 2 + .1 }, scene);
  band.position.set(x, floor + wallH + .1, z);
  band.material = mat(JADE);
  const roofY = floor + wallH + .2;
  const roof = cast(MeshBuilder.CreateCylinder('shrine-roof', { diameterTop: .3, diameterBottom: 1, height: 1.3, tessellation: 4 }, scene));
  roof.rotation.y = Math.PI / 4;
  roof.scaling.set((hw * 2 + 1.6) / Math.SQRT2, 1, (hd * 2 + 1.4) / Math.SQRT2);
  roof.position.set(x, roofY + .65, z);
  roof.material = mat(SLATE);
  const ridge = MeshBuilder.CreateBox('shrine-ridge', { width: hw * 1.1, height: .16, depth: .22 }, scene);
  ridge.position.set(x, roofY + 1.35, z);
  ridge.material = mat('#3A4350');
  // 처마 네 귀퉁이가 위로 들린 추녀
  const eaves: Mesh[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tip = MeshBuilder.CreateBox('shrine-eave', { width: .14, height: .12, depth: .9 }, scene);
    tip.position.set(x + sx * (hw + .55), roofY + .2, z + sz * (hd + .5));
    tip.rotation.y = Math.atan2(sx, sz);
    tip.rotation.x = -.45;
    eaves.push(tip);
  }
  merge('shrine-eaves', eaves, SLATE, false);
  // 현판 '山神閣'
  const texture = new DynamicTexture('shrine-plaque', { width: 256, height: 96 }, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#2F3A48'; ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#D8B25A'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = '#F2D488'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fitText(ctx, '山神閣', 220, 64, 'bold');
  ctx.fillText('山神閣', 128, 50);
  texture.update();
  const plaqueMaterial = new StandardMaterial('shrine-plaque', scene);
  plaqueMaterial.diffuseTexture = texture;
  plaqueMaterial.emissiveColor = new Color3(.2, .2, .2);
  plaqueMaterial.specularColor = Color3.Black();
  const plaque = MeshBuilder.CreatePlane('shrine-plaque', { width: 1.3, height: .48 }, scene);
  plaque.position.set(x, floor + wallH + .45, z - hd - .08);
  plaque.material = plaqueMaterial;
}

// 소나무 껍질: 아래는 거칠고 어두운 회갈색, 위로 갈수록 붉은 적송 빛. 껍질 조각마다 밝기가 다릅니다.
export const barkColor: Paint = (x, y, z) => {
  const ground = H(x, z), plate = noise(x * 9, y * 3.2, z * 9);
  const c = mix([.36, .29, .25], [.72, .4, .26], (y - ground - .6) / 2.4);
  return shade(c, plate > .35 ? .72 : .95 + plate * .12);
};
// 솔잎 덩어리: 위를 향한 면은 햇빛 받은 연두, 옆은 짙은 초록, 아래는 그늘진 청록
export const needleColor: Paint = (x, y, z, ny) => {
  const n = noise(x * 4.3, y * 4.3, z * 4.3) * .06;
  const c: [number, number, number] = ny > .55 ? [.4 + n, .58 + n, .3] : ny > -.15 ? [.22 + n, .41 + n, .26] : [.12, .26 + n, .21];
  return c;
};

// 소나무 한 그루: 밑동이 퍼진 S자로 굽은 줄기, 드러난 뿌리, 옆으로 길게 뻗은 가지 끝마다 구름처럼 층진 솔잎 덩어리
export function pine({ lumpy, rand, strut, scene }: Kit, x: number, y: number, z: number, s: number, trunks: Mesh[], crowns: Mesh[]) {
  const lean = rand() * Math.PI * 2;
  const flare = MeshBuilder.CreateCylinder('pine-flare', { diameterTop: .42 * s, diameterBottom: .95 * s, height: .5 * s, tessellation: 9 }, scene);
  flare.position.set(x, y + .2 * s, z);
  trunks.push(flare);
  for (let i = 0; i < 4; i++) {
    const a = lean + i * Math.PI / 2 + rand() * .6;
    const from = new Vector3(x, y + .3 * s, z), to = new Vector3(x + Math.cos(a) * .9 * s, y - .05, z + Math.sin(a) * .9 * s);
    trunks.push(strut('pine-root', from, to, .2 * s));
  }
  let at = new Vector3(x, y + .3 * s, z);
  const joints: Vector3[] = [at];
  for (let i = 1; i <= 5; i++) {
    const bend = Math.sin(i * 1.3 + lean) * .32 * s;
    at = at.add(new Vector3(Math.cos(lean) * bend, .82 * s, Math.sin(lean) * bend));
    joints.push(at);
  }
  for (let i = 0; i < joints.length - 1; i++) {
    trunks.push(strut('pine-trunk', joints[i]!, joints[i + 1]!, (.46 - i * .065) * s));
    // 이음매가 매끄럽게 보이도록 마디마다 공을 끼웁니다.
    const knot = MeshBuilder.CreateSphere('pine-knot', { diameter: (.46 - i * .065) * s, segments: 6 }, scene);
    knot.position.copyFrom(joints[i + 1]!);
    trunks.push(knot);
  }
  // 솔잎 덩어리: 납작한 덩어리 여러 개를 원반처럼 모으고, 가운데 위에 하나 더 얹어 층을 만듭니다.
  const cloud = (c: Vector3, width: number) => {
    const count = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2 + rand() * .5, r = width * (.25 + rand() * .2);
      const pad = lumpy('pine-pad', width * (.5 + rand() * .2), .3, .42);
      pad.position.set(c.x + Math.cos(a) * r, c.y + (rand() - .5) * .12 * s, c.z + Math.sin(a) * r);
      crowns.push(pad);
    }
    const top = lumpy('pine-pad-top', width * .62, .28, .5);
    top.position.set(c.x, c.y + .2 * s, c.z);
    crowns.push(top);
  };
  cloud(joints[5]!.add(new Vector3(0, .25 * s, 0)), 1.9 * s);
  // 아래쪽 가지는 길고 위로 갈수록 짧게, 줄기 기운 반대쪽으로 더 길게 뻗습니다.
  for (let i = 0; i < 4; i++) {
    const j = joints[2 + (i % 3)]!;
    const a = lean + Math.PI + (i - 1.5) * 1.25 + (rand() - .5) * .5;
    const length = (2.1 - (i % 3) * .35 + rand() * .3) * s;
    const mid = j.add(new Vector3(Math.cos(a) * length * .5, .05 * s, Math.sin(a) * length * .5));
    const tip = j.add(new Vector3(Math.cos(a) * length, .35 * s, Math.sin(a) * length));
    trunks.push(strut('pine-branch', j, mid, .17 * s), strut('pine-branch', mid, tip, .11 * s));
    cloud(tip.add(new Vector3(0, .12 * s, 0)), (1.25 + rand() * .35) * s);
  }
  return joints;
}

function buildPines(kit: Kit) {
  const { scene, merge, mat } = kit;
  const trunks: Mesh[] = [], crowns: Mesh[] = [];
  PINES.forEach((p, i) => {
    const joints = pine(kit, p.x, H(p.x, p.z), p.z, p.s, trunks, crowns);
    // 가장 큰 소나무는 마을을 지키는 신목: 줄기에 금줄(새끼줄과 흰 종이)을 두릅니다.
    if (i === 0) {
      const at = joints[1]!.add(joints[2]!).scale(.5);
      const rope = MeshBuilder.CreateTorus('sacred-rope', { diameter: .52 * p.s, thickness: .07 * p.s, tessellation: 24 }, scene);
      rope.position.copyFrom(at);
      rope.material = mat('#C9A86A');
      const papers: Mesh[] = [];
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        const paper = MeshBuilder.CreatePlane('sacred-paper', { width: .08 * p.s, height: .26 * p.s, sideOrientation: Mesh.DOUBLESIDE }, scene);
        paper.position.set(at.x + Math.cos(a) * .27 * p.s, at.y - .15 * p.s, at.z + Math.sin(a) * .27 * p.s);
        paper.rotation.y = -a + Math.PI / 2;
        papers.push(paper);
      }
      merge('sacred-papers', papers, '#FAF8F2', false);
    }
  });
  paint(merge('sanctuary-pine-trunks', trunks, '#FFFFFF'), barkColor);
  paint(merge('sanctuary-pine-crowns', crowns, '#FFFFFF'), needleColor);
}

// 돌탑(납작한 돌을 어긋나게 쌓음), 이끼 낀 바위 무리
function buildStones(kit: Kit) {
  const { scene, merge, rand } = kit;
  const cairns: Mesh[] = [], rocks: Mesh[] = [];
  for (const c of CAIRNS) {
    let y = H(c.x, c.z);
    const count = 7;
    for (let i = 0; i < count; i++) {
      const size = (1.15 - i * .13) * c.s;
      const stone = boulder(kit, size, .38);
      const thick = size * .38;
      stone.position.set(c.x + (rand() - .5) * .1 * c.s, y + thick * .42, c.z + (rand() - .5) * .1 * c.s);
      stone.rotation.z = (rand() - .5) * .12;
      cairns.push(stone);
      y += thick * .78;
    }
    // 꼭대기의 작고 둥근 돌
    const cap = boulder(kit, .26 * c.s, .8);
    cap.position.set(c.x, y + .08 * c.s, c.z);
    cairns.push(cap);
    // 돌탑 둘레의 작은 돌
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2, size = .2 + rand() * .2;
      const pebble = boulder(kit, size, .6);
      pebble.position.set(c.x + Math.cos(a) * .75 * c.s, H(c.x, c.z) + size * .2, c.z + Math.sin(a) * .75 * c.s);
      cairns.push(pebble);
    }
  }
  // 바위 무리: 큰 바위 하나에 작은 바위 둘셋이 기대어 있습니다.
  for (const r of MOSS_ROCKS) {
    const ground = H(r.x, r.z);
    const main = boulder(kit, r.r * 2.2, .72);
    main.position.set(r.x, ground + r.r * .55, r.z);
    rocks.push(main);
    for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
      const a = rand() * Math.PI * 2, size = r.r * (.6 + rand() * .5);
      const side = boulder(kit, size, .65);
      side.position.set(r.x + Math.cos(a) * r.r * 1.05, ground + size * .22, r.z + Math.sin(a) * r.r * 1.05);
      rocks.push(side);
    }
  }
  paint(merge('sanctuary-cairns', cairns, '#FFFFFF'), rockColor(H, .15));
  paint(merge('sanctuary-rocks', rocks, '#FFFFFF'), rockColor(H, .8));
}

// 성역으로 오르는 왼쪽 경사로의 돌계단: 반듯하게 다듬은 밝은 화강암 디딤돌.
// 분홍 보도는 계단 아래와 위에서 끊겼다가 이어지고, 걷는 높이(경사면)는 그대로입니다.
function buildSpiritStairs(kit: Kit) {
  const { scene, merge } = kit;
  const ramp = RAMPS[SPIRIT_RAMP]!;
  const steps: Mesh[] = [], cheeks: Mesh[] = [];
  const count = 10, depth = (ramp.z1 - ramp.z0) / count, rise = (ramp.h1 - ramp.h0) / count;
  for (let i = 0; i < count; i++) {
    const zf = ramp.z0 + i * depth, back = ramp.h0 + rise * (i + 1);
    // 윗면은 그 칸의 가장 높은 경사면보다 살짝 위(풀이 뚫고 나오지 않게)
    const top = back + .015, bottom = back - rise - .3;
    const step = MeshBuilder.CreateBox('spirit-step', { width: ramp.hw * 2 + .1, height: top - bottom, depth: depth + .02 }, scene);
    step.position.set(ramp.x, (top + bottom) / 2, zf + depth / 2);
    steps.push(step);
  }
  // 소맷돌: 계단 양옆을 따라 비스듬히 오르는 넓적한 돌 난간. 아래 끝에는 네모난 받침돌.
  const run = ramp.z1 - ramp.z0, climb = ramp.h1 - ramp.h0, length = Math.hypot(run, climb) + .3, slope = Math.atan2(climb, run);
  for (const side of [-1, 1]) {
    const x = ramp.x + side * (ramp.hw + .2);
    const cheek = MeshBuilder.CreateBox('spirit-cheek', { width: .4, height: .7, depth: length }, scene);
    cheek.rotation.x = -slope;
    cheek.position.set(x, (ramp.h0 + ramp.h1) / 2 + .05, (ramp.z0 + ramp.z1) / 2);
    cheeks.push(cheek);
    const post = MeshBuilder.CreateBox('spirit-cheek-post', { width: .5, height: .75, depth: .5 }, scene);
    post.position.set(x, .3, ramp.z0 - .15);
    const cap = MeshBuilder.CreateBox('spirit-cheek-cap', { width: .58, height: .1, depth: .58 }, scene);
    cap.position.set(x, .72, ramp.z0 - .15);
    cheeks.push(post, cap);
  }
  // 디딤판은 밝게, 챌판(앞면)은 한 톤 어둡게 해서 계단 단이 또렷하게 보입니다.
  paint(merge('spirit-steps', steps, '#FFFFFF'), (_x, _y, _z, ny) => ny > .5 ? [.84, .82, .78] : [.66, .65, .62]);
  paint(merge('spirit-cheeks', cheeks, '#FFFFFF'), (x, y, z, ny) => shade(ny > .5 ? [.78, .77, .73] : [.62, .62, .59], .96 + noise(x * 4, y * 4, z * 4) * .05));
}

// 박석 돌길 무늬: 길 방향으로 줄을 쌓고, 줄마다 높이가, 줄 안에서는 돌 너비가 제각각입니다. 돌 사이는 어두운 줄눈.
// 한 장 = 너비(2.2~2.4m) × 길이 약 4.8m. alongU가 참이면 길 방향을 텍스처 가로(u)에 둡니다(길 띠 ribbon용).
export function stoneWalkTexture(scene: Scene, alongU: boolean) {
  const across = 256, along = 512;
  const texture = new DynamicTexture('stone-walk', alongU ? { width: along, height: across } : { width: across, height: along }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  // 가로세로를 바꿔 그리면 같은 그림이 길 방향만 돌아갑니다.
  if (alongU) ctx.setTransform(0, 1, 1, 0, 0, 0);
  let seed = 11;
  const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  ctx.fillStyle = '#8F8A80'; ctx.fillRect(0, 0, across, along);
  for (let top = 0; top < along;) {
    // 마지막 줄은 무늬가 이어 붙도록 남은 높이에 맞춥니다.
    let rowH = 46 + rand() * 34;
    if (along - top - rowH < 40) rowH = along - top;
    for (let left = 0; left < across;) {
      let w = 58 + rand() * 62;
      if (across - left - w < 40) w = across - left;
      const tone = Math.round((rand() - .5) * 26);
      ctx.fillStyle = `rgb(${186 + tone},${181 + tone},${170 + tone})`;
      ctx.beginPath(); ctx.roundRect(left + 2.5, top + 2.5, w - 5, rowH - 5, 7); ctx.fill();
      // 돌 표면의 잔무늬
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(60,55,50,.07)';
        ctx.fillRect(left + 4 + rand() * (w - 10), top + 4 + rand() * (rowH - 10), 2 + rand() * 4, 2 + rand() * 4);
      }
      left += w;
    }
    top += rowH;
  }
  texture.update();
  // DynamicTexture는 기본이 가장자리 고정(clamp)이라, 길이에 맞춰 반복하려면 반복 모드로 바꿔야 합니다.
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

// 계단 위에서 산신각 앞까지의 돌길: 크기가 제각각인 넓적한 돌(박석)을 줄 맞춰 깔고, 양옆에 짙은 돌 테두리를 둡니다.
function buildShrineWalk({ scene, merge }: Kit) {
  const ramp = RAMPS[SPIRIT_RAMP]!;
  const width = 2.4, z0 = ramp.z1 - .02, z1 = SHRINE.z - SHRINE.hd - .6, length = z1 - z0;
  const y = H(SPIRIT_GATE.x, (z0 + z1) / 2);
  const texture = stoneWalkTexture(scene, false);
  const material = new StandardMaterial('shrine-walk', scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  const walk = MeshBuilder.CreateGround('shrine-walk', { width, height: length }, scene);
  walk.position.set(SPIRIT_GATE.x, y + .03, (z0 + z1) / 2);
  walk.material = material;
  walk.receiveShadows = true;
  const edges: Mesh[] = [];
  for (const side of [-1, 1]) {
    const edge = MeshBuilder.CreateBox('shrine-walk-edge', { width: .16, height: .14, depth: length }, scene);
    edge.position.set(SPIRIT_GATE.x + side * (width / 2 + .08), y + .05, (z0 + z1) / 2);
    edges.push(edge);
  }
  merge('shrine-walk-edges', edges, '#6F7672', false);
}

// 아래 풀밭: 가운데 큰 비석과 풀밭에 흩어진 도라지·흰 들꽃. 비석 둘레는 펫들이 뛰놀게 넓게 비워 둡니다.
function buildMeadow(kit: Kit) {
  const { scene, merge, rand } = kit;
  buildStele(kit);
  // 들꽃: 길·물길·장애물을 피해서
  const stems: Mesh[] = [], heads: Mesh[][] = [[], [], []];
  const area = SANCTUARY_AREAS[1];
  const free = (x: number, z: number) => !onPath(x, z, .3) && !STREAM.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 1.3)
    && Math.hypot(x - STELE.x, z - STELE.z) > 1.8
    && !petWorld.obstacles.some(o => 'r' in o ? Math.hypot(x - o.x, z - o.z) < o.r + .3 : Math.abs(x - o.x) < o.hw + .3 && Math.abs(z - o.z) < o.hd + .3);
  for (let i = 0; i < 90; i++) {
    const x = area.x0 + .8 + rand() * (area.x1 - area.x0 - 1.6), z = area.z0 + rand() * (13.2 - area.z0);
    if (!free(x, z)) continue;
    const y = H(x, z), h = .3 + rand() * .2;
    const stem = MeshBuilder.CreateCylinder('meadow-stem', { diameter: .03, height: h, tessellation: 4 }, scene);
    stem.position.set(x, y + h / 2, z);
    stems.push(stem);
    const head = MeshBuilder.CreateCylinder('meadow-flower', { diameterTop: .2, diameterBottom: .04, height: .1, tessellation: 5 }, scene);
    head.position.set(x, y + h + .03, z);
    heads[i % 5 < 3 ? 0 : i % 5 === 3 ? 1 : 2]!.push(head);
  }
  merge('meadow-stems', stems, '#4F8A47', false);
  ['#8D7BE3', '#F6F4FF', '#F3B8D4'].forEach((hex, i) => merge(`meadow-flowers-${i}`, heads[i]!, hex, false));
}

// 폭포: 테라스 위 큰 바위 틈에서 솟은 물이 비탈을 세 번 꺾여 떨어지며 아래 소로 흘러듭니다.
// 단마다 물이 고였다 넘치고(평평한 물 → 수직으로 떨어지는 물), 떨어지는 곳마다 물보라가 일어납니다.
function buildCascade(kit: Kit) {
  const { scene, merge, rand } = kit;
  const x = CASCADE.x;
  // 단: 각 단은 윗끝의 땅 높이에 맞춘 평평한 물, 아랫끝에서 다음 단으로 떨어집니다.
  const drops = [15.4, 14.3, 13.3];
  const level = (z: number) => H(x, z) + .08;
  const top = CASCADE.z1 + .1, bottom = POOL.z + .55;
  const profile: { z: number; y: number }[] = [{ z: top, y: level(drops[0]!) }, { z: drops[0]!, y: level(drops[0]!) }];
  // 단 끝에서 물이 앞으로 살짝 휘어 나가며 떨어집니다(첫 단은 물이 솟는 곳이라 낙차 없음).
  for (let i = 1; i < drops.length; i++) {
    const z = drops[i]!, upper = level(drops[i - 1]!), lower = level(z), fall = upper - lower;
    profile.push({ z, y: upper }, { z: z - .14, y: upper - fall * .12 }, { z: z - .24, y: upper - fall * .45 }, { z: z - .29, y: lower + fall * .1 }, { z: z - .3, y: lower });
  }
  profile.push({ z: bottom, y: .1 });
  // 물줄기 띠: 위에서 아래로 갈수록 조금 넓어집니다.
  const width = (z: number) => .5 + (top - z) * .05;
  const left = profile.map(p => new Vector3(x - width(p.z), p.y, p.z)), right = profile.map(p => new Vector3(x + width(p.z), p.y, p.z));
  const texture = new DynamicTexture('cascade', { width: 256, height: 64 }, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#6FB6DE'; ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(240,250,255,${.25 + rand() * .45})`; ctx.fillRect(rand() * 256, rand() * 64, 18 + rand() * 50, 1.5 + rand() * 2.5); }
  texture.update();
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 3;
  const material = new StandardMaterial('cascade', scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(.22, .28, .33);
  material.specularColor = new Color3(.3, .3, .3);
  material.backFaceCulling = false;
  const water = MeshBuilder.CreateRibbon('cascade', { pathArray: [left, right] }, scene);
  water.material = material;
  // 단마다 물을 받치는 바위 턱(물 아래와 옆으로 살짝 보임)
  const ledges: Mesh[] = [];
  // 턱의 앞면은 떨어지는 물 바로 뒤에 둡니다(앞에 두면 물줄기를 가립니다).
  for (let i = 0; i < drops.length - 1; i++) {
    const z0 = drops[i + 1]! + .02, z1 = drops[i]! - .3, y = level(drops[i]!) - .03, ground = H(x, z0) - .2;
    const ledge = MeshBuilder.CreateBox('cascade-ledge', { width: width(z0) * 2 + .5, height: y - ground, depth: z1 - z0 }, scene);
    ledge.position.set(x, (y + ground) / 2, (z0 + z1) / 2);
    ledges.push(ledge);
  }
  // 양옆과 물이 솟는 곳 뒤의 바위
  for (const r of CASCADE_ROCKS) {
    const rock = boulder(kit, r.size, .85);
    rock.position.set(r.x, H(r.x, r.z) + r.size * .3, r.z);
    ledges.push(rock);
  }
  paint(merge('cascade-rocks', ledges, '#FFFFFF'), rockColor(H, .7));
  // 물보라: 떨어지는 곳마다 가장자리가 흐린 작은 물안개 덩어리가 제각각 피어올랐다 흩어집니다.
  // 마지막(소로 떨어지는 곳)이 가장 크고 많습니다.
  const puff = softPuff(scene);
  const foams: { mesh: Mesh; x: number; y: number; z: number; size: number; phase: number; speed: number }[] = [];
  const landings = [...drops.slice(1).map(z => ({ z: z - .38, y: level(z) })), { z: bottom - .05, y: .12 }];
  landings.forEach((l, li) => {
    const count = li === landings.length - 1 ? 9 : 6;
    for (let k = 0; k < count; k++) {
      const size = .22 + rand() * .3 + (li === landings.length - 1 ? .1 : 0);
      const mesh = MeshBuilder.CreatePlane('cascade-foam', { size: 1 }, scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.material = puff;
      mesh.isPickable = false;
      foams.push({ mesh, x: x + (rand() - .5) * width(l.z) * 1.8, y: l.y + .05, z: l.z + (rand() - .5) * .25, size, phase: rand(), speed: .35 + rand() * .3 });
    }
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    texture.uOffset = -((t * .9) % 1);
    // 덩어리마다 주기적으로 피어올라(커지며 위로) 옅어진 뒤 다시 시작합니다.
    for (const f of foams) {
      const life = (t * f.speed + f.phase) % 1, k = f.size * (.6 + life * .8);
      f.mesh.position.set(f.x, f.y + life * .25, f.z);
      f.mesh.scaling.set(k, k * .8, k);
      f.mesh.visibility = Math.sin(life * Math.PI) * .85;
    }
  });
}

// 가장자리가 흐린 흰 덩어리(물보라·물안개). 카메라를 향해 세운 판에 씁니다.
const puffMaterials = new WeakMap<Scene, StandardMaterial>();
export function softPuff(scene: Scene) {
  let material = puffMaterials.get(scene);
  if (material) return material;
  const texture = new DynamicTexture('soft-puff', { width: 64, height: 64 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  texture.update();
  material = new StandardMaterial('soft-puff', scene);
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.FromHexString('#F2F8FB');
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  puffMaterials.set(scene, material);
  return material;
}

// 운치 있는 대리석 아치 다리 재질: 흰 바탕에 회색 결, 은은한 광택
export function marbleMaterial(scene: Scene) {
  const texture = new DynamicTexture('marble', { width: 256, height: 256 }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  let seed = 5;
  const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  ctx.fillStyle = '#F1EFEA'; ctx.fillRect(0, 0, 256, 256);
  for (const [width, alpha] of [[10, .06], [2.4, .2], [1, .28]] as const) {
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(120,120,128,${alpha})`; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(rand() * 256, -10);
      ctx.bezierCurveTo(rand() * 256, 80, rand() * 256, 170, rand() * 256, 266);
      ctx.stroke();
    }
  }
  texture.update();
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const material = new StandardMaterial('marble', scene);
  material.diffuseTexture = texture;
  material.specularColor = new Color3(.3, .3, .3);
  material.specularPower = 40;
  return material;
}

// 큰 비석: 사람 키의 세 배가 넘는(약 6m) 거대한 자연석 선돌을 땅에 바로 세우고, 앞면을 평평하게 갈아 한자를 세로로 새겼습니다.
// 너무 커서 플레이어가 뒤에 서면 가리므로, 가리는 동안에는 반투명해집니다.
function buildStele(kit: Kit) {
  const { scene, merge, rand } = kit;
  const { x, z } = STELE, ground = H(x, z);
  const height = 6.2, face = .4;
  // 위아래 폭이 거의 같은 길쭉한 돌. 꼭대기는 한쪽으로 비스듬히 둥글고, 옆면은 울퉁불퉁합니다.
  const stone = MeshBuilder.CreateCylinder('stele-stone', { diameterTop: 1.75, diameterBottom: 2.15, height, tessellation: 14, subdivisions: 10, updatable: true }, scene);
  const salt = rand() * 30;
  stone.updateMeshPositions(positions => {
    for (let i = 0; i < positions.length; i += 3) {
      const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
      const t = py / height + .5;
      const k = 1 + noise(px * 1.3 + salt, py * .7, pz * 1.3) * .1;
      // 꼭대기: 왼쪽은 높고 오른쪽으로 갈수록 둥글게 내려앉습니다.
      const shoulder = t > .85 ? (t - .85) / .15 : 0;
      const drop = shoulder * (Math.max(0, px) * .9 + px * px * .5);
      // 땅에 묻힌 아래쪽은 살짝 넓게
      const flare = t < .08 ? 1 + (.08 - t) * 2 : 1;
      positions[i] = px * k * flare;
      positions[i + 1] = py - drop;
      positions[i + 2] = Math.max(-face, pz * k * flare * .56);
    }
  }, true);
  stone.position.set(x, ground + height / 2 - .15, z);
  const merged = paint(merge('stele-stone', [stone], '#FFFFFF'), (px, py, pz) => {
    const n = noise(px * 1.6, py * .9, pz * 1.6), fine = noise(px * 7, py * 7, pz * 7);
    // 어두운 회색 바탕에 빗물 자국처럼 세로로 흐르는 얼룩, 아래쪽은 흙빛으로 어둡게
    let c = mix([.44, .45, .43], [.58, .58, .55], .5 + n * .7 + Math.sin(px * 6 + py * .4) * .1);
    c = mix([.34, .33, .3], c, (py - ground) / 1.2);
    return shade(fine > .72 ? mix(c, [.68, .68, .62], .45) : c, .94 + fine * .06);
  });
  const stoneMaterial = new StandardMaterial('stele-stone', scene);
  stoneMaterial.specularColor = Color3.Black();
  stoneMaterial.needDepthPrePass = true;
  if (merged) merged.material = stoneMaterial;
  // 새긴 글씨: 투명 바탕에 세로쓰기 네 줄(오른쪽에서 왼쪽으로), 줄마다 시작 높이가 조금씩 다릅니다.
  const texture = new DynamicTexture('stele-text', { width: 256, height: 768 }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 768);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 50px serif';
  ['靈山聖域守護', '天地神明感應', '萬物和合', '守護靈獸安寧'].forEach((line, column) => {
    const cx = 212 - column * 56, top = 60 + (column % 2) * 30 + (column === 2 ? 60 : 0);
    [...line].forEach((ch, i) => {
      // 밝은 테두리를 살짝 아래에 깔아 돌에 판 글씨처럼 보이게
      ctx.fillStyle = 'rgba(200,201,195,.8)'; ctx.fillText(ch, cx + 2, top + i * 108 + 2);
      ctx.fillStyle = '#1F2321'; ctx.fillText(ch, cx, top + i * 108);
    });
  });
  texture.update();
  const textMaterial = new StandardMaterial('stele-text', scene);
  textMaterial.diffuseTexture = texture;
  textMaterial.specularColor = Color3.Black();
  const text = MeshBuilder.CreatePlane('stele-text', { width: 1.05, height: 3.15 }, scene);
  text.position.set(x - .1, ground + 2.9, z - face - .012);
  text.material = textMaterial;
  // 카메라와 플레이어 사이를 가리면 반투명하게
  scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera as (typeof scene.activeCamera & { getTarget?: () => Vector3 }) | null;
    if (!camera?.getTarget) return;
    const eye = camera.position, target = camera.getTarget();
    let hidden = false;
    for (let i = 1; i < 16 && !hidden; i++) {
      const p = Vector3.Lerp(eye, target, i / 16);
      hidden = Math.abs(p.x - x) < 1.2 && Math.abs(p.z - z) < .7 && p.y < ground + height;
    }
    const k = Math.min(1, scene.getEngine().getDeltaTime() / 1000 * 5);
    for (const m of [stoneMaterial, textMaterial]) {
      m.alpha += ((hidden ? .3 : 1) - m.alpha) * k;
      if (Math.abs(m.alpha - 1) < .01) m.alpha = 1;
    }
  });
}

// 석등: 받침돌, 기둥, 빛이 새어 나오는 화사석, 지붕돌
function buildLanterns({ scene, mat, merge, glow }: Kit) {
  const stone: Mesh[] = [];
  for (const l of LANTERNS) {
    const y = H(l.x, l.z);
    const parts: [number, number, number, number][] = [[.7, .8, .2, .1], [.22, .26, .8, .6], [.55, .45, .14, 1.07]];
    for (const [top, bottom, height, at] of parts) {
      const part = MeshBuilder.CreateCylinder('lantern-stone', { diameterTop: top, diameterBottom: bottom, height, tessellation: 8 }, scene);
      part.position.set(l.x, y + at, l.z);
      stone.push(part);
    }
    const light = MeshBuilder.CreateBox('lantern-light', { size: .34 }, scene);
    light.position.set(l.x, y + 1.33, l.z);
    light.material = mat(LAMP, 1);
    glow.addIncludedOnlyMesh(light);
    const roof = MeshBuilder.CreateCylinder('lantern-roof', { diameterTop: .08, diameterBottom: .9, height: .36, tessellation: 8 }, scene);
    roof.position.set(l.x, y + 1.68, l.z);
    stone.push(roof);
    const knob = MeshBuilder.CreateSphere('lantern-knob', { diameter: .14, segments: 6 }, scene);
    knob.position.set(l.x, y + 1.9, l.z);
    stone.push(knob);
  }
  merge('sanctuary-lanterns', stone, ROCK);
}

// 안개: 가장자리가 흐린 흰 판을 땅 가까이 여러 겹 깔아 천천히 흐르게 하고, 봉우리 허리에는 구름띠를 두릅니다.
// 빛 구슬(영기)이 천천히 떠다닙니다.
function buildMist({ scene, rand, glow }: Kit) {
  const pointIn = (area: (typeof SANCTUARY_AREAS)[number], margin: number) =>
    ({ x: area.x0 + margin + rand() * (area.x1 - area.x0 - margin * 2), z: area.z0 + rand() * (area.z1 - area.z0) });
  const texture = new DynamicTexture('mist', { width: 128, height: 128 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.55, 'rgba(255,255,255,.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  texture.update();
  const material = (alpha: number) => {
    const m = new StandardMaterial(`mist-${alpha}`, scene);
    m.diffuseColor = Color3.Black();
    m.emissiveColor = Color3.FromHexString('#EEF3F5');
    m.opacityTexture = texture;
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.alpha = alpha;
    return m;
  };
  const low = material(.5), high = material(.6);
  type Drift = { mesh: Mesh; x: number; z: number; y: number; phase: number; speed: number; reach: number };
  const drifts: Drift[] = [];
  const add = (mesh: Mesh, x: number, y: number, z: number, reach: number) => {
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    drifts.push({ mesh, x, z, y, phase: rand() * 10, speed: .08 + rand() * .1, reach });
  };
  // 성역 바닥에 낮게 깔린 안개
  for (let i = 0; i < 30; i++) {
    const { x, z } = pointIn(SANCTUARY_AREAS[i % 2]!, 1);
    const size = 5 + rand() * 4;
    const sheet = MeshBuilder.CreatePlane('mist-low', { size }, scene);
    sheet.rotation.x = Math.PI / 2;
    sheet.material = low;
    add(sheet, x, H(x, z) + .25 + rand() * .7, z, 1.2);
  }
  // 봉우리 허리와 먼 산의 구름띠(카메라를 향해 세운 판)
  for (const p of [...PEAKS, ...FAR_PEAKS]) {
    const count = p.r > 5 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const w = p.r * (2.4 + rand()), h = w * .32;
      const puff = MeshBuilder.CreatePlane('mist-cloud', { width: w, height: h }, scene);
      puff.billboardMode = Mesh.BILLBOARDMODE_Y;
      puff.material = high;
      add(puff, p.x + (rand() - .5) * p.r, H(p.x, p.z) + p.h * (.3 + rand() * .35), p.z - p.r * .4, p.r * .3);
    }
  }
  // 영기: 은은하게 빛나는 작은 구슬
  const orbMaterial = new StandardMaterial('spirit-orb', scene);
  orbMaterial.emissiveColor = Color3.FromHexString('#DFF7FF');
  orbMaterial.disableLighting = true;
  const orbs = Array.from({ length: 22 }, () => {
    const mesh = MeshBuilder.CreateSphere('spirit-orb', { diameter: .1 + rand() * .08, segments: 6 }, scene);
    mesh.material = orbMaterial;
    mesh.isPickable = false;
    glow.addIncludedOnlyMesh(mesh);
    const { x, z } = pointIn(SANCTUARY_AREAS[Math.floor(rand() * 2)]!, 1);
    return { mesh, x, z, y: H(x, z) + .8 + rand() * 1.8, phase: rand() * 10 };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const d of drifts) {
      d.mesh.position.x = d.x + Math.sin(t * d.speed + d.phase) * d.reach;
      d.mesh.position.z = d.z + Math.cos(t * d.speed * .7 + d.phase) * d.reach * .5;
      d.mesh.position.y = d.y + Math.sin(t * .3 + d.phase) * .08;
    }
    for (const o of orbs) {
      o.mesh.position.set(o.x + Math.sin(t * .4 + o.phase) * .8, o.y + Math.sin(t * .9 + o.phase) * .35, o.z + Math.cos(t * .35 + o.phase) * .8);
      o.mesh.visibility = .55 + Math.sin(t * 2 + o.phase) * .35;
    }
  });
}
