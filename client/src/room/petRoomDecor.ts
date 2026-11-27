import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import type { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { createPetYard, type EquippedPet, type YardPet } from './petYard';
import { boulder, buildSanctuary, paint, rockColor, SPIRIT_RAMP, stoneWalkTexture } from './petSanctuary';
import { buildPond } from './petPond';
import { buildStream } from './petStream';
import { buildStarGarden } from './petStarGarden';
import { buildWorldTree } from './worldTree';
import {
  BENCHES, BRIDGE, BRIDGES, CAROUSEL, FALL_X, FLOWER_BEDS, GATE, HALF, INFO, LIMIT, PLAZA, PLAZA_BOWLS, POND, PORTAL, RAMPS, RAMP_SIDES, ROCKS,
  PATH_LINES, PATH_WIDTH, POOL, STAR_GARDEN, inStarGarden, PORTAL_PLAZA_R, CASCADE, STATION, STREAM, TELESCOPE, TERRACE, TERRACE_WALLS, UPPER, UPPER_WALLS, WHEEL, YARD_TREES, bridgeDeck, distToLine, inSanctuary, inNormalArea, nearStream, onPath, petWorld, terrainHeight,
} from './petRoomMap';

// 펫 마이룸 전용 꾸미기: 도로랜드 펫 정원.
// 디자인 기준은 원작 웹툰(webtoon.doroedu.co.kr) 1장의 도로랜드 풍경입니다.
//  - 광장: 둥근 흰 화단에 심은 큰 나무, 주변의 작은 흰 화분(금색 띠), 분홍빛 보도와 흰 연석
//  - 공중에 떠 있는 흰 달걀형 조명(금색 띠), 떠 있는 홀로그램 패널(하늘색·분홍)
//  - 공원: 분홍·보라 빛이 나는 각진 아치 구조물, 보라·분홍 줄무늬 지붕의 회전목마, 연보라 관람차, 보라색 잎 나무
//  - 정원: 돌 테두리를 두른 둥근 꽃밭, 벤치
// 지형(높이·벽·경사로)과 위치, 충돌은 petRoomMap.ts에 있고, 여기서는 그 위에 보이는 것만 만듭니다.
// 소품은 지형 자체의 높이에 놓습니다(다리 바닥 높이는 걷기용이라 제외).
const H = terrainHeight;
const HORIZON = '#E6F2FA';
const SKY_TOP = '#6FB8EC';
const WHITE = '#F5F5F8';
const GOLD = '#E0B451';
const PAVING = '#D9A79A';
const CURB = '#F3F0F2';
const LAVENDER = '#A99BE0';
const PURPLE = '#7E68C2';
const NEON = '#E86FD0';
const HOLO = '#86E4F2';
const WOOD = '#A9785A';
const STONE = '#9C958F';

export function buildPetRoom(scene: Scene, shadows: ShadowGenerator, glow: GlowLayer) {
  const kit = gardenKit(scene, shadows, glow);
  setSkyAndTerrain(kit);
  buildTerraceWalls(kit);
  buildHedgeAndGate(kit);
  buildPavedPaths(kit);
  buildPlaza(kit);
  buildPortalPlaza(kit);
  buildSanctuary(kit);
  buildWorldTree(kit);
  buildStarGarden(kit);
  buildShop(kit);
  buildPondAndWaterfall(kit);
  buildCarousel(kit);
  buildLookout(kit);
  buildTrees(kit);
  buildRocks(kit);
  buildFlowerBeds(kit);
  buildBenches(kit);
  buildGrass(kit);
  buildInfoHologram(kit);
  buildClouds(kit);
  const yard = createPetYard(scene, shadows, {
    limit: LIMIT,
    world: petWorld,
    spots: [
      { x: PLAZA.x - 4, z: PLAZA.z + 4 }, { x: -2, z: -16 }, { x: 12, z: -18 }, { x: 22, z: -10 }, { x: -13, z: -1.5 },
      { x: 10, z: 2 }, { x: -18.5, z: -1.5 }, { x: -2.5, z: 21.8 }, { x: 10, z: 16 }, { x: 20, z: 21 }, { x: 1, z: 26.5 }, { x: -6, z: -12 },
    ],
    balls: [{ x: 13, z: -10 }, { x: 0, z: -6 }, { x: 5, z: 15.2 }, { x: -15.8, z: -12.6 }],
    // 노멀: 정원 오른쪽에서만 (성역·별빛 정원 사이로 가지 않음)
    normal: p => inNormalArea(p.x, p.z),
    // 등급 전용 구역(장착한 펫은 제한 없음)
    zones: {
      // 레어: 별빛 정원(분수 광장, 별 관측 정자, 수정 꽃밭과 나무 곁, 두 아치 안쪽)
      RARE: {
        contains: p => inStarGarden(p.x, p.z),
        spots: [
          { x: -17.6, z: -13.2 }, { x: -21.6, z: -16.4 }, { x: -24.8, z: -24 }, { x: -13.6, z: -9.2 },
          { x: -24.2, z: -7.4 }, { x: -15.6, z: -25.8 }, { x: -27.2, z: -21 }, { x: -12.4, z: -22.6 }, { x: -20, z: -5.6 },
        ],
      },
      // 레전더리: 영산 성역
      LEGEND: {
        contains: p => inSanctuary(p.x, p.z),
        spots: [
          { x: -17, z: 17.4 }, { x: -22.5, z: 19.5 }, { x: -11.5, z: 17.5 }, { x: -27.5, z: 20.6 }, { x: -8, z: 22 }, { x: -21, z: 22.3 },
          { x: -24.5, z: 6.5 }, { x: -27, z: 10 }, { x: -20.5, z: 10.8 }, { x: -27.6, z: 6.6 }, { x: -12.6, z: 6 }, { x: -22.6, z: 5.3 },
        ],
      },
    },
  });
  return {
    syncYardPets: (equipped: EquippedPet | null) => yard.sync(equipped),
    setYardPets: (pets: YardPet[]) => yard.setOwned(pets),
  };
}

export type Kit = ReturnType<typeof gardenKit>;

function gardenKit(scene: Scene, shadows: ShadowGenerator, glow: GlowLayer) {
  let seed = 20261123;
  const materials = new Map<string, StandardMaterial>();
  const floaters: { node: TransformNode; base: number; phase: number; flicker: boolean }[] = [];
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const f of floaters) {
      f.node.position.y = f.base + Math.sin(t * 1.2 + f.phase) * .12;
      if (f.flicker && f.node instanceof Mesh) (f.node.material as StandardMaterial).alpha = .8 + Math.sin(t * 6 + f.phase) * .04;
    }
  });
  const kit = {
    scene,
    glow,
    rand: () => (seed = seed * 16807 % 2147483647) / 2147483647,
    mat(hex: string, emissive = 0) {
      const key = `${hex}-${emissive}`;
      let material = materials.get(key);
      if (!material) {
        material = new StandardMaterial(`garden-${key}`, scene);
        material.diffuseColor = Color3.FromHexString(hex);
        material.specularColor = Color3.Black();
        if (emissive) material.emissiveColor = Color3.FromHexString(hex).scale(emissive);
        materials.set(key, material);
      }
      return material;
    },
    pattern(name: string, draw: (ctx: CanvasRenderingContext2D) => void, uScale = 1, vScale = 1) {
      const key = `pattern-${name}-${uScale}-${vScale}`;
      let material = materials.get(key);
      if (!material) {
        const texture = new DynamicTexture(name, { width: 256, height: 256 }, scene, true);
        draw(texture.getContext() as CanvasRenderingContext2D);
        texture.update();
        texture.uScale = uScale; texture.vScale = vScale;
        material = new StandardMaterial(key, scene);
        material.diffuseTexture = texture;
        material.specularColor = Color3.Black();
        materials.set(key, material);
      }
      return material;
    },
    merge(name: string, meshes: Mesh[], hex: string | StandardMaterial, cast = true, emissive = 0) {
      if (!meshes.length) return null;
      const merged = Mesh.MergeMeshes(meshes, true, true);
      if (!merged) return null;
      merged.name = name;
      merged.material = typeof hex === 'string' ? kit.mat(hex, emissive) : hex;
      merged.receiveShadows = true;
      if (cast) shadows.addShadowCaster(merged);
      return merged;
    },
    cast<T extends Mesh>(mesh: T) { shadows.addShadowCaster(mesh); mesh.receiveShadows = true; return mesh; },
    strut(name: string, a: Vector3, b: Vector3, diameter: number) {
      const mesh = MeshBuilder.CreateCylinder(name, { diameter, height: Vector3.Distance(a, b), tessellation: 8 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.bakeCurrentTransformIntoVertices();
      mesh.position.copyFrom(Vector3.Center(a, b));
      mesh.lookAt(b);
      return mesh;
    },
    lumpy(name: string, diameter: number, amount: number, stretchY: number) {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8, updatable: true }, scene);
      const salt = kit.rand() * 100;
      mesh.updateMeshPositions(positions => {
        for (let i = 0; i < positions.length; i += 3) {
          const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
          const k = 1 + Math.sin(px * 6.1 / diameter + salt) * Math.cos(py * 5.3 / diameter - salt) * Math.sin(pz * 4.7 / diameter + salt * .5) * amount;
          positions[i] = px * k; positions[i + 1] = py * k * stretchY; positions[i + 2] = pz * k;
        }
      }, true);
      mesh.rotation.y = kit.rand() * Math.PI * 2;
      return mesh;
    },
    place(x: number, y: number, z: number, heading: number, pieces: Mesh[]) {
      const node = new TransformNode('placed', scene);
      node.position.set(x, y, z);
      node.rotation.y = heading;
      node.computeWorldMatrix(true);
      for (const piece of pieces) {
        piece.parent = node;
        piece.bakeTransformIntoVertices(piece.computeWorldMatrix(true));
        piece.parent = null;
        piece.position.setAll(0); piece.rotation.setAll(0); piece.scaling.setAll(1);
      }
      node.dispose();
      return pieces;
    },
    // 공중에 떠서 천천히 오르내리는 메시(달걀 조명, 홀로그램)
    float<T extends TransformNode>(node: T, flicker = false) { floaters.push({ node, base: node.position.y, phase: kit.rand() * 10, flicker }); return node; },
    // 원작의 흰 달걀형 조명: 흰 몸통, 금색 띠, 아래쪽이 은은하게 빛납니다.
    eggLamp(x: number, y: number, z: number, size: number) {
      const node = new TransformNode('egg-lamp', scene);
      node.position.set(x, y, z);
      const body = MeshBuilder.CreateSphere('egg-lamp-body', { diameter: size, segments: 20 }, scene);
      body.scaling.y = 1.15;
      body.material = kit.mat(WHITE, .25);
      body.parent = node;
      const band = MeshBuilder.CreateTorus('egg-lamp-band', { diameter: size * .98, thickness: size * .07, tessellation: 32 }, scene);
      band.position.y = size * .2;
      band.material = kit.mat(GOLD, .2);
      band.parent = node;
      const light = MeshBuilder.CreateDisc('egg-lamp-light', { radius: size * .3, tessellation: 20 }, scene);
      light.rotation.x = -Math.PI / 2;
      light.position.y = -size * .56;
      light.material = kit.mat('#FFF1C9', 1);
      light.parent = node;
      glow.addIncludedOnlyMesh(light);
      shadows.addShadowCaster(body);
      return kit.float(node);
    },
    hologram(name: string, width: number, height: number, at: Vector3, tint: 'cyan' | 'pink', draw?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
      const w = 512, h = Math.round(512 * height / width);
      const texture = new DynamicTexture(name, { width: w, height: h }, scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = tint === 'cyan' ? 'rgba(110,215,240,.55)' : 'rgba(240,140,220,.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
      if (draw) draw(ctx, w, h);
      else {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 5;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(40, 50 + i * 45); ctx.bezierCurveTo(140, 20 + i * 45, 260, 90 + i * 45, w - 60 - i * 60, 55 + i * 45); ctx.stroke(); }
      }
      texture.update();
      const material = new StandardMaterial(name, scene);
      material.diffuseColor = Color3.Black();
      material.emissiveTexture = texture;
      material.opacityTexture = texture;
      material.disableLighting = true;
      material.backFaceCulling = false;
      const plane = MeshBuilder.CreatePlane(name, { width, height }, scene);
      plane.position.copyFrom(at);
      plane.material = material;
      plane.isPickable = false;
      return kit.float(plane, true);
    },
    fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, weight = 'bold') {
      let size = start;
      do { ctx.font = `${weight} ${size}px sans-serif`; size -= 2; } while (ctx.measureText(text).width > maxWidth && size > 12);
    },
    curve(from: [number, number], via: [number, number], to: [number, number], spacing: number) {
      const points: [number, number][] = [];
      const approx = Math.hypot(via[0] - from[0], via[1] - from[1]) + Math.hypot(to[0] - via[0], to[1] - via[1]);
      const count = Math.max(2, Math.round(approx / spacing));
      for (let i = 0; i <= count; i++) {
        const t = i / count, u = 1 - t;
        points.push([u * u * from[0] + 2 * u * t * via[0] + t * t * to[0], u * u * from[1] + 2 * u * t * via[1] + t * t * to[1]]);
      }
      return points;
    },
  };
  return kit;
}

