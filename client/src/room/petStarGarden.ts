import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Kit } from './petRoomDecor';
import { mix, noise, paint } from './petSanctuary';
import { LIMIT, STAR_GARDEN as SG, terrainHeight as H } from './petRoomMap';

// 별빛 정원(레어 펫 전용): 정문 왼쪽 아래층 구석을 흰 울타리로 두른 정원.
// 원작 도로랜드의 "자연과 기술이 어우러진" 분위기를 가장 진하게 모았습니다.
//  - 정문 길에서 들어오는 각진 네온 아치와 홀로그램 간판(정문 아치와 같은 모양), 북쪽에 작은 아치
//  - 흰 난간에 연보라 기둥, 기둥 끝마다 작은 수정이 빛나는 울타리
//  - 흰 포석 길(가장자리에 빛 점)로 이어진 가운데 별빛 분수 광장: 떠 있는 빛 구슬, 도는 고리, 솟는 별가루
//  - 반투명 돔을 얹은 별 관측 정자, 흰 화분의 빛나는 수정 꽃, 수정 나무
//  - 머리 위에 떠 있는 달걀 조명과 반짝이는 별
// 레전더리 성역(신화·안개·단청)과 달리 흰색·연보라·하늘색·분홍 네온의 미래적인 색을 씁니다.
const WHITE = '#F5F5F8';
const GOLD = '#E0B451';
const LAVENDER = '#A99BE0';
const NEON = '#E86FD0';
const CRYSTALS = ['#9FE7F5', '#C9B6F5', '#F7B6DA', '#FFE7A3'];

export function buildStarGarden(kit: Kit) {
  buildFence(kit);
  for (const arch of SG.arches) buildArch(kit, arch);
  buildPaths(kit);
  buildFountain(kit);
  buildPavilion(kit);
  buildCrystalBeds(kit);
  buildCrystalTrees(kit);
  buildSky(kit);
}

// 입구 아치: 기울어진 연보라 기둥 두 개, 흰 지붕판 아래 분홍 네온, 떠 있는 홀로그램 간판.
// heading은 아치를 지나가는 방향이고, 기둥은 그와 수직으로 벌어져 섭니다.
function buildArch(kit: Kit, arch: (typeof SG.arches)[number]) {
  const { scene, mat, cast, glow, hologram, fitText, place } = kit;
  const { x, z, half, heading } = arch, y = H(x, z), big = half > 1.4;
  const legs: Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = MeshBuilder.CreateBox('star-arch-leg', { width: .32, height: 3, depth: .45 }, scene);
    leg.position.set(side * half, 1.45, 0);
    leg.rotation.z = side * .1;
    legs.push(leg);
  }
  const roof = MeshBuilder.CreateBox('star-arch-roof', { width: half * 2 + 1.4, height: .26, depth: 1 }, scene);
  roof.position.set(0, 3.05, 0);
  const neon = MeshBuilder.CreateBox('star-arch-glow', { width: half * 2 + 1.2, height: .04, depth: .8 }, scene);
  neon.position.set(0, 2.9, 0);
  // 기둥이 지나가는 방향과 수직이 되도록 돌립니다(기본 상자는 x축으로 벌어져 z 방향으로 지나감).
  place(x, y, z, heading, [...legs, roof, neon]);
  for (const leg of legs) { cast(leg); leg.material = mat(LAVENDER); }
  cast(roof).material = mat(WHITE);
  neon.material = mat(NEON, .6);
  glow.addIncludedOnlyMesh(neon);
  const sign = hologram(`star-arch-sign-${x}`, big ? 3.6 : 2.8, big ? .9 : .7, new Vector3(x, y + 3.85, z), 'cyan', (ctx, w, h) => {
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, '✦ STARLIGHT GARDEN ✦', w - 60, 64);
    ctx.fillText('✦ STARLIGHT GARDEN ✦', w / 2, h * .4);
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('별빛 정원 · 레어 펫의 쉼터', w / 2, h * .76);
  });
  // 간판 판은 기본으로 -z를 봅니다. 정원 밖(들어오는 쪽)을 보게 돌립니다.
  sign.rotation.y = heading + Math.PI;
}

