import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Curve3 } from '@babylonjs/core/Maths/math.path';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Kit } from './petRoomDecor';
import { PLAZA, terrainHeight as H } from './petRoomMap';
import { mix, noise, paint, shade } from './petSanctuary';

// 광장 가운데 세계수: 여러 가닥이 꼬여 올라간 굵은 줄기, 흰 화단을 넘어 광장 바닥으로 파고드는 뿌리,
// 사방으로 넓게 뻗은 가지 끝의 큰 잎 구름, 아래로 늘어진 빛 덩굴, 천천히 떨어지는 빛나는 잎.
// 카메라가 아래로 기울어 있어 나무 쪽에서는 높은 곳이 화면 위로 잘립니다.
// 키는 약 10m로, 잎 아랫부분과 옆으로 넓게 퍼진 수관이 보이고 꼭대기는 살짝 잘리는 정도입니다.
// 잎·줄기가 플레이어를 가리면 반투명해집니다.
const TRUNK_TOP = 4.5;

export function buildWorldTree(kit: Kit) {
  const { scene, merge, rand, glow } = kit;
  const cx = PLAZA.x, cz = PLAZA.z, ground = H(cx, cz), base = ground + .7;
  const bark: Mesh[] = [], leaves: Mesh[] = [];
  const at = (angle: number, r: number, y: number) => new Vector3(cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r);
  // 굵기가 점점 가늘어지는 관(줄기·뿌리·가지)
  const tube = (path: Vector3[], r0: number, r1: number) => {
    const mesh = MeshBuilder.CreateTube('world-tree-bark', {
      path, tessellation: 12, cap: Mesh.CAP_ALL,
      radiusFunction: i => r0 + (r1 - r0) * i / (path.length - 1),
    }, scene);
    bark.push(mesh);
    return mesh;
  };
  const curve = (a: Vector3, b: Vector3, c: Vector3, count = 14) =>
    Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count, u = 1 - t;
      return a.scale(u * u).add(b.scale(2 * u * t)).add(c.scale(t * t));
    });

  // 줄기: 가운데 기둥에 여섯 가닥이 비틀리며 감겨 올라갑니다. 밑동은 넓게 퍼집니다.
  // 점들을 부드럽게 잇는 곡선
  const smooth = (points: Vector3[], perSegment = 6) => Curve3.CreateCatmullRomSpline(points, perSegment).getPoints();
  tube(Array.from({ length: 8 }, (_, i) => at(0, 0, base - .4 + i / 7 * (TRUNK_TOP + .9))), .85, .45);
  for (let s = 0; s < 6; s++) {
    const a0 = s / 6 * Math.PI * 2;
    const path = Array.from({ length: 22 }, (_, i) => {
      const t = i / 21;
      const r = .95 - t * .5 + Math.max(0, .35 - t) * 1.4;
      return at(a0 + t * 1.5, r, base - .3 + t * (TRUNK_TOP + .3));
    });
    tube(path, .46, .24);
  }
  // 뿌리: 화단 가장자리를 넘어 광장 바닥으로 파고듭니다. 대각선의 흰 화분을 피해 네 방향에 두 개씩.
  for (const axis of [0, 1, 2, 3]) for (const side of [-1, 1]) {
    const a = axis * Math.PI / 2 + side * (.3 + rand() * .12);
    const reach = 2.9 + rand() * .4;
    const wiggle = (rand() - .5) * .25;
    tube(smooth([
      at(a, .6, base + .9), at(a + wiggle, 1.35, base + .6), at(a, 1.95, base + .3),
      at(a - wiggle, 2.45, ground + .28), at(a, reach, ground - .05),
    ]), .45, .09);
  }

  // 잎 구름: 덩어리를 원반처럼 모으고 가운데 위에 하나 더 얹습니다.
  const cloud = (c: Vector3, size: number) => {
    const count = 6 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2 + rand() * .4, r = size * (.35 + rand() * .25);
      const clump = kit.lumpy('world-tree-leaves', size * (.75 + rand() * .3), .28, .55);
      clump.position.set(c.x + Math.cos(a) * r, c.y + (rand() - .5) * .3 * size, c.z + Math.sin(a) * r);
      leaves.push(clump);
    }
    const top = kit.lumpy('world-tree-leaves', size * 1.05, .25, .6);
    top.position.set(c.x, c.y + size * .35, c.z);
    leaves.push(top);
  };
  // 큰 가지 일곱 개가 줄기 위에서 사방으로 뻗고, 각 가지에서 잔가지가 갈라집니다.
  const tips: Vector3[] = [];
  const crown = at(0, 0, base + TRUNK_TOP);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + rand() * .3;
    const startY = base + TRUNK_TOP - 1 + rand() * .8;
    const reach = 3.6 + rand() * 1, rise = 1.7 + rand() * .8;
    const start = at(a, .35, startY), end = at(a + .15, reach, startY + rise);
    const path = curve(start, at(a, reach * .45, startY + rise * .2), end);
    tube(path, .4, .12);
    tips.push(end);
    for (const fork of [-1, 1]) {
      const from = path[8]!;
      const forkEnd = at(a + fork * .55, reach * .78, from.y + 1.3 + rand() * .5);
      tube(curve(from, from.add(forkEnd).scale(.5).add(new Vector3(0, -.2, 0)), forkEnd, 8), .18, .06);
      tips.push(forkEnd);
    }
  }
  // 줄기 꼭대기에서 곧게 오르는 우듬지
  const leader = at(.2, .25, base + TRUNK_TOP + 3);
  tube(curve(crown, at(0, .1, crown.y + 1.6), leader, 8), .4, .13);
  for (const tip of tips) cloud(tip.add(new Vector3(0, .3, 0)), 1.45 + rand() * .35);
  cloud(leader.add(new Vector3(0, .4, 0)), 2.1);
  // 가지 사이를 메우는 안쪽 잎 덩어리(수관이 비어 보이지 않게)
  for (let i = 0; i < 6; i++) cloud(at(i / 6 * Math.PI * 2 + .5, 2, base + TRUNK_TOP + 2 + rand() * .5), 1.8);

  // 껍질: 아래는 이끼 낀 짙은 회갈색, 위로 갈수록 따뜻한 갈색. 깊은 골은 어둡게.
  const trunk = paint(merge('world-tree-bark', bark, '#FFFFFF'), (x, y, z, ny) => {
    const ridge = noise(x * 3.1, y * .9, z * 3.1), fine = noise(x * 9, y * 4, z * 9);
    let c = mix([.32, .27, .23], [.55, .4, .29], (y - ground) / 6);
    if (y - ground < 1.2 && ny > .2 && ridge + fine * .4 > .15) c = mix([.27, .4, .22], [.38, .54, .29], .5 + fine);
    return shade(c, ridge > .45 ? .7 : .92 + fine * .1);
  });
  const barkMaterial = new StandardMaterial('world-tree-bark', scene);
  barkMaterial.specularColor = Color3.Black();
  if (trunk) { trunk.receiveShadows = true; trunk.material = barkMaterial; }
  // 잎: 위는 햇빛 받은 연두, 옆은 짙은 초록, 아래는 그늘진 청록. 군데군데 신비로운 금빛 연두가 섞입니다.
  const canopy = paint(merge('world-tree-leaves', leaves, '#FFFFFF'), (x, y, z, ny) => {
    const n = noise(x * .7, y * .7, z * .7), fine = noise(x * 3, y * 3, z * 3) * .05;
    let c: [number, number, number] = ny > .5 ? [.45 + fine, .7 + fine, .35] : ny > -.2 ? [.24 + fine, .5 + fine, .32] : [.13, .32 + fine, .3];
    if (n > .55 && ny > 0) c = mix(c, [.78, .86, .42], .55);
    return c;
  });
  if (canopy) {
    // 잎이 은은하게 스스로 빛나서 그늘진 아래쪽도 너무 어둡지 않습니다.
    const material = new StandardMaterial('world-tree-leaves', scene);
    material.diffuseColor = Color3.White();
    material.specularColor = Color3.Black();
    material.emissiveColor = new Color3(.08, .12, .09);
    canopy.material = material;
  }
  // 카메라와 플레이어 사이를 잎이나 줄기가 가리면 그것만 반투명하게 바꿉니다.
  const leafMaterial0 = canopy?.material as StandardMaterial | undefined;
  for (const m of [barkMaterial, leafMaterial0]) if (m) m.needDepthPrePass = true;
  const canopyCenter = new Vector3(cx, base + TRUNK_TOP + 2.3, cz);
  const blocks = (from: Vector3, to: Vector3, test: (p: Vector3) => boolean) => {
    for (let i = 1; i < 16; i++) if (test(Vector3.Lerp(from, to, i / 16))) return true;
    return false;
  };
  const inCanopy = (p: Vector3) => ((p.x - cx) ** 2 + (p.z - cz) ** 2) / 5.2 ** 2 + ((p.y - canopyCenter.y) / 2.8) ** 2 < 1;
  const inTrunk = (p: Vector3) => Math.hypot(p.x - cx, p.z - cz) < 1.4 && p.y < base + TRUNK_TOP + .5;
  scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera as (typeof scene.activeCamera & { getTarget?: () => Vector3 }) | null;
    if (!camera?.getTarget) return;
    const eye = camera.position, target = camera.getTarget();
    const k = Math.min(1, scene.getEngine().getDeltaTime() / 1000 * 5);
    for (const [material, test] of [[leafMaterial0, inCanopy], [barkMaterial, inTrunk]] as const) {
      if (!material) continue;
      const goal = blocks(eye, target, test) ? .3 : 1;
      material.alpha += (goal - material.alpha) * k;
      if (Math.abs(material.alpha - 1) < .01) material.alpha = 1;
    }
  });

  // 빛 덩굴: 가지 아래로 늘어진 가는 덩굴 끝에 빛 방울이 달려 천천히 흔들립니다.
  const vineMaterial = kit.mat('#4F7D4A');
  const bulbMaterial = new StandardMaterial('world-tree-bulb', scene);
  bulbMaterial.emissiveColor = Color3.FromHexString('#C9FFE6');
  bulbMaterial.disableLighting = true;
  const vines: { bulb: Mesh; vine: Mesh; phase: number }[] = [];
  for (const tip of tips.filter((_, i) => i % 2 === 0)) {
    const from = tip.add(new Vector3(0, -.15, 0)), length = 1.6 + rand() * 1.2;
    const vine = MeshBuilder.CreateCylinder('world-tree-vine', { diameter: .05, height: length, tessellation: 5 }, scene);
    vine.setPivotPoint(new Vector3(0, length / 2, 0));
    vine.position.set(from.x, from.y - length / 2, from.z);
    vine.material = vineMaterial;
    const bulb = MeshBuilder.CreateSphere('world-tree-bulb', { diameter: .2, segments: 8 }, scene);
    bulb.parent = vine;
    bulb.position.y = -length / 2;
    bulb.material = bulbMaterial;
    glow.addIncludedOnlyMesh(bulb);
    vines.push({ bulb, vine, phase: rand() * 10 });
  }

  // 떨어지는 빛 잎: 수관에서 천천히 맴돌며 내려와 바닥에 닿으면 다시 위에서 떨어집니다.
  const leafMaterial = new StandardMaterial('world-tree-falling', scene);
  leafMaterial.emissiveColor = Color3.FromHexString('#F3EBA0');
  leafMaterial.disableLighting = true;
  leafMaterial.backFaceCulling = false;
  const falling = Array.from({ length: 36 }, () => {
    const mesh = MeshBuilder.CreateDisc('world-tree-falling', { radius: .09, tessellation: 6 }, scene);
    mesh.scaling.x = .55;
    mesh.material = leafMaterial;
    mesh.isPickable = false;
    glow.addIncludedOnlyMesh(mesh);
    return { mesh, angle: rand() * Math.PI * 2, r: 1.2 + rand() * 4, y: base + rand() * 7.5, speed: .35 + rand() * .35, spin: rand() * 10 };
  });
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, .05), t = performance.now() / 1000;
    for (const v of vines) {
      v.vine.rotation.x = Math.sin(t * .8 + v.phase) * .06;
      v.vine.rotation.z = Math.cos(t * .6 + v.phase) * .06;
      v.bulb.visibility = .7 + Math.sin(t * 2.2 + v.phase) * .3;
    }
    for (const f of falling) {
      f.y -= f.speed * dt;
      f.angle += dt * .25;
      f.spin += dt * 3;
      if (f.y < ground + .1) { f.y = base + 6 + rand() * 2; f.r = 1.2 + rand() * 4; }
      f.mesh.position.set(cx + Math.cos(f.angle) * f.r + Math.sin(f.spin) * .25, f.y, cz + Math.sin(f.angle) * f.r);
      f.mesh.rotation.set(f.spin, f.spin * .7, 0);
    }
  });
  buildSpirits(kit, cx, cz, ground);
}