// 맑은 하늘, 높낮이가 있는 지형, 바다
function setSkyAndTerrain({ scene, mat, rand }: Kit) {
  for (const mesh of scene.meshes.filter(mesh => ['wall', 'back-trim', 'floor'].includes(mesh.name))) mesh.dispose();
  scene.clearColor = Color4.FromColor3(Color3.FromHexString(HORIZON));
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString(HORIZON);
  scene.fogStart = 60;
  scene.fogEnd = 190;
  const ambient = scene.getLightByName('ambient') as HemisphericLight | null;
  if (ambient) { ambient.intensity = .78; ambient.diffuse = Color3.FromHexString('#FFF8F0'); ambient.groundColor = Color3.FromHexString('#7C8FA0'); }

  const skyTexture = new DynamicTexture('garden-sky', { width: 16, height: 256 }, scene, false);
  const sky = skyTexture.getContext() as CanvasRenderingContext2D;
  const gradient = sky.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(.45, '#B4DBF5');
  gradient.addColorStop(.5, HORIZON);
  gradient.addColorStop(1, HORIZON);
  sky.fillStyle = gradient; sky.fillRect(0, 0, 16, 256);
  skyTexture.update();
  const skyMaterial = new StandardMaterial('garden-sky', scene);
  skyMaterial.emissiveTexture = skyTexture;
  skyMaterial.diffuseColor = Color3.Black();
  skyMaterial.specularColor = Color3.Black();
  skyMaterial.disableLighting = true;
  skyMaterial.backFaceCulling = false;
  const dome = MeshBuilder.CreateSphere('garden-sky', { diameter: 900, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.material = skyMaterial;
  dome.applyFog = false;
  dome.infiniteDistance = true;
  dome.isPickable = false;

  const size = 150;
  const terrain = MeshBuilder.CreateGround('garden-terrain', { width: size, height: size, subdivisions: 300, updatable: true }, scene);
  terrain.updateMeshPositions(positions => {
    for (let i = 0; i < positions.length; i += 3) positions[i + 1] = H(positions[i]!, positions[i + 2]!);
  }, true);
  const grass = new DynamicTexture('garden-grass', { width: 512, height: 512 }, scene, true);
  const ctx = grass.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#86C46E';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = rand() > .5 ? 'rgba(80,140,70,.12)' : 'rgba(170,215,130,.14)';
    ctx.beginPath(); ctx.ellipse(rand() * 512, rand() * 512, 20 + rand() * 40, 12 + rand() * 30, rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 2400; i++) {
    const x = rand() * 512, y = rand() * 512;
    ctx.strokeStyle = rand() > .5 ? 'rgba(80,140,68,.32)' : 'rgba(180,222,140,.3)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - .5) * 4, y - 4 - rand() * 5); ctx.stroke();
  }
  grass.update();
  grass.uScale = grass.vScale = size / 6;
  const grassMaterial = new StandardMaterial('garden-grass', scene);
  grassMaterial.diffuseTexture = grass;
  grassMaterial.specularColor = Color3.Black();
  terrain.material = grassMaterial;
  terrain.receiveShadows = true;
  const sea = MeshBuilder.CreateGround('sea', { width: 1200, height: 1200 }, scene);
  sea.position.y = -.8;
  const seaMaterial = mat('#5BA9D6', .1);
  seaMaterial.specularColor = new Color3(.35, .4, .45);
  sea.material = seaMaterial;
}

// 테라스 앞 벽: 원작의 깔끔한 흰 구조물처럼 매끈한 벽, 연보라 갓돌, 벽 위의 긴 화단
function buildTerraceWalls({ scene, merge, rand, lumpy }: Kit) {
  const walls: Mesh[] = [], caps: Mesh[] = [], lines: Mesh[] = [], boxes: Mesh[] = [], greens: Mesh[] = [];
  const stoneWalls: Mesh[] = [], stoneCaps: Mesh[] = [];
  const blooms: Mesh[][] = [[], [], []];
  const run = (segments: readonly { x: number; z: number; hw: number }[], bottom: number, top: number) => {
    for (const s of segments) {
      const height = top - bottom + .5;
      const wall = MeshBuilder.CreateBox('terrace-wall', { width: s.hw * 2, height, depth: .7 }, scene);
      wall.position.set(s.x, bottom + height / 2 - .05, s.z);
      walls.push(wall);
      const cap = MeshBuilder.CreateBox('terrace-cap', { width: s.hw * 2 + .1, height: .14, depth: .85 }, scene);
      cap.position.set(s.x, top + .5, s.z);
      caps.push(cap);
      // 벽면을 나누는 가는 줄눈
      for (let x = s.x - s.hw + 3; x < s.x + s.hw - 1; x += 3) {
        const line = MeshBuilder.CreateBox('terrace-joint', { width: .05, height: height - .2, depth: .02 }, scene);
        line.position.set(x, bottom + height / 2, s.z - .36);
        lines.push(line);
      }
      // 벽 위 긴 화단(테라스 쪽 가장자리)
      if (s.hw > 1.2) {
        const box = MeshBuilder.CreateBox('terrace-planter', { width: s.hw * 2 - .4, height: .35, depth: .6 }, scene);
        box.position.set(s.x, top + .74, s.z + .05);
        boxes.push(box);
        for (let x = s.x - s.hw + .6; x < s.x + s.hw - .5; x += .55) {
          const bush = lumpy('terrace-green', .55 + rand() * .2, .2, .7);
          bush.position.set(x, top + 1.02, s.z + .05);
          greens.push(bush);
          if (rand() < .45) {
            const bloom = MeshBuilder.CreateSphere('terrace-bloom', { diameter: .17, segments: 5 }, scene);
            bloom.position.set(x + (rand() - .5) * .3, top + 1.22, s.z - .08 + (rand() - .5) * .2);
            blooms[Math.floor(rand() * 3)]!.push(bloom);
          }
        }
      }
    }
  };
  run(TERRACE_WALLS, 0, TERRACE.height);
  run(UPPER_WALLS, TERRACE.height, UPPER.height);
  for (const side of RAMP_SIDES) {
    const ramp = RAMPS.find(r => Math.abs(Math.abs(side.x - r.x) - (r.hw + .2)) < .01 && Math.abs(side.z - (r.z0 + r.z1) / 2) < .01)!;
    // 성역 돌계단 옆은 소맷돌(petSanctuary)로 따로 만듭니다.
    if (ramp === RAMPS[SPIRIT_RAMP]) continue;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const z0 = ramp.z0 + (ramp.z1 - ramp.z0) * i / steps, z1 = ramp.z0 + (ramp.z1 - ramp.z0) * (i + 1) / steps;
      const top = ramp.h0 + (ramp.h1 - ramp.h0) * (i + 1) / steps + .5;
      const block = MeshBuilder.CreateBox('ramp-wall', { width: .4, height: top - ramp.h0 + .05, depth: z1 - z0 + .02 }, scene);
      block.position.set(side.x, ramp.h0 + (top - ramp.h0) / 2 - .05, (z0 + z1) / 2);
      // 성역으로 오르는 왼쪽 경사로는 이끼 낀 돌담으로 꾸밉니다.
      const spirit = ramp === RAMPS[SPIRIT_RAMP];
      (spirit ? stoneWalls : walls).push(block);
      const cap = MeshBuilder.CreateBox('ramp-cap', { width: .5, height: .1, depth: z1 - z0 + .04 }, scene);
      cap.position.set(side.x, top, (z0 + z1) / 2);
      (spirit ? stoneCaps : caps).push(cap);
    }
  }
  merge('spirit-ramp-walls', stoneWalls, '#8F968F');
  merge('spirit-ramp-caps', stoneCaps, '#5E7A5A');
  merge('terrace-walls', walls, '#ECEAF0');
  merge('terrace-caps', caps, LAVENDER);
  merge('terrace-joints', lines, '#D6D2DE', false);
  merge('terrace-planters', boxes, WHITE);
  merge('terrace-greens', greens, '#5E9F55', false);
  ['#FF9EC4', '#FFE07A', '#FFFFFF'].forEach((hex, i) => merge(`terrace-blooms-${i}`, blooms[i]!, hex, false));
}

// 뒤·양옆 덤불 울타리, 앞쪽은 흰 난간과 원작의 각진 네온 아치 입구
function buildHedgeAndGate({ scene, merge, rand, mat, cast, lumpy, glow, fitText }: Kit) {
  const edge = HALF;
  const hedge: Mesh[] = [];
  for (let t = -edge; t <= edge; t += 1) {
    for (const [x, z] of [[t, edge], [-edge, t], [edge, t]] as const) {
      const size = 1.5 + rand() * .6;
      const ball = lumpy('hedge', size, .2, .85);
      ball.position.set(x, H(x, z) + size * .32, z);
      hedge.push(ball);
    }
  }
  merge('hedge', hedge, '#5E9A55');
  const fence: Mesh[] = [];
  for (let x = -edge; x <= edge + .01; x += 2) {
    if (Math.abs(x) < GATE.gap + 1.2) continue;
    const post = MeshBuilder.CreateBox('fence-post', { width: .16, height: .95, depth: .16 }, scene);
    post.position.set(x, .475, -edge);
    fence.push(post);
  }
  for (const side of [-1, 1]) {
    const rail = MeshBuilder.CreateBox('fence-rail', { width: edge - GATE.gap - .6, height: .08, depth: .08 }, scene);
    rail.position.set(side * (edge + GATE.gap + .6) / 2, .9, -edge);
    fence.push(rail);
  }
  merge('front-fence', fence, WHITE);
  // 각진 아치: 기울어진 기둥 두 개 위에 아래쪽이 분홍·보라로 빛나는 지붕판
  for (const side of [-1, 1]) {
    const leg = cast(MeshBuilder.CreateBox('gate-leg', { width: .5, height: 4.2, depth: .7 }, scene));
    leg.position.set(side * (GATE.gap + .3), 2.05, -edge);
    leg.rotation.z = side * .12;
    leg.material = mat(LAVENDER);
  }
  const roof = cast(MeshBuilder.CreateBox('gate-roof', { width: GATE.gap * 2 + 2.6, height: .35, depth: 1.6 }, scene));
  roof.position.set(0, 4.25, -edge);
  roof.material = mat(WHITE);
  const glowPanel = MeshBuilder.CreateBox('gate-glow', { width: GATE.gap * 2 + 2.3, height: .05, depth: 1.35 }, scene);
  glowPanel.position.set(0, 4.05, -edge);
  glowPanel.material = mat(NEON, .9);
  glow.addIncludedOnlyMesh(glowPanel);
  const texture = new DynamicTexture('gate-sign', { width: 1024, height: 200 }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#5A4B9A'; ctx.fillRect(0, 0, 1024, 200);
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fitText(ctx, 'DOROLAND PET GARDEN', 1024 - 120, 96);
  ctx.fillText('DOROLAND PET GARDEN', 512, 104);
  texture.update();
  const signMaterial = new StandardMaterial('gate-sign', scene);
  signMaterial.diffuseTexture = texture;
  signMaterial.emissiveColor = new Color3(.25, .25, .25);
  signMaterial.specularColor = Color3.Black();
  signMaterial.backFaceCulling = false;
  const sign = MeshBuilder.CreatePlane('gate-sign', { width: GATE.gap * 2 + 1.8, height: .36 * (GATE.gap * 2 + 1.8) / (1024 / 200) * 1.4 }, scene);
  sign.position.set(0, 4.25, -edge - .81);
  sign.material = signMaterial;
}


// 원작의 분홍빛 보도: 흰 연석을 두른 넓은 길. 지형 높이를 따라가고, 물길은 다리로 건넙니다.
// 길 한 줄을 끊김 없는 띠(ribbon) 하나로 만들어 곡선·이음매에서 틈이나 겹침이 생기지 않습니다.
// 연석은 광장·포털 광장·다른 길과 만나는 곳, 다리 위에서는 끊어 길이 자연스럽게 합쳐집니다.
function buildPavedPaths({ scene, merge, place }: Kit) {
  const slabs: Mesh[] = [], curbs: Mesh[] = [], stoneCurbs: Mesh[] = [];
  const width = PATH_WIDTH, half = width / 2, curbHalf = .08;
  const ribbon = (name: string, paths: Vector3[][]) => MeshBuilder.CreateRibbon(name, { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const inPlaza = (x: number, z: number) => Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r - .05 || Math.hypot(x - PORTAL.x, z - PORTAL.z) < PORTAL_PLAZA_R - .05;
  const bridgeAt = (x: number, z: number, margin: number) => BRIDGES.some(b => {
    const dx = x - b.x, dz = z - b.z;
    const along = dx * Math.sin(b.heading) + dz * Math.cos(b.heading), across = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
    return Math.abs(along) < BRIDGE.length / 2 - .12 && Math.abs(across) < half + margin;
  });
  // 성역 돌계단(왼쪽 경사로) 위에서는 보도를 끊습니다.
  const stairs = RAMPS[SPIRIT_RAMP]!;
  // 계단부터 그 위(산신각까지의 돌길은 petSanctuary가 그림)는 보도를 그리지 않습니다.
  const onStairs = (x: number, z: number) => Math.abs(x - stairs.x) < stairs.hw + .3 && z > stairs.z0;
  // 다리를 건넌 뒤 돌계단으로 이어지는 구간은 계단 위 돌길과 같은 박석 바닥, 짙은 돌 연석입니다.
  const spiritAt = (self: number, x: number) => BRIDGES.some(b => b.line === self && x < b.x - .5);
  // 길 바닥(끝이 반듯한 띠)까지의 거리: 양 끝에서는 길 밖으로 둥글게 넓히지 않는다
  const slabDist = (line: readonly (readonly [number, number])[], x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i]!, [bx, bz] = line[i + 1]!;
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = ((x - ax) * dx + (z - az) * dz) / len2;
      if ((i === 0 && t < 0) || (i === line.length - 2 && t > 1)) continue;
      const c = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - ax - dx * c, z - az - dz * c));
    }
    return best;
  };
  PATH_LINES.forEach((line, self) => {
    // 각 점의 진행 방향 오른쪽 단위 벡터
    const right = line.map((_, k) => {
      const a = line[Math.max(k - 1, 0)]!, b = line[Math.min(k + 1, line.length - 1)]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[1] - a[1]) / len, -(b[0] - a[0]) / len] as const;
    });
    // 소수 위치 f(점 번호 + 비율)에서 가운데 선을 offset만큼 옆으로 옮긴 점
    const at = (f: number, offset: number): [number, number] => {
      const k = Math.min(Math.floor(f), line.length - 2), t = f - k;
      const [ax, az] = line[k]!, [bx, bz] = line[k + 1]!;
      const [rx0, rz0] = right[k]!, [rx1, rz1] = right[k + 1]!;
      const rx = rx0 + (rx1 - rx0) * t, rz = rz0 + (rz1 - rz0) * t, rl = Math.hypot(rx, rz) || 1;
      return [ax + (bx - ax) * t + rx / rl * offset, az + (bz - az) * t + rz / rl * offset];
    };
    const v = (f: number, offset: number, lift: number) => { const [x, z] = at(f, offset); return new Vector3(x, H(x, z) + lift, z); };
    // cut이 참인 구간을 잘라 낸 연속 구간들. 경계는 이분 탐색으로 정확히 맞춥니다.
    const runs = (cut: (f: number) => boolean) => {
      const edge = (lo: number, hi: number) => {
        const loCut = cut(lo);
        for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (cut(m) === loCut) lo = m; else hi = m; }
        return (lo + hi) / 2;
      };
      const result: number[][] = [];
      let run: number[] | null = null;
      for (let k = 0; k < line.length; k++) {
        if (!cut(k)) {
          if (!run) run = k > 0 ? [edge(k - 1, k)] : [];
          run.push(k);
        } else if (run) {
          run.push(edge(k - 1, k));
          result.push(run);
          run = null;
        }
      }
      if (run) result.push(run);
      return result.filter(r => r.length >= 2 && r[r.length - 1]! - r[0]! > .5);
    };
    for (const run of runs(f => { const [x, z] = at(f, 0); return bridgeAt(x, z, 0) || onStairs(x, z); })) {
      const slab = ribbon('path-slab', [run.map(f => v(f, -half, .05)), run.map(f => v(f, half, .05))]);
      if (!spiritAt(self, at(run[0]!, 0)[0])) { slabs.push(slab); continue; }
      // 돌 크기가 계단 위 돌길과 같아지도록 구간 길이로 반복 횟수를 정합니다(무늬 한 장 = 길이 약 4.8m).
      let length = 0;
      for (let i = 1; i < run.length; i++) { const [ax, az] = at(run[i - 1]!, 0), [bx, bz] = at(run[i]!, 0); length += Math.hypot(bx - ax, bz - az); }
      // DynamicTexture.clone()은 그림을 복사하지 않아 준비가 끝나지 않으므로 구간마다 새로 그립니다.
      const texture = stoneWalkTexture(scene, true);
      texture.uScale = Math.max(1, Math.round(length / 4.8));
      const material = new StandardMaterial('spirit-stone-walk', scene);
      material.diffuseTexture = texture;
      material.specularColor = Color3.Black();
      slab.material = material;
      slab.receiveShadows = true;
    }
    for (const side of [-1, 1]) {
      const offset = side * (half - curbHalf);
      const cut = (f: number) => {
        const [x, z] = at(f, offset);
        // 다른 길 바닥 위면 끊는다. 길 바닥은 끝이 반듯하므로 끝을 둥글게 보지 않고(slabDist),
        // 상대 연석 가운데까지 이어서 두 연석이 모서리에서 틈 없이 맞물리게 한다.
        return inPlaza(x, z) || bridgeAt(x, z, .3) || onStairs(x, z) || PATH_LINES.some((other, j) => j !== self && slabDist(other, x, z) < half - curbHalf);
      };
      for (const run of runs(cut)) {
        const outer = offset + side * curbHalf, inner = offset - side * curbHalf;
        const target = spiritAt(self, at(run[0]!, 0)[0]) ? stoneCurbs : curbs;
        target.push(ribbon('path-curb', [
          run.map(f => v(f, outer, -.02)), run.map(f => v(f, outer, .12)), run.map(f => v(f, inner, .12)), run.map(f => v(f, inner, -.02)),
        ]));
        // 연석 끝 마구리
        for (const f of [run[0]!, run[run.length - 1]!]) {
          const [x, z] = at(f, offset), [dx, dz] = at(Math.min(f + .5, line.length - 1.001), offset), [ex, ez] = at(Math.max(f - .5, 0), offset);
          const cap = MeshBuilder.CreateBox('path-curb-cap', { width: curbHalf * 2, height: .14, depth: .02 }, scene);
          place(x, H(x, z) + .05, z, Math.atan2(dx - ex, dz - ez), [cap]);
          target.push(cap);
        }
      }
    }
  });
  merge('paths', slabs, PAVING, false);
  merge('path-curbs', curbs, CURB, false);
  merge('spirit-path-curbs', stoneCurbs, '#6F7672', false);
  // 붉은 전통 다리: 돌기둥 위에 붉은 보와 상판을 얹고, 붉은 난간 기둥 사이에 청록 단청 살창을 끼웁니다.
  // 바닥 높이는 petRoomMap의 bridgeDeck과 같아서, 캐릭터가 다리 위를 걸어 넘어갑니다.
  const reds: Mesh[] = [], decks: Mesh[] = [], stones: Mesh[] = [], panels: Mesh[] = [], jade: Mesh[] = [];
  const L = BRIDGE.length, deckW = width + .3, segments = 12;
  const deckY = (t: number) => bridgeDeck(Math.max(0, Math.min(1, t)));
  const slanted = (list: Mesh[], name: string, x: number, t0: number, t1: number, lift: number, w: number, h: number) => {
    const z0 = (t0 - .5) * L, z1 = (t1 - .5) * L, h0 = deckY(t0) + lift, h1 = deckY(t1) + lift;
    const box = MeshBuilder.CreateBox(name, { width: w, height: h, depth: Math.hypot(z1 - z0, h1 - h0) + .02 }, scene);
    box.position.set(x, (h0 + h1) / 2, (z0 + z1) / 2);
    box.rotation.x = -Math.atan2(h1 - h0, z1 - z0);
    list.push(box);
    return box;
  };
  for (const b of BRIDGES) {
    const y = H(b.x, b.z);
    const pieces: Mesh[][] = [[], [], [], [], []];
    const [red, deck, stone, panel, cap] = pieces as [Mesh[], Mesh[], Mesh[], Mesh[], Mesh[]];
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments, t1 = (i + 1) / segments;
      slanted(deck, 'bridge-deck', 0, t0, t1, -.06, deckW, .12);
      // 상판 옆면의 붉은 테두리 보
      for (const side of [-1, 1]) slanted(red, 'bridge-fascia', side * (deckW / 2 + .04), t0, t1, -.1, .1, .26);
    }
    // 돌기둥과 그 위의 붉은 가로보
    for (const t of [.15, .5, .85]) {
      const top = deckY(t) - .12, zc = (t - .5) * L;
      for (const side of [-1, 1]) {
        const pier = MeshBuilder.CreateCylinder('bridge-pier', { diameter: .3, height: top + .25, tessellation: 12 }, scene);
        pier.position.set(side * (deckW / 2 - .25), (top - .25) / 2, zc);
        stone.push(pier);
      }
      const beam = MeshBuilder.CreateBox('bridge-beam', { width: deckW + .3, height: .14, depth: .2 }, scene);
      beam.position.set(0, top - .05, zc);
      red.push(beam);
    }
    // 양끝 받침돌
    for (const end of [-1, 1]) {
      const abutment = MeshBuilder.CreateBox('bridge-abutment', { width: deckW + .2, height: .4, depth: .4 }, scene);
      abutment.position.set(0, .02, end * (L / 2 - .12));
      stone.push(abutment);
    }
    // 난간: 붉은 기둥(청록 머리장식), 위·가운데·아래 난간대, 그 사이 청록 살창
    for (const side of [-1, 1]) {
      const sx = side * (width / 2 + .08);
      const posts = 7;
      for (let i = 0; i < posts; i++) {
        const t = i / (posts - 1), h = deckY(t), zc = (t - .5) * L;
        const post = MeshBuilder.CreateBox('bridge-post', { width: .13, height: .82, depth: .13 }, scene);
        post.position.set(sx, h + .41, zc);
        red.push(post);
        const knob = MeshBuilder.CreateSphere('bridge-post-knob', { diameter: .15, segments: 8 }, scene);
        knob.scaling.y = 1.3;
        knob.position.set(sx, h + .9, zc);
        cap.push(knob);
      }
      for (let i = 0; i < posts - 1; i++) {
        const t0 = i / (posts - 1), t1 = (i + 1) / (posts - 1);
        slanted(red, 'bridge-rail-top', sx, t0, t1, .74, .12, .08);
        slanted(red, 'bridge-rail-mid', sx, t0, t1, .42, .09, .06);
        slanted(red, 'bridge-rail-low', sx, t0, t1, .08, .09, .06);
        // 위 난간대와 가운데 난간대 사이의 살창
        slanted(panel, 'bridge-panel', sx, t0 + .02, t1 - .02, .58, .03, .26);
      }
    }
    reds.push(...place(b.x, y, b.z, b.heading, red));
    decks.push(...place(b.x, y, b.z, b.heading, deck));
    stones.push(...place(b.x, y, b.z, b.heading, stone));
    panels.push(...place(b.x, y, b.z, b.heading, panel));
    jade.push(...place(b.x, y, b.z, b.heading, cap));
  }
  merge('bridge-red', reds, '#B8452F');
  merge('bridge-deck', decks, '#8E4634');
  merge('bridge-stone', stones, '#9C9A94');
  merge('bridge-knobs', jade, '#3E8E7E', false);
  // 청록 바탕에 연한 빗살 무늬를 넣은 단청 살창
  const lattice = new DynamicTexture('bridge-lattice', { width: 256, height: 64 }, scene, true);
  const lctx = lattice.getContext() as CanvasRenderingContext2D;
  lctx.fillStyle = '#3E8E7E'; lctx.fillRect(0, 0, 256, 64);
  lctx.strokeStyle = '#BFE3D2'; lctx.lineWidth = 3;
  for (let i = -64; i < 256; i += 16) { lctx.beginPath(); lctx.moveTo(i, 64); lctx.lineTo(i + 64, 0); lctx.moveTo(i, 0); lctx.lineTo(i + 64, 64); lctx.stroke(); }
  lctx.strokeStyle = '#2C6B5E'; lctx.lineWidth = 8; lctx.strokeRect(0, 0, 256, 64);
  lattice.update();
  const latticeMaterial = new StandardMaterial('bridge-lattice', scene);
  latticeMaterial.diffuseTexture = lattice;
  latticeMaterial.specularColor = Color3.Black();
  merge('bridge-panels', panels, latticeMaterial, false);
}