// 울타리: 흰 난간 두 줄, 연보라 기둥, 한 칸 걸러 기둥 끝에 빛나는 작은 수정
function buildFence({ scene, merge, glow }: Kit) {
  const rails: Mesh[] = [], posts: Mesh[] = [], tips: Mesh[] = [];
  for (const f of SG.fences) {
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), n = Math.max(1, Math.round(len / 1.8)), heading = Math.atan2(f.x1 - f.x0, f.z1 - f.z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = f.x0 + (f.x1 - f.x0) * t, z = f.z0 + (f.z1 - f.z0) * t, y = H(x, z);
      const post = MeshBuilder.CreateBox('star-fence-post', { width: .16, height: .95, depth: .16 }, scene);
      post.position.set(x, y + .47, z);
      posts.push(post);
      if (i % 2 === 0) {
        const tip = MeshBuilder.CreateCylinder('star-fence-tip', { diameterTop: 0, diameterBottom: .14, height: .26, tessellation: 6 }, scene);
        tip.position.set(x, y + 1.08, z);
        tips.push(tip);
      }
    }
    for (const ry of [.42, .82]) {
      const rail = MeshBuilder.CreateBox('star-fence-rail', { width: .07, height: .07, depth: len }, scene);
      rail.rotation.y = heading;
      rail.position.set((f.x0 + f.x1) / 2, H((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2) + ry, (f.z0 + f.z1) / 2);
      rails.push(rail);
    }
  }
  merge('star-fence-rails', rails, WHITE);
  merge('star-fence-posts', posts, LAVENDER);
  const tip = merge('star-fence-tips', tips, '#9FE7F5', false, .6);
  if (tip) glow.addIncludedOnlyMesh(tip);
}

// 흰 포석 길: 가운데는 흰 돌, 가장자리는 연보라 띠. 양옆에 빛 점이 줄지어 박혀 있습니다.
function buildPaths({ scene, merge, glow }: Kit) {
  const lights: Mesh[] = [];
  SG.paths.forEach((control, index) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < control.length - 1; i++) {
      const p0 = control[Math.max(0, i - 1)]!, p1 = control[i]!, p2 = control[i + 1]!, p3 = control[Math.min(control.length - 1, i + 2)]!;
      const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / .25);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    pts.push(control[control.length - 1]!);
    const cols = 8, half = .8, positions: number[] = [], colors: number[] = [], indices: number[] = [], uvs: number[] = [];
    let along = 0;
    pts.forEach(([x, z], i) => {
      if (i) along += Math.hypot(x - pts[i - 1]![0], z - pts[i - 1]![1]);
      const next = pts[Math.min(i + 1, pts.length - 1)]!, prev = pts[Math.max(i - 1, 0)]!;
      const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
      const sx = (next[1] - prev[1]) / len, sz = -(next[0] - prev[0]) / len;
      for (let k = 0; k <= cols; k++) {
        const u = k / cols * 2 - 1, px = x + sx * u * half, pz = z + sz * u * half;
        positions.push(px, H(px, pz) + .035, pz);
        const edge = Math.abs(u) > .8;
        colors.push(...(edge ? [.78, .74, .94] : [.96, .95, .99]), 1);
        uvs.push(k / cols, along / 1.2);
      }
      // 길 양옆 빛 점(약 1.2m 간격)
      if (i % 5 === 0 && i > 0 && i < pts.length - 2) for (const side of [-1, 1]) {
        const lx = x + sx * side * (half + .08), lz = z + sz * side * (half + .08);
        const dot = MeshBuilder.CreateCylinder('star-path-light', { diameter: .12, height: .06, tessellation: 10 }, scene);
        dot.position.set(lx, H(lx, lz) + .05, lz);
        lights.push(dot);
      }
    });
    const row = cols + 1;
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < cols; k++) {
      const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    if (normals[1]! < 0) { for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2]!, indices[k + 1]!]; VertexData.ComputeNormals(positions, indices, normals); }
    const data = new VertexData();
    Object.assign(data, { positions, indices, normals, colors, uvs });
    const mesh = new Mesh(`star-path-${index}`, scene);
    data.applyToMesh(mesh);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    const material = new StandardMaterial(`star-path-${index}`, scene);
    material.specularColor = Color3.Black();
    mesh.material = material;
  });
  const merged = merge('star-path-lights', lights, '#BFF3FF', false, .9);
  if (merged) glow.addIncludedOnlyMesh(merged);
}

