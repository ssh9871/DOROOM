import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { loadModel } from './model';
import { loadPicturePet, type Companion } from './petPicture';
import { blocked, canStand, petRadius, type World } from './movement';
import type { Grade } from '../../../shared/types';

// 마당 펫: 서버 GET /pets 의 보유 펫. 3D 모델이 있으면 모델, 없으면 그림을 세워서 보여줍니다.
export type YardPet = { id: string; name: string; grade: Grade; modelPath?: string | null; imageUrl?: string | null; height?: number };
// 장착 펫은 id(userPetId)로 구분하고, id가 없으면 이름으로 구분합니다.
export type EquippedPet = { id?: string; name: string };

type Point = { x: number; z: number };
export type YardArea = {
  limit: number;
  // 펫이 놀러 가는 장소(꽃밭, 연못가, 집 앞 등)
  spots: Point[];
  // 지형 높이와 장애물(건물, 연못, 벽). 펫과 공이 통과하지 않습니다.
  world: World;
  // 공의 처음 위치
  balls: Point[];
  // 등급 전용 구역: 레전더리는 영산 성역, 레어는 2단 전망대 안에서만 놉니다.
  // 노멀은 두 구역 밖(마을·광장·공원)에서만 놉니다. 장착해서 데리고 다니는 펫은 이 제한을 받지 않습니다.
  zones: Record<Exclude<Zone, 'NORMAL'>, { contains: (p: Point) => boolean; spots: Point[] }>;
  // 노멀이 놀 수 있는 곳 (없으면 두 등급 구역 밖 전체)
  normal?: (p: Point) => boolean;
};

export type Zone = 'LEGEND' | 'RARE' | 'NORMAL';
export const zoneOf = (pet: { grade: Grade }): Zone => pet.grade === 'LEGEND' ? 'LEGEND' : pet.grade === 'RARE' ? 'RARE' : 'NORMAL';

type Model = Companion;
type Roamer = { model: Model; zone: Zone; target: Point; wait: number; hop: number; hopHeight: number; time: number; chasing: Ball | null };
type Ball = { mesh: Mesh; vx: number; vz: number };