// 광장: 원작처럼 둥근 흰 화단의 큰 나무와 작은 흰 화분, 공중의 달걀 조명과 홀로그램
function buildPlaza({ scene, mat, cast, merge, eggLamp, hologram, rand }: Kit) {
  const y = H(PLAZA.x, PLAZA.z);
  const floor = MeshBuilder.CreateCylinder('plaza-floor', { diameter: PLAZA.r * 2, height: .08, tessellation: 64 }, scene);
  floor.position.set(PLAZA.x, y + .04, PLAZA.z);
  floor.material = (() => {
    const texture = new DynamicTexture('plaza-tiles', { width: 512, height: 512 }, scene, true);
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = PAVING; ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#F6E6E0'; ctx.lineWidth = 3;
    for (let r = 40; r < 256; r += 40) { ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(256 + Math.cos(a) * 40, 256 + Math.sin(a) * 40); ctx.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256); ctx.stroke(); }
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(256, 256, 250, 0, Math.PI * 2); ctx.stroke();
    texture.update();
    const material = new StandardMaterial('plaza-tiles', scene);
    material.diffuseTexture = texture;
    material.specularColor = Color3.Black();
    return material;
  })();
  floor.receiveShadows = true;
  // 큰 나무를 심은 둥근 흰 화단(금색 띠)
  const bed = cast(MeshBuilder.CreateCylinder('plaza-tree-bed', { diameterTop: 3.4, diameterBottom: 3.6, height: .7, tessellation: 40 }, scene));
  bed.position.set(PLAZA.x, y + .35, PLAZA.z);
  bed.material = mat(WHITE);
  const soil = MeshBuilder.CreateCylinder('plaza-tree-soil', { diameter: 3.1, height: .05, tessellation: 40 }, scene);
  soil.position.set(PLAZA.x, y + .7, PLAZA.z);
  soil.material = mat('#6B5140');
  const band = MeshBuilder.CreateTorus('plaza-tree-band', { diameter: 3.55, thickness: .07, tessellation: 48 }, scene);
  band.position.set(PLAZA.x, y + .55, PLAZA.z);
  band.material = mat(GOLD);
  // 작은 흰 화분
  const bowls: Mesh[] = [], bands: Mesh[] = [], shrubs: Mesh[] = [];
  for (const b of PLAZA_BOWLS) {
    const by = H(b.x, b.z);
    const bowl = MeshBuilder.CreateCylinder('plaza-bowl', { diameterTop: 1.2, diameterBottom: .8, height: .7, tessellation: 28 }, scene);
    bowl.position.set(b.x, by + .35, b.z);
    bowls.push(bowl);
    const ring = MeshBuilder.CreateTorus('plaza-bowl-band', { diameter: 1.14, thickness: .05, tessellation: 28 }, scene);
    ring.position.set(b.x, by + .58, b.z);
    bands.push(ring);
    const shrub = MeshBuilder.CreateSphere('plaza-bowl-shrub', { diameter: .95, segments: 10 }, scene);
    shrub.scaling.y = .75;
    shrub.position.set(b.x, by + .82, b.z);
    shrubs.push(shrub);
  }
  merge('plaza-bowls', bowls, WHITE);
  merge('plaza-bowl-bands', bands, GOLD, false);
  merge('plaza-bowl-shrubs', shrubs, '#5FA35A');
  // 공중의 달걀 조명과 홀로그램 패널
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + .4;
    eggLamp(PLAZA.x + Math.cos(a) * 4.4, y + 3.6 + rand() * .8, PLAZA.z + Math.sin(a) * 4.4, .9 + rand() * .3);
  }
  for (const [dx, dz, h, tint, turn] of [[-2.5, -3, 3.1, 'cyan', .3], [3.2, -1.5, 2.6, 'pink', -.5], [.5, 3.6, 3.4, 'cyan', 2.9]] as const) {
    const panel = hologram(`plaza-holo-${dx}`, 1.4, .8, new Vector3(PLAZA.x + dx, y + h, PLAZA.z + dz), tint);
    panel.rotation.y = turn;
  }
}