// 별 관측 정자: 흰 바닥과 금색 테, 여섯 개의 흰 기둥, 연보라 고리 위 반투명 돔, 꼭대기 금빛 별. 안에는 홀로그램 별 구슬이 돕니다.
function buildPavilion({ scene, mat, merge, cast, glow }: Kit) {
  const { x, z, r } = SG.pavilion, y = H(x, z);
  const floor = cast(MeshBuilder.CreateCylinder('pavilion-floor', { diameter: r * 2 + .7, height: .1, tessellation: 40 }, scene));
  floor.position.set(x, y + .05, z);
  floor.material = mat(WHITE);
  const rim = MeshBuilder.CreateTorus('pavilion-rim', { diameter: r * 2 + .7, thickness: .07, tessellation: 40 }, scene);
  rim.position.set(x, y + .1, z);
  rim.material = mat(GOLD);
  const pillars: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + SG.pavilion.turn;
    const pillar = MeshBuilder.CreateCylinder('pavilion-pillar', { diameter: .18, height: 2.4, tessellation: 12 }, scene);
    pillar.position.set(x + Math.cos(a) * r, y + 1.25, z + Math.sin(a) * r);
    pillars.push(pillar);
  }
  cast(merge('pavilion-pillars', pillars, WHITE)!);
  const ring = MeshBuilder.CreateTorus('pavilion-ring', { diameter: r * 2 + .2, thickness: .18, tessellation: 40 }, scene);
  ring.position.set(x, y + 2.45, z);
  cast(merge('pavilion-ring', [ring], LAVENDER)!);
  const dome = MeshBuilder.CreateSphere('pavilion-dome', { diameter: r * 2 + .3, segments: 24, slice: .5 }, scene);
  dome.scaling.y = .75;
  dome.position.set(x, y + 2.45, z);
  const domeMaterial = new StandardMaterial('pavilion-dome', scene);
  domeMaterial.diffuseColor = Color3.FromHexString('#C9B6F5');
  domeMaterial.emissiveColor = new Color3(.2, .18, .3);
  domeMaterial.specularColor = new Color3(.8, .8, .9);
  domeMaterial.specularPower = 64;
  domeMaterial.alpha = .55;
  domeMaterial.backFaceCulling = false;
  dome.material = domeMaterial;
  const finial = MeshBuilder.CreateCylinder('pavilion-finial', { diameterTop: 0, diameterBottom: .22, height: .5, tessellation: 4 }, scene);
  finial.position.set(x, y + 2.45 + (r + .15) * .75 + .2, z);
  finial.material = mat(GOLD, .4);
  glow.addIncludedOnlyMesh(finial);
  // 홀로그램 별 구슬: 위선·경선 고리가 천천히 돕니다.
  const globe = MeshBuilder.CreateSphere('pavilion-globe', { diameter: .5, segments: 14 }, scene);
  const globeMaterial = mat('#BFF3FF', .8);
  globeMaterial.alpha = .55;
  globe.material = globeMaterial;
  glow.addIncludedOnlyMesh(globe);
  const lines = [0, 1, 2].map(i => {
    const line = MeshBuilder.CreateTorus('pavilion-globe-line', { diameter: .8 + i * .12, thickness: .025, tessellation: 32 }, scene);
    line.material = mat(i === 1 ? GOLD : '#BFF3FF', .6);
    glow.addIncludedOnlyMesh(line);
    return line;
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000, gy = y + 1.35 + Math.sin(t * 1.1) * .08;
    globe.position.set(x, gy, z);
    lines.forEach((line, i) => { line.position.set(x, gy, z); line.rotation.set(.6 + i * .7, t * (.3 + i * .2), i * .4); });
  });
}