export function createPetYard(scene: Scene, shadows: ShadowGenerator, area: YardArea) {
  const roamers = new Map<string, Roamer>();
  const loading = new Set<string>();
  let wanted = new Set<string>();
  const { world } = area;
  const balls = area.balls.map((at, index) => createBall(scene, shadows, at, index, world));

  const { zones } = area;
  // 자기 등급 구역 안만 다닐 수 있고, 노멀은 어느 등급 구역에도 들어가지 않습니다.
  const allowed = (zone: Zone, p: Point) => zone === 'NORMAL'
    ? !zones.LEGEND.contains(p) && !zones.RARE.contains(p) && (area.normal?.(p) ?? true)
    : zones[zone].contains(p);
  const inside = (p: Point) => Math.abs(p.x) <= area.limit - .8 && Math.abs(p.z) <= area.limit - .8 && !blocked(world, p.x, p.z, petRadius + .3);
  const spotsFor = (zone: Zone) => zone === 'NORMAL' ? area.spots.filter(p => allowed('NORMAL', p)) : zones[zone].spots;
  const randomPoint = (zone: Zone): Point => {
    for (let i = 0; i < 80; i++) {
      const p = { x: (Math.random() * 2 - 1) * (area.limit - 2), z: (Math.random() * 2 - 1) * (area.limit - 2) };
      if (inside(p) && allowed(zone, p)) return p;
    }
    const spots = spotsFor(zone);
    return spots[Math.floor(Math.random() * spots.length)] ?? { x: 0, z: 0 };
  };
  const nextTarget = (roamer: Roamer) => {
    const roll = Math.random();
    roamer.chasing = null;
    const spots = spotsFor(roamer.zone);
    // 같은 구역 안에 있는 공만 쫓습니다.
    const reachable = balls.filter(ball => allowed(roamer.zone, { x: ball.mesh.position.x, z: ball.mesh.position.z }));
    if (roll < .35 && reachable.length) {
      const ball = reachable[Math.floor(Math.random() * reachable.length)]!;
      roamer.chasing = ball;
      roamer.target = { x: ball.mesh.position.x, z: ball.mesh.position.z };
    } else if (roll < .7 && spots.length) {
      const spot = spots[Math.floor(Math.random() * spots.length)]!;
      roamer.target = { x: spot.x + (Math.random() - .5) * 1.5, z: spot.z + (Math.random() - .5) * 1.5 };
    } else {
      roamer.target = randomPoint(roamer.zone);
    }
  };

  const remove = (id: string) => {
    const roamer = roamers.get(id);
    if (!roamer) return;
    roamer.model.container.meshes.forEach(mesh => shadows.removeShadowCaster(mesh));
    roamer.model.container.dispose();
    roamer.model.actor.dispose();
    roamers.delete(id);
  };

  const add = async (pet: YardPet) => {
    loading.add(pet.id);
    try {
      const model: Model = pet.modelPath ? await loadModel(scene, pet.modelPath, pet.height ?? .75)
        : pet.imageUrl ? loadPicturePet(scene, pet.imageUrl, 1.2)
        : (() => { throw new Error('펫 모델·그림 없음'); })();
      if (scene.isDisposed) return;
      if (!wanted.has(pet.id) || roamers.has(pet.id)) {
        model.container.dispose(); model.actor.dispose();
        return;
      }
      const zone = zoneOf(pet);
      const spots = spotsFor(zone);
      const start = spots.length ? spots[Math.floor(Math.random() * spots.length)]! : randomPoint(zone);
      model.actor.position.set(start.x, world.height(start.x, start.z), start.z);
      model.container.meshes.forEach(mesh => shadows.addShadowCaster(mesh));
      nameTag(scene, pet.name, zone).parent = model.actor;
      const roamer: Roamer = { model, zone, target: start, wait: Math.random() * 2, hop: 0, hopHeight: 0, time: Math.random() * 10, chasing: null };
      nextTarget(roamer);
      roamers.set(pet.id, roamer);
    } catch (error) {
      if (!scene.isDisposed) console.warn('마당 펫을 불러오지 못했어요.', error);
    } finally {
      loading.delete(pet.id);
    }
  };

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, .05);
    for (const ball of balls) rollBall(ball, dt, area.limit - .6, world);
    for (const roamer of roamers.values()) {
      const actor = roamer.model.actor;
      roamer.time += dt;
      if (roamer.chasing) roamer.target = { x: roamer.chasing.mesh.position.x, z: roamer.chasing.mesh.position.z };
      const dx = roamer.target.x - actor.position.x, dz = roamer.target.z - actor.position.z;
      const distance = Math.hypot(dx, dz);
      let y = 0;
      if (roamer.hop > 0) {
        // 도착하면 가끔 신나서 폴짝 뜁니다.
        roamer.hop = Math.max(0, roamer.hop - dt);
        y = Math.sin(Math.PI * (1 - roamer.hop / .55)) * roamer.hopHeight;
      } else if (roamer.wait > 0) {
        roamer.wait -= dt;
        if (roamer.wait <= 0) nextTarget(roamer);
      } else if (distance > (roamer.chasing ? .45 : .15)) {
        const speed = roamer.chasing ? 2.4 : 1.4;
        const step = Math.min(distance, speed * dt);
        const nx = actor.position.x + dx / distance * step, nz = actor.position.z + dz / distance * step;
        // 건물이나 벽에 막히면 다른 곳으로 놀러 갑니다.
        if (allowed(roamer.zone, { x: nx, z: nz }) && canStand(world, nx, nz, world.height(actor.position.x, actor.position.z), petRadius)) { actor.position.x = nx; actor.position.z = nz; }
        else { nextTarget(roamer); roamer.wait = .4; }
        const heading = Math.atan2(dx, dz);
        let turn = heading - actor.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        actor.rotation.y += turn * Math.min(1, dt * 8);
        roamer.model.face?.(dx);   // 그림 펫: 걷는 방향으로 좌우 뒤집기
        y = Math.abs(Math.sin(roamer.time * (roamer.chasing ? 14 : 10))) * .1;
      } else {
        if (roamer.chasing) {
          // 공을 툭 차서 굴립니다.
          const angle = actor.rotation.y + (Math.random() - .5) * 1.2;
          const power = 3 + Math.random() * 3;
          roamer.chasing.vx = Math.sin(angle) * power;
          roamer.chasing.vz = Math.cos(angle) * power;
          roamer.wait = Math.random() < .6 ? .3 : 1.2;
          if (Math.random() < .6) roamer.chasing = null;
        } else {
          roamer.wait = 1.5 + Math.random() * 3;
        }
        if (Math.random() < .45) { roamer.hop = .55; roamer.hopHeight = .25 + Math.random() * .25; }
      }
      actor.position.y = world.height(actor.position.x, actor.position.z) + y;
      // 숨 쉬듯 살짝 커졌다 작아집니다.
      const breathe = 1 + Math.sin(roamer.time * 3) * .025;
      actor.scaling.set(1, breathe, 1);
    }
  });

  let owned: YardPet[] = [];
  let equipped: EquippedPet | null = null;
  const refresh = () => {
    const isEquipped = (pet: YardPet) => !!equipped && (equipped.id ? pet.id === equipped.id : pet.name === equipped.name);
    const pets = owned.filter(pet => !isEquipped(pet));
    wanted = new Set(pets.map(pet => pet.id));
    for (const id of [...roamers.keys()]) if (!wanted.has(id)) remove(id);
    for (const pet of pets) if (!roamers.has(pet.id) && !loading.has(pet.id)) void add(pet);
  };

  return {
    // 장착한 펫은 플레이어를 따라다니므로, 나머지 보유 펫만 마당에 둡니다.
    // 장착 펫은 id가 있으면 id로, 없으면(RoomPet) 이름으로 구분합니다.
    sync(next: EquippedPet | null) { equipped = next; refresh(); },
    // 보유 펫 목록이 바뀌면(뽑기·새로고침) 다시 맞춥니다.
    setOwned(pets: YardPet[]) { owned = pets; refresh(); },
  };
}