// 포털 광장(1단 테라스)
function buildPortalPlaza({ scene, mat, glow, cast, eggLamp }: Kit) {
  const y = H(PORTAL.x, PORTAL.z);
  const plaza = MeshBuilder.CreateCylinder('portal-plaza', { diameter: PORTAL_PLAZA_R * 2, height: .1, tessellation: 48 }, scene);
  plaza.position.set(PORTAL.x, y + .05, PORTAL.z);
  plaza.material = mat(PAVING);
  plaza.receiveShadows = true;
  const rim = MeshBuilder.CreateTorus('portal-plaza-rim', { diameter: PORTAL_PLAZA_R * 2, thickness: .12, tessellation: 48 }, scene);
  rim.position.set(PORTAL.x, y + .1, PORTAL.z);
  rim.material = mat(CURB);
  for (const side of [-1, 1]) {
    const lx = PORTAL.x + side * 2.6, lz = PORTAL.z - .8;
    const post = cast(MeshBuilder.CreateCylinder('lamp-post', { diameter: .12, height: 3, tessellation: 10 }, scene));
    post.position.set(lx, y + 1.5, lz);
    post.material = mat(WHITE);
    const head = MeshBuilder.CreateCylinder('lamp-head', { diameter: .55, height: .1, tessellation: 20 }, scene);
    head.position.set(lx, y + 3.02, lz);
    head.material = mat(WHITE);
    const light = MeshBuilder.CreateDisc('lamp-light', { radius: .22, tessellation: 20 }, scene);
    light.rotation.x = Math.PI / 2;
    light.position.set(lx, y + 2.96, lz);
    light.material = mat('#FFF1C9', 1);
    glow.addIncludedOnlyMesh(light);
  }
  eggLamp(PORTAL.x - 3.8, y + 3.8, PORTAL.z + 1.2, 1);
  eggLamp(PORTAL.x + 3.9, y + 4.2, PORTAL.z + .6, .85);
}