// 별빛 분수: 흰 수반과 금색 테, 빛나는 물, 가운데 받침 위에 떠서 오르내리는 빛 구슬과 서로 다른 축으로 도는 고리 두 개
function buildFountain({ scene, mat, merge, cast, glow, rand }: Kit) {
  const { x, z, r } = SG.fountain, Y = H(x, z);
  // 분수 광장 바닥: 흰 타일에 연보라 줄눈, 가운데로 모이는 금빛 여덟 갈래 별
  const floorR = SG.plazaR;
  const texture = new DynamicTexture('star-floor', { width: 512, height: 512 }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#F4F1FA'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(169,155,224,.55)'; ctx.lineWidth = 3;
  for (const rr of [70, 130, 190, 250]) { ctx.beginPath(); ctx.arc(256, 256, rr, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(256 + Math.cos(a) * 70, 256 + Math.sin(a) * 70); ctx.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256); ctx.stroke(); }
  ctx.fillStyle = 'rgba(224,180,81,.85)';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? 90 : 245; ctx.lineTo(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr); }
  ctx.closePath(); ctx.globalAlpha = .35; ctx.fill(); ctx.globalAlpha = 1;
  texture.update();
  const floorMaterial = new StandardMaterial('star-floor', scene);
  floorMaterial.diffuseTexture = texture;
  floorMaterial.specularColor = Color3.Black();
  const floor = MeshBuilder.CreateDisc('star-floor', { radius: floorR, tessellation: 56 }, scene);
  floor.rotation.x = Math.PI / 2;
  floor.position.set(x, Y + .025, z);
  floor.material = floorMaterial;
  floor.receiveShadows = true;
  const edge = MeshBuilder.CreateTorus('star-floor-edge', { diameter: floorR * 2, thickness: .1, tessellation: 56 }, scene);
  edge.scaling.y = .5;
  edge.position.set(x, Y + .03, z);
  edge.material = mat(LAVENDER);
  const basin = cast(MeshBuilder.CreateCylinder('star-basin', { diameterTop: r * 2, diameterBottom: r * 1.7, height: .5, tessellation: 40 }, scene));
  basin.position.set(x, Y + .25, z);
  basin.material = mat(WHITE);
  const rim = MeshBuilder.CreateTorus('star-basin-rim', { diameter: r * 2 - .06, thickness: .1, tessellation: 48 }, scene);
  rim.position.set(x, Y + .5, z);
  const pedestal = MeshBuilder.CreateCylinder('star-pedestal', { diameterTop: .35, diameterBottom: .6, height: 1, tessellation: 20 }, scene);
  pedestal.position.set(x, Y + .8, z);
  const bowl = MeshBuilder.CreateCylinder('star-bowl', { diameterTop: .8, diameterBottom: .3, height: .25, tessellation: 24 }, scene);
  bowl.position.set(x, Y + 1.38, z);
  cast(merge('star-fountain-gold', [rim], GOLD)!);
  cast(merge('star-fountain-white', [pedestal, bowl], WHITE)!);
  const water = MeshBuilder.CreateDisc('star-water', { radius: r - .1, tessellation: 40 }, scene);
  water.rotation.x = Math.PI / 2;
  water.position.set(x, Y + .46, z);
  const waterMaterial = mat('#8FDCEB', .45);
  waterMaterial.specularColor = new Color3(.6, .6, .6);
  water.material = waterMaterial;

  const orb = MeshBuilder.CreateSphere('star-orb', { diameter: .55, segments: 20 }, scene);
  orb.material = mat('#E6FAFF', 1);
  glow.addIncludedOnlyMesh(orb);
  const rings = [
    { mesh: MeshBuilder.CreateTorus('star-ring', { diameter: 1.15, thickness: .05, tessellation: 40 }, scene), hex: GOLD, tilt: .5, speed: .9 },
    { mesh: MeshBuilder.CreateTorus('star-ring', { diameter: 1.45, thickness: .04, tessellation: 40 }, scene), hex: LAVENDER, tilt: -.8, speed: -.6 },
  ];
  for (const ring of rings) { ring.mesh.material = mat(ring.hex, .35); glow.addIncludedOnlyMesh(ring.mesh); }
  // 별가루: 구슬에서 천천히 솟아오르며 흩어지고 옅어집니다.
  const dust = Array.from({ length: 18 }, () => {
    const mesh = MeshBuilder.CreateSphere('star-dust', { diameter: .06 + rand() * .05, segments: 4 }, scene);
    mesh.material = mat(CRYSTALS[Math.floor(rand() * CRYSTALS.length)]!, 1);
    mesh.isPickable = false;
    glow.addIncludedOnlyMesh(mesh);
    return { mesh, angle: rand() * Math.PI * 2, phase: rand(), speed: .18 + rand() * .15, reach: .3 + rand() * .7 };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    const oy = Y + 2.15 + Math.sin(t * 1.3) * .12;
    orb.position.set(x, oy, z);
    orb.scaling.setAll(1 + Math.sin(t * 2.4) * .05);
    for (const ring of rings) {
      ring.mesh.position.set(x, oy, z);
      ring.mesh.rotation.set(ring.tilt, t * ring.speed, Math.sin(t * .5) * .2);
    }
    for (const d of dust) {
      const life = (t * d.speed + d.phase) % 1, a = d.angle + t * .4;
      d.mesh.position.set(x + Math.cos(a) * d.reach * life, oy + life * 1.6, z + Math.sin(a) * d.reach * life);
      d.mesh.visibility = Math.sin(life * Math.PI);
    }
  });
}