// 나무 정령: 빛나는 작은 몸과 은은한 빛무리, 파닥이는 잎사귀 날개, 지나간 자리에 남는 빛 꼬리.
// 세계수 둘레를 제각각 다른 속도로 떠돌다가, 가끔 잎 속으로 솟아올랐다 내려옵니다.
function buildSpirits({ scene, glow, rand }: Kit, cx: number, cz: number, ground: number) {
  const haloTexture = new DynamicTexture('spirit-halo', { width: 64, height: 64 }, scene, false);
  haloTexture.hasAlpha = true;
  const hctx = haloTexture.getContext() as CanvasRenderingContext2D;
  const gradient = hctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,.9)');
  gradient.addColorStop(.35, 'rgba(255,255,255,.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  hctx.clearRect(0, 0, 64, 64);
  hctx.fillStyle = gradient; hctx.fillRect(0, 0, 64, 64);
  haloTexture.update();
  const colors = ['#B8FFD9', '#FFF1A8', '#A8ECFF', '#FFC8EC', '#D2FFB0', '#C9D4FF'];
  const emissive = (hex: string, name: string) => {
    const m = new StandardMaterial(name, scene);
    m.emissiveColor = Color3.FromHexString(hex);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    return m;
  };
  const spirits = colors.map((hex, i) => {
    const node = new TransformNode(`tree-spirit-${i}`, scene);
    const body = MeshBuilder.CreateSphere('tree-spirit-body', { diameter: .22, segments: 10 }, scene);
    body.material = emissive(hex, `tree-spirit-${i}`);
    body.parent = node;
    glow.addIncludedOnlyMesh(body);
    const halo = MeshBuilder.CreatePlane('tree-spirit-halo', { size: 1.1 }, scene);
    const haloMaterial = emissive(hex, `tree-spirit-halo-${i}`);
    haloMaterial.opacityTexture = haloTexture;
    haloMaterial.alpha = .75;
    halo.material = haloMaterial;
    halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
    halo.parent = node;
    // 잎사귀 날개 한 쌍
    const wingMaterial = emissive(hex, `tree-spirit-wing-${i}`);
    wingMaterial.alpha = .7;
    wingMaterial.backFaceCulling = false;
    const wings = [-1, 1].map(side => {
      const pivot = new TransformNode('tree-spirit-wing-pivot', scene);
      pivot.parent = node;
      const wing = MeshBuilder.CreateDisc('tree-spirit-wing', { radius: .14, tessellation: 10 }, scene);
      wing.scaling.y = .45;
      wing.position.x = side * .16;
      wing.material = wingMaterial;
      wing.parent = pivot;
      return { pivot, side };
    });
    // 빛 꼬리: 지나온 위치를 따라가는 작은 구슬들
    const trail = Array.from({ length: 7 }, (_, k) => {
      const dot = MeshBuilder.CreateSphere('tree-spirit-trail', { diameter: .1 * (1 - k / 8), segments: 5 }, scene);
      dot.material = body.material;
      dot.isPickable = false;
      return dot;
    });
    for (const mesh of [body, halo]) mesh.isPickable = false;
    return {
      node, wings, trail, history: [] as Vector3[],
      radius: 2.8 + rand() * 3.2, height: 1.4 + rand() * 2.4, speed: (.18 + rand() * .2) * (rand() < .5 ? -1 : 1),
      phase: rand() * 10, angle: rand() * Math.PI * 2, rise: 0, riseTimer: 3 + rand() * 8,
    };
  });
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, .05), t = performance.now() / 1000;
    for (const s of spirits) {
      s.angle += s.speed * dt;
      // 가끔 잎 속으로 솟아올랐다 천천히 내려옵니다.
      s.riseTimer -= dt;
      if (s.riseTimer <= 0) { s.rise = 1; s.riseTimer = 6 + rand() * 10; }
      s.rise = Math.max(0, s.rise - dt * .25);
      const lift = Math.sin(s.rise * Math.PI) * 3.5;
      const r = s.radius + Math.sin(t * .5 + s.phase) * .8;
      const x = cx + Math.cos(s.angle) * r + Math.sin(t * 1.3 + s.phase) * .3;
      const z = cz + Math.sin(s.angle) * r + Math.cos(t * 1.1 + s.phase) * .3;
      const y = ground + s.height + Math.sin(t * 1.7 + s.phase) * .35 + lift;
      s.node.position.set(x, y, z);
      // 진행 방향을 바라보고 날개를 파닥입니다.
      s.node.rotation.y = Math.atan2(-Math.sin(s.angle) * Math.sign(s.speed), Math.cos(s.angle) * Math.sign(s.speed));
      for (const w of s.wings) w.pivot.rotation.z = w.side * (.3 + Math.sin(t * 18 + s.phase) * .5);
      s.history.unshift(new Vector3(x, y, z));
      if (s.history.length > 28) s.history.length = 28;
      s.trail.forEach((dot, k) => {
        const p = s.history[Math.min(s.history.length - 1, (k + 1) * 4)]!;
        dot.position.copyFrom(p);
        dot.visibility = .6 * (1 - k / s.trail.length);
      });
    }
  });
}