// 아래층 오른쪽: 원작 광장의 흰 상점 건물처럼 평지붕 흰 건물, 떠 있는 홀로그램 간판
function buildShop({ scene, mat, cast, merge, hologram, eggLamp }: Kit) {
  const { x, z } = STATION;
  const back = cast(MeshBuilder.CreateBox('shop-back', { width: 5.8, height: 3.4, depth: .4 }, scene));
  back.position.set(x, 1.7, z + 1.5);
  back.material = mat(WHITE);
  for (const side of [-1, 1]) {
    const wing = cast(MeshBuilder.CreateBox('shop-side', { width: .4, height: 3.4, depth: 3.2 }, scene));
    wing.position.set(x + side * 2.7, 1.7, z);
    wing.material = mat(WHITE);
  }
  const roof = cast(MeshBuilder.CreateBox('shop-roof', { width: 6.4, height: .3, depth: 3.8 }, scene));
  roof.position.set(x, 3.55, z - .1);
  roof.material = mat(WHITE);
  const trim = MeshBuilder.CreateBox('shop-roof-trim', { width: 6.45, height: .1, depth: 3.85 }, scene);
  trim.position.set(x, 3.38, z - .1);
  trim.material = mat(LAVENDER);
  // 선반과 상품
  const shelves: Mesh[] = [];
  for (const y of [1.7, 2.45]) {
    const shelf = MeshBuilder.CreateBox('shop-shelf', { width: 4.6, height: .08, depth: .45 }, scene);
    shelf.position.set(x, y, z + 1.15);
    shelves.push(shelf);
  }
  merge('shop-shelves', shelves, '#E6E2EA', false);
  ['#8FA8E8', '#E99AC4', '#FFD86E', '#9ED8B4', '#B9A3E3', '#86E4F2'].forEach((hex, i) => {
    for (const y of [1.9, 2.65]) {
      const jar = MeshBuilder.CreateCylinder('shop-goods', { diameter: .32, height: .34, tessellation: 12 }, scene);
      jar.position.set(x - 1.9 + i * .76, y, z + 1.15);
      jar.material = mat(hex);
    }
  });
  // 판매대: 흰 몸체, 금색 띠, 하늘색 상판
  const counter = cast(MeshBuilder.CreateBox('shop-counter', { width: 4.6, height: 1.05, depth: 1 }, scene));
  counter.position.set(x, .525, z - 1.2);
  counter.material = mat(WHITE);
  const counterBand = MeshBuilder.CreateBox('shop-counter-band', { width: 4.62, height: .08, depth: 1.02 }, scene);
  counterBand.position.set(x, .8, z - 1.2);
  counterBand.material = mat(GOLD);
  const top = cast(MeshBuilder.CreateBox('shop-counter-top', { width: 4.8, height: .1, depth: 1.15 }, scene));
  top.position.set(x, 1.1, z - 1.2);
  top.material = mat('#BFE3F5');
  for (const [dx, hex] of [[-1.6, '#E99AC4'], [-1.25, '#8FA8E8'], [-1.42, '#FFD86E']] as const) {
    const ball = MeshBuilder.CreateSphere('shop-ball', { diameter: .3, segments: 10 }, scene);
    ball.position.set(x + dx, 1.3, z - 1.25 + (hex === '#FFD86E' ? .25 : 0));
    ball.material = mat(hex);
  }
  for (const [dx, hex] of [[1.1, '#9ED8B4'], [1.55, '#B9A3E3']] as const) {
    const bag = cast(MeshBuilder.CreateBox('shop-bag', { width: .36, height: .48, depth: .26 }, scene));
    bag.position.set(x + dx, 1.39, z - 1.1);
    bag.material = mat(hex);
  }
  // 관리 로봇
  const robot = new TransformNode('shop-robot', scene);
  robot.position.set(x - .3, 0, z - .1);
  const body = cast(MeshBuilder.CreateCapsule('robot-body', { radius: .38, height: 1.3 }, scene));
  body.position.y = .85;
  body.material = mat('#FFFFFF');
  body.parent = robot;
  const head = new TransformNode('robot-head', scene);
  head.position.y = 1.85;
  head.parent = robot;
  const skull = cast(MeshBuilder.CreateSphere('robot-skull', { diameter: .8, segments: 16 }, scene));
  skull.scaling.set(1.15, .9, 1);
  skull.material = mat('#FFFFFF');
  skull.parent = head;
  const face = MeshBuilder.CreateSphere('robot-face', { diameter: .62, segments: 16 }, scene);
  face.scaling.set(1.15, .72, .5);
  face.position.z = -.24;
  face.material = mat('#1E242C');
  face.parent = head;
  const eyes: Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = MeshBuilder.CreateDisc('robot-eye', { radius: .065, tessellation: 14 }, scene);
    eye.position.set(side * .14, .02, -.405);
    eye.material = mat(HOLO, 1);
    eye.parent = head;
    eyes.push(eye);
    const ear = MeshBuilder.CreateCylinder('robot-ear', { diameter: .28, height: .12, tessellation: 18 }, scene);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(side * .47, 0, 0);
    ear.material = mat('#5C8FE0');
    ear.parent = head;
  }
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    robot.position.y = Math.sin(t * 2) * .03;
    head.rotation.y = Math.sin(t * .7) * .35;
    const blink = (t % 3.6) < .12 ? .15 : 1;
    eyes.forEach(eye => { eye.scaling.y = blink; });
  });
  hologram('shop-holo', 3, 1, new Vector3(x, 4.6, z - 1.6), 'cyan', (ctx, w, h) => {
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('PET SHOP', w / 2, h / 2 - 12);
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('펫 케어 스테이션', w / 2, h / 2 + 46);
  });
  eggLamp(x - 3.9, 3.4, z - 2.2, .8);
}