// 수정 꽃밭: 금색 띠를 두른 흰 화분에 가는 줄기와 뾰족한 수정 꽃잎. 꽃마다 은은하게 빛납니다.
function buildCrystalBeds({ scene, mat, merge, cast, glow, rand }: Kit) {
  const stems: Mesh[] = [], heads: Mesh[][] = CRYSTALS.map(() => []);
  for (const b of SG.beds) {
    const y = H(b.x, b.z);
    const pot = cast(MeshBuilder.CreateCylinder('star-pot', { diameterTop: b.r * 2, diameterBottom: b.r * 1.5, height: .55, tessellation: 32 }, scene));
    pot.position.set(b.x, y + .27, b.z);
    pot.material = mat(WHITE);
    const band = MeshBuilder.CreateTorus('star-pot-band', { diameter: b.r * 2 - .04, thickness: .06, tessellation: 32 }, scene);
    band.position.set(b.x, y + .42, b.z);
    band.material = mat(GOLD);
    const soil = MeshBuilder.CreateDisc('star-pot-soil', { radius: b.r - .06, tessellation: 28 }, scene);
    soil.rotation.x = Math.PI / 2;
    soil.position.set(b.x, y + .53, b.z);
    soil.material = mat('#5C4A7A');
    const count = Math.round(b.r * 9);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (b.r - .18), h = .25 + rand() * .45;
      const fx = b.x + Math.cos(a) * d, fz = b.z + Math.sin(a) * d;
      const stem = MeshBuilder.CreateCylinder('star-stem', { diameter: .03, height: h, tessellation: 4 }, scene);
      stem.position.set(fx, y + .53 + h / 2, fz);
      stems.push(stem);
      // 수정 꽃: 위아래로 뾰족한 육각 결정 두세 개를 모읍니다.
      const color = Math.floor(rand() * CRYSTALS.length);
      for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
        const size = .08 + rand() * .06;
        const crystal = MeshBuilder.CreateCylinder('star-crystal', { diameterTop: 0, diameterBottom: size, height: size * 2.6, tessellation: 6 }, scene);
        crystal.position.set(fx + (rand() - .5) * .08, y + .55 + h + size * .9, fz + (rand() - .5) * .08);
        crystal.rotation.set((rand() - .5) * .9, rand() * 3, (rand() - .5) * .9);
        heads[color]!.push(crystal);
      }
    }
  }
  merge('star-stems', stems, '#7FB8A6', false);
  heads.forEach((list, i) => {
    const merged = merge(`star-crystals-${i}`, list, CRYSTALS[i]!, false, .3);
    if (merged) glow.addIncludedOnlyMesh(merged);
  });
}