function createBall(scene: Scene, shadows: ShadowGenerator, at: Point, index: number, world: World): Ball {
  const texture = new DynamicTexture(`yard-ball-${index}`, { width: 128, height: 64 }, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const colors = index % 2 ? ['#7FC8F8', '#FFFFFF', '#FFD86E'] : ['#FF8FAB', '#FFFFFF', '#9BE0B5'];
  colors.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(0, i * 64 / 3, 128, 64 / 3 + 1); });
  texture.update();
  const material = new StandardMaterial(`yard-ball-${index}`, scene);
  material.diffuseTexture = texture;
  material.specularColor = new Color3(.25, .25, .25);
  const mesh = MeshBuilder.CreateSphere(`yard-ball-${index}`, { diameter: .42, segments: 12 }, scene);
  mesh.position.set(at.x, world.height(at.x, at.z) + .21, at.z);
  mesh.material = material;
  shadows.addShadowCaster(mesh);
  return { mesh, vx: 0, vz: 0 };
}

function rollBall(ball: Ball, dt: number, limit: number, world: World) {
  const p = ball.mesh.position;
  // 비탈에서는 아래쪽으로 굴러 내려갑니다.
  const gx = (world.height(p.x + .1, p.z) - world.height(p.x - .1, p.z)) / .2;
  const gz = (world.height(p.x, p.z + .1) - world.height(p.x, p.z - .1)) / .2;
  if (Math.abs(gx) < 1 && Math.abs(gz) < 1) { ball.vx -= gx * 5 * dt; ball.vz -= gz * 5 * dt; }
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed < .02) { ball.vx = ball.vz = 0; return; }
  const feet = world.height(p.x, p.z);
  const nx = Math.max(-limit, Math.min(limit, p.x + ball.vx * dt));
  if (canStand(world, nx, p.z, feet, .21)) p.x = nx; else ball.vx *= -.6;
  const nz = Math.max(-limit, Math.min(limit, p.z + ball.vz * dt));
  if (canStand(world, p.x, nz, feet, .21)) p.z = nz; else ball.vz *= -.6;
  if (Math.abs(p.x) >= limit) ball.vx = -Math.sign(p.x) * Math.abs(ball.vx) * .6;
  if (Math.abs(p.z) >= limit) ball.vz = -Math.sign(p.z) * Math.abs(ball.vz) * .6;
  p.y = world.height(p.x, p.z) + .21;
  // 구르는 방향으로 회전
  ball.mesh.rotation.x += ball.vz * dt / .21;
  ball.mesh.rotation.z -= ball.vx * dt / .21;
  const friction = Math.max(0, 1 - dt * 1.6);
  ball.vx *= friction;
  ball.vz *= friction;
}

// 마당 펫 머리 위 이름표(레전더리 금색 ★, 레어 하늘색 ◆, 노멀 분홍 ♥)
const TAG = { LEGEND: { color: '#B8862B', mark: '★' }, RARE: { color: '#3A86C8', mark: '◆' }, NORMAL: { color: '#E2577A', mark: '♥' } } as const;
function nameTag(scene: Scene, name: string, zone: Zone) {
  const texture = new DynamicTexture(`yard-tag-${name}`, { width: 256, height: 80 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 80);
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.beginPath(); ctx.roundRect(8, 12, 240, 56, 28); ctx.fill();
  ctx.fillStyle = TAG[zone].color; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${TAG[zone].mark} ${name}`, 128, 41);
  texture.update();
  const material = new StandardMaterial(`yard-tag-${name}`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(`yard-tag-${name}`, { width: .9, height: .28 }, scene);
  plane.position.y = 1.05;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.material = material;
  return plane;
}
