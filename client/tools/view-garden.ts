// 펫 정원 미리보기: 로그인 없이 정원만 띄워서 게임 카메라 각도로 한 곳을 본다 (꾸미기 확인용).
// 실행: npm run dev 후 /tools/view-garden.html?x=0&z=2.5  (zoom=작을수록 가까이)
//       &lineup=cat,lion,crab → 그 자리에 펫 모델을 한 줄로 세워 크기·방향 확인 (마이룸과 같은 높이 값 사용)
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { buildPetRoom } from '../src/room/petRoomDecor';
import { heightAt } from '../src/room/petRoomMap';
import { loadModel } from '../src/room/model';
import { roomPetOf } from '../src/ui/petWindow';

const q = new URLSearchParams(location.search);
const x = Number(q.get('x') ?? 0), z = Number(q.get('z') ?? 0), zoom = Number(q.get('zoom') ?? 1);
const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
const scene = new Scene(engine);
const h = heightAt(x, z);
const camera = new FreeCamera('cam', new Vector3(x, 8.7 * zoom + h, z - 12 * zoom), scene);
camera.fov = .85;
camera.setTarget(new Vector3(x, 1 + h, z));
const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
ambient.intensity = .55; ambient.groundColor = new Color3(.43, .30, .18);
const sun = new DirectionalLight('sun', new Vector3(-.55, -1, .55), scene);
sun.position.set(7, 13, -7); sun.intensity = .7;
const shadows = new ShadowGenerator(1024, sun);
const glow = new GlowLayer('glow', scene);
buildPetRoom(scene, shadows, glow);
const lineup = (q.get('lineup') ?? '').split(',').filter(Boolean);
for (const [i, code] of lineup.entries()) {
  const pet = roomPetOf({ nickname: null, species: { code, imageUrl: null, name: code } } as never)!;
  if (!pet.modelPath) continue;
  const model = await loadModel(scene, pet.modelPath, pet.height ?? .75);
  const px = x + (i - (lineup.length - 1) / 2) * 1.25, pz = z;
  model.actor.position.set(px, heightAt(px, pz), pz);
  model.actor.rotation.y = Math.PI + Number(q.get('turn') ?? -.5);   // 카메라 쪽을 보게
  model.container.meshes.forEach(m => shadows.addShadowCaster(m));
}
await scene.whenReadyAsync();
engine.runRenderLoop(() => scene.render());