// 1단 테라스의 샘 → 돌 배수구 폭포 → 반원 수반 → 물길 → 연못
function buildPondAndWaterfall(kit: Kit) {
  const { merge, rand } = kit;
  buildPond(kit);
  buildStream(kit);
  // 폭포 아래 소: 폭포(petSanctuary의 buildCascade)가 흘러드는 북쪽만 비우고 돌을 두릅니다.
  const basinRim: Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    // 북쪽(폭포가 들어오는 곳)과 남쪽(물길이 나가는 곳)은 비웁니다.
    if (Math.abs(Math.sin(a)) > .82) continue;
    if (rand() < .25) continue;
    const rock = boulder(kit, .3 + rand() * .4, .55);
    const out = POOL.r + .1 + rand() * .15, rx = POOL.x + Math.cos(a) * out, rz = POOL.z + Math.sin(a) * out;
    rock.position.set(rx, H(rx, rz) + .12, rz);
    basinRim.push(rock);
  }
  paint(merge('basin-rim', basinRim, '#FFFFFF'), rockColor(H, .2));
  // 물길 양옆의 돌(물길 자체는 petStream.ts)
  const banks: Mesh[] = [];
  STREAM.forEach(([px, pz], i) => {
    const next = STREAM[Math.min(i + 1, STREAM.length - 1)]!, prev = STREAM[Math.max(i - 1, 0)]!;
    const heading = Math.atan2(next[0] - prev[0], next[1] - prev[1]);
    if (i % 2 === 0 && i > 1 && !BRIDGES.some(b => Math.hypot(px - b.x, pz - b.z) < 2.2)) for (const side of [-1, 1]) {
      if (rand() < .3) continue;
      const rock = boulder(kit, .26 + rand() * .22, .6);
      const out = side * (.62 + rand() * .2), bx = px + Math.cos(heading) * out, bz = pz - Math.sin(heading) * out;
      rock.position.set(bx, H(bx, bz) + .07, bz);
      banks.push(rock);
    }
  });
  paint(merge('stream-banks', banks, '#FFFFFF', false), rockColor(H, .4));
}

// 아래층 오른쪽 앞: 원작 공원의 회전목마를 작게 옮긴 펫 회전목마(보라·분홍 줄무늬 지붕)
function buildCarousel({ scene, mat, cast, pattern, glow }: Kit) {
  const { x, z, r } = CAROUSEL;
  const y = H(x, z);
  const base = cast(MeshBuilder.CreateCylinder('carousel-base', { diameter: r * 2, height: .35, tessellation: 40 }, scene));
  base.position.set(x, y + .175, z);
  base.material = mat(WHITE);
  const baseBand = MeshBuilder.CreateTorus('carousel-base-band', { diameter: r * 2, thickness: .1, tessellation: 48 }, scene);
  baseBand.position.set(x, y + .3, z);
  baseBand.material = mat(GOLD);
  const pole = cast(MeshBuilder.CreateCylinder('carousel-pole', { diameter: .5, height: 3, tessellation: 20 }, scene));
  pole.position.set(x, y + 1.75, z);
  pole.material = mat(LAVENDER);
  const roof = cast(MeshBuilder.CreateCylinder('carousel-roof', { diameterTop: 0, diameterBottom: r * 2.3, height: 1.4, tessellation: 16 }, scene));
  roof.position.set(x, y + 3.75, z);
  roof.material = pattern('carousel-stripes', ctx => {
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#F2A6D8' : PURPLE; ctx.fillRect(i * 16, 0, 16, 256); }
  });
  const rim = MeshBuilder.CreateTorus('carousel-rim', { diameter: r * 2.3, thickness: .14, tessellation: 48 }, scene);
  rim.position.set(x, y + 3.05, z);
  rim.material = mat(GOLD);
  const finial = MeshBuilder.CreateSphere('carousel-finial', { diameter: .3, segments: 10 }, scene);
  finial.position.set(x, y + 4.55, z);
  finial.material = mat(GOLD);
  const lights = MeshBuilder.CreateTorus('carousel-lights', { diameter: r * 2.25, thickness: .05, tessellation: 48 }, scene);
  lights.position.set(x, y + 2.95, z);
  lights.material = mat('#FFE6B0', .9);
  glow.addIncludedOnlyMesh(lights);
  // 천천히 도는 동물 자리(공 모양 의자와 기둥)
  const ride = new TransformNode('carousel-ride', scene);
  ride.position.set(x, y, z);
  const colors = ['#8FA8E8', '#E99AC4', '#FFD86E', '#9ED8B4'];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const seat = cast(MeshBuilder.CreateCapsule('carousel-seat', { radius: .26, height: .9, orientation: new Vector3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2)) }, scene));
    seat.position.set(Math.cos(a) * (r - .7), 1.1, Math.sin(a) * (r - .7));
    seat.material = mat(colors[i % colors.length]!);
    seat.parent = ride;
    const rod = MeshBuilder.CreateCylinder('carousel-rod', { diameter: .06, height: 2.6, tessellation: 6 }, scene);
    rod.position.set(Math.cos(a) * (r - .7), 1.7, Math.sin(a) * (r - .7));
    rod.material = mat(GOLD);
    rod.parent = ride;
  }
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    ride.rotation.y = t * .35;
    ride.getChildMeshes().forEach((child, i) => { if (child.name === 'carousel-seat') child.position.y = 1.1 + Math.sin(t * 2 + i) * .15; });
  });
}

