// 펫 그림 고해상도 다시 그리기: 3D 모델(GLB)이 있는 펫을 기존 그림(264px)과 같은 구도로 4배(1056px) 렌더링한다.
// 기존 그림에서 펫이 차지하는 영역(가로 가운데·높이·발끝)을 재서 새 그림도 같은 자리에 맞춘다 → 뽑기 정원판·도감 위치가 그대로 맞는다.
// 실행: npm run dev 후 /tools/render-pets.html?models=cat,dog → #out 에 {code: dataURL} JSON
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { loadModel } from '../src/room/model';

const SRC = 264, SCALE = 4, OUT = SRC * SCALE;
const params = new URLSearchParams(location.search);
const codes = (params.get('models') ?? 'cat,dog,panda,gumiho').split(',');
// 카메라 각도: [좌우, 높이]. 기존 그림과 같은 방향 — 고양이·강아지는 얼굴이 왼쪽 앞, 판다·구미호는 정면
const VIEW: Record<string, [number, number]> = { cat: [2.4, 1.1], dog: [2.4, 1.1], panda: [Math.PI / 2, 1.38], gumiho: [Math.PI / 2, 1.32] };
const viewOf = (code: string): [number, number] => [Number(params.get('alpha') ?? VIEW[code]?.[0] ?? 2.4), Number(params.get('beta') ?? VIEW[code]?.[1] ?? 1.1)];

type Box = { x0: number; y0: number; x1: number; y1: number };
function bbox(data: Uint8ClampedArray, w: number, h: number): Box {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3]! > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
async function oldBox(code: string) {
  const img = new Image();
  img.src = `/assets/pets/pet-${code}.png`;
  await img.decode();
  const c = new OffscreenCanvas(SRC, SRC); const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, SRC, SRC);
  return bbox(g.getImageData(0, 0, SRC, SRC).data, SRC, SRC);
}

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false, antialias: true });
engine.setHardwareScalingLevel(.5);   // 2배 슈퍼샘플링
const result: Record<string, string> = {};
for (const code of codes) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const [alpha, beta] = viewOf(code);
  const camera = new ArcRotateCamera('cam', alpha, beta, 6, new Vector3(0, .5, 0), scene);
  camera.fov = .32;
  // 기존 그림처럼 왼쪽 앞 위에서 빛 → 얼굴 쪽은 밝고 오른쪽 옆면은 어둡게
  const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
  sky.intensity = .75; sky.groundColor = new Color3(.35, .35, .42);
  const sun = new DirectionalLight('sun', camera.position.subtract(camera.target).normalize().scale(-1).add(new Vector3(.25, -.5, 0)), scene);
  sun.intensity = 1.9;
  const model = await loadModel(scene, `pet/pet-${code}.glb`, 1);
  model.container.animationGroups.forEach(g => g.stop());
  await scene.whenReadyAsync();
  scene.render(); scene.render();
  // 렌더 결과 → 펫 영역만 잘라서 기존 그림의 같은 영역(4배)에 맞추기
  const w = canvas.width, h = canvas.height;
  const raw = document.createElement('canvas'); raw.width = w; raw.height = h;
  const rg = raw.getContext('2d', { willReadFrequently: true })!;
  rg.drawImage(canvas, 0, 0);
  const nb = bbox(rg.getImageData(0, 0, w, h).data, w, h);
  const ob = await oldBox(code);
  const s = ((ob.y1 - ob.y0) * SCALE) / (nb.y1 - nb.y0);
  const dw = (nb.x1 - nb.x0) * s, dh = (nb.y1 - nb.y0) * s;
  const cx = (ob.x0 + ob.x1) / 2 * SCALE;
  const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
  const og = out.getContext('2d')!;
  og.imageSmoothingQuality = 'high';
  og.drawImage(raw, nb.x0, nb.y0, nb.x1 - nb.x0, nb.y1 - nb.y0, cx - dw / 2, ob.y1 * SCALE - dh, dw, dh);
  result[code] = out.toDataURL('image/png');
  scene.dispose();
}
document.querySelector('#out')!.textContent = JSON.stringify(result);