// 수정 나무: 흰 줄기가 갈라져 올라가고, 가지 끝마다 반투명하게 빛나는 수정 잎 덩어리
function buildCrystalTrees(kit: Kit) {
  const { scene, merge, strut, rand } = kit;
  const trunks: Mesh[] = [], crowns: Mesh[] = [];
  for (const t of SG.crystalTrees) {
    const s = t.s, root = new Vector3(t.x, H(t.x, t.z) - .05, t.z);
    const top = root.add(new Vector3(0, 1.6 * s, 0));
    trunks.push(strut('crystal-trunk', root, top, .22 * s));
    const tips = [top.add(new Vector3(0, .7 * s, 0))];
    trunks.push(strut('crystal-trunk', top, tips[0]!, .14 * s));
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + rand() * .6, from = Vector3.Lerp(root, top, .65 + rand() * .3);
      const tip = from.add(new Vector3(Math.cos(a) * .8 * s, (.6 + rand() * .4) * s, Math.sin(a) * .8 * s));
      trunks.push(strut('crystal-branch', from, tip, .09 * s));
      tips.push(tip);
    }
    for (const tip of tips) for (let k = 0; k < 3; k++) {
      const leaf = MeshBuilder.CreateIcoSphere('crystal-leaf', { radius: (.28 + rand() * .18) * s, subdivisions: 1, flat: true }, scene);
      leaf.scaling.y = 1.25;
      leaf.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      leaf.position.set(tip.x + (rand() - .5) * .45 * s, tip.y + (rand() - .2) * .4 * s, tip.z + (rand() - .5) * .45 * s);
      crowns.push(leaf);
    }
  }
  merge('crystal-trunks', trunks, WHITE);
  const crown = paint(merge('crystal-crowns', crowns, '#FFFFFF'), (x, y, z) => {
    const n = noise(x * 1.5, y * 1.5, z * 1.5);
    // 하늘색 → 연보라 → 분홍으로 번지는 수정빛
    return n < 0 ? mix([.62, .9, .96], [.79, .71, .96], n + 1) : mix([.79, .71, .96], [.97, .71, .85], n);
  });
  if (crown) {
    const m = new StandardMaterial('crystal-crowns', scene);
    m.emissiveColor = new Color3(.35, .35, .4);
    m.specularColor = new Color3(.8, .8, .9);
    m.specularPower = 64;
    m.alpha = .82;
    crown.material = m;
  }
}

// 머리 위: 떠 있는 흰 달걀 조명과 반짝이는 별(네 갈래 빛). 별은 제각각 깜빡입니다.
function buildSky(kit: Kit) {
  const { scene, rand, eggLamp, glow } = kit;
  const x0 = -LIMIT, z0 = -LIMIT;
  for (const [x, y, z, s] of [[-14, 3.6, -9, .85], [-26, 4, -12.5, .95], [-17, 3.4, -25.5, .8], [-22.6, 3.8, -6.5, .8], [-12.8, 3.3, -26.4, .7]] as const) eggLamp(x, H(x, z) + y, z, s);
  const texture = new DynamicTexture('star-sparkle', { width: 64, height: 64 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, r = i % 2 ? 6 : 30;
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  texture.update();
  const stars = CRYSTALS.map(hex => {
    const m = new StandardMaterial(`star-sparkle-${hex}`, scene);
    m.diffuseColor = Color3.Black();
    m.emissiveColor = Color3.FromHexString(hex);
    m.opacityTexture = texture;
    m.disableLighting = true;
    m.backFaceCulling = false;
    return m;
  });
  const sparkles = Array.from({ length: 60 }, () => {
    const mesh = MeshBuilder.CreatePlane('star-sparkle', { size: 1 }, scene);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.material = stars[Math.floor(rand() * stars.length)]!;
    mesh.isPickable = false;
    glow.addIncludedOnlyMesh(mesh);
    const x = x0 + .5 + rand() * (SG.x1 - x0 - 1), z = z0 + .5 + rand() * (SG.z1 - z0 - 1), y = H(x, z) + 1.2 + rand() * 3;
    mesh.position.set(x, y, z);
    return { mesh, y, size: .18 + rand() * .2, phase: rand() * 10, speed: 1.5 + rand() * 2 };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const s of sparkles) {
      const k = Math.max(0, Math.sin(t * s.speed + s.phase));
      s.mesh.scaling.setAll(s.size * (.3 + k));
      s.mesh.visibility = .25 + k * .75;
      s.mesh.position.y = s.y + Math.sin(t * .4 + s.phase) * .15;
    }
  });
}