// 2단 전망대: 원작의 연보라 관람차, 망원경
function buildLookout({ scene, mat, merge, strut, cast }: Kit) {
  const deckY = UPPER.height;
  const base = new Vector3(WHEEL.x, deckY, WHEEL.z);
  const pad = cast(MeshBuilder.CreateCylinder('wheel-pad', { diameter: 5, height: .16, tessellation: 40 }, scene));
  pad.position.set(base.x, deckY + .08, base.z);
  pad.material = mat(PAVING);
  const hub = base.add(new Vector3(0, 3.6, 0));
  const radius = 2.9;
  const legs: Mesh[] = [];
  for (const side of [-1, 1]) {
    legs.push(strut('wheel-leg', base.add(new Vector3(-1.6, 0, side * .7)), hub.add(new Vector3(0, 0, side * .4)), .18));
    legs.push(strut('wheel-leg', base.add(new Vector3(1.6, 0, side * .7)), hub.add(new Vector3(0, 0, side * .4)), .18));
  }
  merge('wheel-legs', legs, PURPLE);
  const wheel = new TransformNode('ferris-wheel', scene);
  wheel.position.copyFrom(hub);
  const spin: Mesh[] = [];
  for (const side of [-.28, .28]) {
    const ring = MeshBuilder.CreateTorus('wheel-ring', { diameter: radius * 2, thickness: .14, tessellation: 56 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = side;
    spin.push(ring);
    const inner = MeshBuilder.CreateTorus('wheel-ring', { diameter: radius * 1.3, thickness: .08, tessellation: 48 }, scene);
    inner.rotation.x = Math.PI / 2;
    inner.position.z = side;
    spin.push(inner);
  }
  const cabins = 10;
  for (let i = 0; i < cabins; i++) {
    const a = i / cabins * Math.PI * 2;
    const rim = new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    spin.push(strut('wheel-spoke', new Vector3(0, 0, -.28), rim.add(new Vector3(0, 0, -.28)), .06));
    spin.push(strut('wheel-spoke', new Vector3(0, 0, .28), rim.add(new Vector3(0, 0, .28)), .06));
  }
  const frame = merge('wheel-frame', spin, LAVENDER, false);
  if (frame) frame.parent = wheel;
  const hubCap = MeshBuilder.CreateCylinder('wheel-hub', { diameter: .7, height: .8, tessellation: 24 }, scene);
  hubCap.rotation.x = Math.PI / 2;
  hubCap.position.copyFrom(hub);
  hubCap.material = mat(PURPLE);
  const gondolas = Array.from({ length: cabins }, (_, i) => {
    const gondola = cast(MeshBuilder.CreateCapsule('wheel-cabin', { radius: .32, height: .8 }, scene));
    gondola.material = mat(i % 2 ? '#8FA8E8' : PURPLE);
    return gondola;
  });
  scene.onBeforeRenderObservable.add(() => {
    const angle = performance.now() / 1000 * .2;
    wheel.rotation.z = angle;
    gondolas.forEach((gondola, i) => {
      const a = angle + i / cabins * Math.PI * 2;
      gondola.position.set(hub.x + Math.cos(a) * radius, hub.y + Math.sin(a) * radius - .42, hub.z);
    });
  });
  const ty = H(TELESCOPE.x, TELESCOPE.z);
  const stand = cast(MeshBuilder.CreateCylinder('telescope-stand', { diameterTop: .18, diameterBottom: .45, height: 1.1, tessellation: 12 }, scene));
  stand.position.set(TELESCOPE.x, ty + .55, TELESCOPE.z);
  stand.material = mat(WHITE);
  const scope = cast(MeshBuilder.CreateCylinder('telescope-tube', { diameterTop: .32, diameterBottom: .22, height: 1, tessellation: 16 }, scene));
  scope.rotation.x = -Math.PI / 2 + .35;
  scope.position.set(TELESCOPE.x, ty + 1.25, TELESCOPE.z - .2);
  scope.material = mat('#6E9FE6');
}

// 나무 잎 색: 아래쪽(그늘)부터 위쪽(햇빛)까지 3단계. 원작처럼 초록 사이사이 보라색 잎 나무를 섞습니다.
const LEAF_GREEN = ['#4C8A47', '#5FA155', '#79B866'];
const LEAF_PURPLE = ['#6C55A8', '#8468BF', '#9F86D4'];
const LEAF_BLOSSOM = ['#D98FB0', '#E7A9C4', '#F2C6D8'];
const LEAF_PINE = ['#3C6B45', '#4A7C51', '#5A8C5D'];

function buildTrees({ scene, merge, rand }: Kit) {
  const bark: Mesh[] = [];
  const leaves = new Map<string, Mesh[]>();
  const leaf = (hex: string, mesh: Mesh) => { const list = leaves.get(hex) ?? []; list.push(mesh); leaves.set(hex, list); };
  const clump = (x: number, y: number, z: number, radius: number, stretch: number) => {
    const mesh = MeshBuilder.CreateSphere('tree-leaves', { diameter: radius * 2, segments: 9, updatable: true }, scene);
    const salt = rand() * 100;
    mesh.updateMeshPositions(positions => {
      for (let i = 0; i < positions.length; i += 3) {
        const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
        const noise = Math.sin(px * 7.1 + salt) * Math.cos(py * 6.3 - salt) * Math.sin(pz * 5.7 + salt * .5);
        const k = 1 + noise * .16;
        positions[i] = px * k; positions[i + 1] = py * k * stretch; positions[i + 2] = pz * k;
      }
    }, true);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.position.set(x, y, z);
    return mesh;
  };
  const limb = (from: Vector3, length: number, tilt: number, heading: number, bottom: number, top: number) => {
    const mesh = MeshBuilder.CreateCylinder('tree-bark', { diameterTop: top, diameterBottom: bottom, height: length, tessellation: 7 }, scene);
    const direction = new Vector3(-Math.sin(tilt) * Math.cos(heading), Math.cos(tilt), Math.sin(tilt) * Math.sin(heading));
    mesh.rotation.set(0, heading, tilt);
    mesh.position.copyFrom(from.add(direction.scale(length / 2)));
    bark.push(mesh);
    return from.add(direction.scale(length));
  };
  const broadleaf = (x: number, z: number, size: number, palette: string[], baseY = H(x, z)) => {
    const root = new Vector3(x, baseY - .1, z);
    const height = (1.7 + rand() * .5) * size;
    const top = limb(root, height, (rand() - .5) * .14, rand() * Math.PI * 2, .42 * size, .24 * size);
    const tips: Vector3[] = [top];
    const branches = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < branches; i++) {
      const start = root.add(top.subtract(root).scale(.6 + rand() * .3));
      tips.push(limb(start, (.8 + rand() * .5) * size, .7 + rand() * .45, i / branches * Math.PI * 2 + rand() * .8, .18 * size, .07 * size));
    }
    const center = top.add(new Vector3(0, .5 * size, 0));
    for (const tip of tips) {
      const count = tip === top ? 4 : 2;
      for (let i = 0; i < count; i++) {
        const spread = tip === top ? 1 : .55;
        const at = tip.add(new Vector3((rand() - .5) * spread * size, (rand() * .8 + (tip === top ? .3 : .1)) * size, (rand() - .5) * spread * size));
        const shade = at.y > center.y + .15 * size ? 2 : at.y > center.y - .45 * size ? 1 : 0;
        leaf(palette[Math.min(2, shade + (rand() < .2 ? 1 : 0))]!, clump(at.x, at.y, at.z, (.55 + rand() * .35) * size, .78));
      }
    }
  };
  const conifer = (x: number, z: number, size: number) => {
    const base = H(x, z) - .1;
    limb(new Vector3(x, base, z), 1.2 * size, 0, 0, .3 * size, .2 * size);
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const cone = MeshBuilder.CreateCylinder('pine-layer', { diameterTop: .25 * size * (1 - t), diameterBottom: (2.5 - t * 1.6) * size, height: 1.3 * size, tessellation: 9 }, scene);
      cone.position.set(x + (rand() - .5) * .1, base + (1.1 + i * .8) * size, z + (rand() - .5) * .1);
      cone.rotation.y = rand() * Math.PI;
      leaf(LEAF_PINE[Math.min(2, i === 0 ? 0 : i - 1 + (rand() < .3 ? 1 : 0))]!, cone);
    }
  };
  const outside = (x: number, z: number, size: number) => {
    const roll = rand();
    if (roll < .22) conifer(x, z, size * 1.05);
    else broadleaf(x, z, size, roll < .42 ? LEAF_PURPLE : roll < .5 ? LEAF_BLOSSOM : LEAF_GREEN);
  };
  for (let x = -44; x <= 44; x += 3.4) for (const row of [0, 1, 2]) outside(x + (rand() - .5) * 2, 33.5 + row * 4.2 + rand() * 2, 1.1 + rand() * .6);
  for (let z = -26; z <= 30; z += 3.6) for (const row of [0, 1]) {
    outside(-33.5 - row * 4.5 - rand() * 2, z + rand() * 1.5, 1 + rand() * .6);
    outside(33.5 + row * 4.5 + rand() * 2, z + rand() * 1.5, 1 + rand() * .6);
  }
  YARD_TREES.forEach(t => broadleaf(t.x, t.z, t.s, t.blossom ? LEAF_BLOSSOM : LEAF_GREEN));
  // 광장 가운데는 세계수(worldTree.ts)
  merge('tree-bark', bark, '#73523A');
  leaves.forEach((list, hex) => merge(`tree-leaves-${hex}`, list, hex));
}

function buildRocks({ scene, merge, rand }: Kit) {
  const rocks: Mesh[] = [];
  for (const r of ROCKS) {
    const mesh = MeshBuilder.CreateSphere('rock', { diameter: r.r * 2, segments: 8, updatable: true }, scene);
    const salt = rand() * 50;
    mesh.updateMeshPositions(positions => {
      for (let i = 0; i < positions.length; i += 3) {
        const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
        const k = 1 + Math.sin(px * 4 + salt) * Math.cos(pz * 3.6 - salt) * .18;
        positions[i] = px * k; positions[i + 1] = py * k * .65; positions[i + 2] = pz * k;
      }
    }, true);
    mesh.rotation.y = rand() * Math.PI;
    mesh.position.set(r.x, H(r.x, r.z) + r.r * .2, r.z);
    rocks.push(mesh);
  }
  merge('rocks', rocks, STONE);
}

// 원작 정원처럼 돌 테두리를 두른 둥근 꽃밭
function buildFlowerBeds({ scene, merge, rand, lumpy }: Kit) {
  const curbs: Mesh[] = [], soils: Mesh[] = [], greens: Mesh[] = [];
  const colors = ['#FF8FB8', '#FFD45E', '#B79BEA', '#FFFFFF', '#FF9E7A'];
  const blooms: Mesh[][] = colors.map(() => []);
  for (const b of FLOWER_BEDS) {
    const y = H(b.x, b.z);
    const curb = MeshBuilder.CreateTorus('bed-curb', { diameter: b.r * 2, thickness: .28, tessellation: 40 }, scene);
    curb.scaling.y = .9;
    curb.position.set(b.x, y + .14, b.z);
    curbs.push(curb);
    const soil = MeshBuilder.CreateCylinder('bed-soil', { diameter: b.r * 2 - .1, height: .22, tessellation: 32 }, scene);
    soil.position.set(b.x, y + .11, b.z);
    soils.push(soil);
    const count = Math.round(b.r * b.r * 14);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (b.r - .3);
      const fx = b.x + Math.cos(a) * d, fz = b.z + Math.sin(a) * d;
      if (i % 3 === 0) {
        const bush = lumpy('bed-leaves', .36 + rand() * .15, .2, .7);
        bush.position.set(fx, y + .3, fz);
        greens.push(bush);
      }
      const bloom = MeshBuilder.CreateSphere('bed-bloom', { diameter: .18 + rand() * .06, segments: 6 }, scene);
      bloom.scaling.y = .7;
      bloom.position.set(fx, y + .36 + rand() * .1, fz);
      blooms[Math.floor(rand() * colors.length)]!.push(bloom);
    }
  }
  merge('bed-curbs', curbs, '#C9C4C9');
  merge('bed-soil', soils, '#6B5140', false);
  merge('bed-leaves', greens, '#5E9F55', false);
  colors.forEach((hex, i) => merge(`bed-blooms-${i}`, blooms[i]!, hex, false));
}

function buildBenches({ scene, merge, place }: Kit) {
  const wood: Mesh[] = [], frames: Mesh[] = [];
  for (const b of BENCHES) {
    const planks: Mesh[] = [], legs: Mesh[] = [];
    for (const dz of [-.15, .05]) {
      const seat = MeshBuilder.CreateBox('bench-seat', { width: 1.8, height: .08, depth: .18 }, scene);
      seat.position.set(0, .45, dz);
      planks.push(seat);
    }
    for (const dy of [.66, .86]) {
      const back = MeshBuilder.CreateBox('bench-back', { width: 1.8, height: .14, depth: .06 }, scene);
      back.position.set(0, dy, .24);
      planks.push(back);
    }
    for (const side of [-.78, .78]) {
      const leg = MeshBuilder.CreateBox('bench-leg', { width: .08, height: .45, depth: .45 }, scene);
      leg.position.set(side, .22, 0);
      const upright = MeshBuilder.CreateBox('bench-upright', { width: .08, height: .5, depth: .06 }, scene);
      upright.position.set(side, .7, .24);
      legs.push(leg, upright);
    }
    const y = H(b.x, b.z);
    wood.push(...place(b.x, y, b.z, b.heading, planks));
    frames.push(...place(b.x, y, b.z, b.heading, legs));
  }
  merge('bench-wood', wood, WOOD);
  merge('bench-frames', frames, WHITE);
}

// 별빛 정원 포석 길과 분수 광장·정자 바닥 위에는 풀을 심지 않습니다.
const onStarGround = (x: number, z: number) =>
  Math.hypot(x - STAR_GARDEN.fountain.x, z - STAR_GARDEN.fountain.z) < STAR_GARDEN.plazaR + .3
  || Math.hypot(x - STAR_GARDEN.pavilion.x, z - STAR_GARDEN.pavilion.z) < STAR_GARDEN.pavilion.r + .7
  || STAR_GARDEN.paths.some(line => distToLine(line, x, z) < 1.1);

function buildGrass({ scene, merge, rand }: Kit) {
  const blades: Mesh[] = [];
  const heads: Mesh[][] = [[], [], []];
  const colors = ['#FFFFFF', '#FFD45E', '#C9A8F0'];
  const free = (x: number, z: number) => !petWorld.obstacles.some(o => 'r' in o ? Math.hypot(x - o.x, z - o.z) < o.r + .5 : Math.abs(x - o.x) < o.hw + .5 && Math.abs(z - o.z) < o.hd + .5)
    && !nearStream(x, z) && !onStarGround(x, z) && Math.hypot(x - FALL_X, z - 12.2) > 2 && !(Math.abs(x - CASCADE.x) < 2 && z > CASCADE.z0 - .5 && z < CASCADE.z1 + 1.5) && Math.hypot(x - PLAZA.x, z - PLAZA.z) > PLAZA.r + .3 && !onPath(x, z, .4);
  for (let i = 0; i < 380; i++) {
    const x = (rand() * 2 - 1) * (HALF - 1), z = (rand() * 2 - 1) * (HALF - 1);
    if (!free(x, z)) continue;
    const y = H(x, z);
    for (let k = 0; k < 3; k++) {
      const blade = MeshBuilder.CreateCylinder('grass-blade', { diameterTop: 0, diameterBottom: .09, height: .35 + rand() * .3, tessellation: 3 }, scene);
      blade.position.set(x + (rand() - .5) * .3, y + .2, z + (rand() - .5) * .3);
      blade.rotation.set((rand() - .5) * .5, rand() * 3, (rand() - .5) * .5);
      blades.push(blade);
    }
    if (rand() < .3) {
      const head = MeshBuilder.CreateSphere('wildflower', { diameter: .16, segments: 5 }, scene);
      head.position.set(x, y + .45, z);
      heads[Math.floor(rand() * 3)]!.push(head);
    }
  }
  merge('grass-blades', blades, '#62A055', false);
  heads.forEach((group, index) => merge(`wildflowers-${index}`, group, colors[index]!, false));
}

function buildInfoHologram({ scene, mat, cast, hologram, fitText }: Kit) {
  const y = H(INFO.x, INFO.z);
  const stand = cast(MeshBuilder.CreateCylinder('info-stand', { diameterTop: .5, diameterBottom: .7, height: .6, tessellation: 20 }, scene));
  stand.position.set(INFO.x, y + .3, INFO.z);
  stand.material = mat(WHITE);
  const ring = MeshBuilder.CreateTorus('info-band', { diameter: .62, thickness: .05, tessellation: 24 }, scene);
  ring.position.set(INFO.x, y + .45, INFO.z);
  ring.material = mat(GOLD);
  hologram('info-holo', 2.4, 1.4, new Vector3(INFO.x, y + 1.7, INFO.z), 'cyan', (ctx, w, h) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px sans-serif'; ctx.fillText('DOROLAND', w / 2, h * .2);
    fitText(ctx, '펫 정원 안내', w - 60, 56); ctx.fillText('펫 정원 안내', w / 2, h * .44);
    ctx.font = '25px sans-serif';
    ctx.fillText('↑ 테라스 · 포털 · 관람차', w / 2, h * .68);
    ctx.fillText('↗ 펫 상점 · 회전목마   ↖ 동산 · 연못', w / 2, h * .84);
  });
}

function buildClouds({ scene, mat, rand }: Kit) {
  const cloud = mat('#FFFFFF', .85);
  const clouds: TransformNode[] = [];
  const spots: [number, number, number, number][] = [[-40, 30, 90, 1.4], [-6, 34, 105, 1.8], [30, 28, 85, 1.2], [60, 33, 100, 1.5], [-75, 36, 110, 1.6]];
  const puffs: [number, number, number][] = [[0, 0, 5], [3.4, -.7, 3.8], [-3.3, -.9, 3.4], [1.5, 1.5, 3.6], [-1.4, 1.1, 3]];
  for (const [x, y, z, s] of spots) {
    const node = new TransformNode('garden-cloud', scene);
    node.position.set(x, y, z);
    for (const [dx, dy, size] of puffs) {
      const puff = MeshBuilder.CreateSphere('garden-cloud-puff', { diameter: size * s, segments: 10 }, scene);
      puff.position.set(dx * s, dy * s, 0);
      puff.scaling.z = .55;
      puff.material = cloud;
      puff.applyFog = false;
      puff.parent = node;
    }
    clouds.push(node);
  }
  const speeds = clouds.map(() => .25 + rand() * .35);
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, .05);
    clouds.forEach((node, index) => {
      node.position.x += speeds[index]! * dt;
      if (node.position.x > 110) node.position.x = -110;
    });
  });
}
