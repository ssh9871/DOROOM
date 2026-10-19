import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { loadModel } from './model';
import { stepMotion, type Motion } from './movement';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export function createRoom(canvas: HTMLCanvasElement, nameTag: HTMLElement, loading: HTMLElement) {
  if (!Engine.isSupported()) throw new Error('WebGL is not supported');
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(.19, .15, .11, 1);
  const camera = new FreeCamera('room-camera', new Vector3(0, 8.7, -12), scene);
  camera.minZ = .1;
  camera.fov = .85;
  const cameraTarget = new Vector3(0, 1, 0);
  camera.setTarget(cameraTarget);
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = .55;
  ambient.groundColor = new Color3(.43, .30, .18);
  const sun = new DirectionalLight('sun', new Vector3(-.55, -1, .55), scene);
  sun.position.set(7, 13, -7);
  sun.intensity = .7;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 24;
  shadows.darkness = .35;

  const floorMaterial = new StandardMaterial('warm-floor', scene);
  floorMaterial.diffuseColor = new Color3(.78, .49, .24);
  floorMaterial.specularColor = Color3.Black();
  const floor = MeshBuilder.CreateGround('floor', { width: 20, height: 20 }, scene);
  floor.material = floorMaterial;
  floor.receiveShadows = true;

  const wood = new DynamicTexture('wood', { width: 512, height: 512 }, scene, false);
  const ctx = wood.getContext();
  ctx.fillStyle = '#644021';
  ctx.fillRect(0, 0, 512, 512);
  for (let plank = 0; plank < 8; plank++) {
    ctx.fillStyle = plank % 2 ? '#6b4728' : '#76502c';
    ctx.fillRect(plank * 64 + 2, 0, 60, 512);
    for (let line = 0; line < 10; line++) {
      ctx.strokeStyle = `rgba(34,19,8,${.08 + line % 3 * .025})`;
      ctx.lineWidth = 1 + line % 2;
      ctx.beginPath();
      ctx.moveTo(plank * 64 + 5 + line * 5, 0);
      ctx.lineTo(plank * 64 + 3 + line * 5, 170);
      ctx.lineTo(plank * 64 + 10 + line * 5, 340);
      ctx.lineTo(plank * 64 + 5 + line * 5, 512);
      ctx.stroke();
    }
  }
  wood.update();
  wood.uScale = 4;
  const wallMaterial = new StandardMaterial('wooden-walls', scene);
  wallMaterial.diffuseTexture = wood;
  wallMaterial.specularColor = Color3.Black();
  for (const [x, z, rotation] of [[0, 10, 0], [-10, 0, Math.PI / 2], [10, 0, Math.PI / 2]]) {
    const wall = MeshBuilder.CreateBox('wall', { width: 20, height: 7, depth: .25 }, scene);
    wall.position.set(x, 3.5, z);
    wall.rotation.y = rotation;
    wall.material = wallMaterial;
    wall.receiveShadows = true;
  }
  const trimMaterial = new StandardMaterial('trim-material', scene);
  trimMaterial.diffuseColor = new Color3(.23, .13, .07);
  trimMaterial.specularColor = Color3.Black();
  const trim = MeshBuilder.CreateBox('back-trim', { width: 20, height: .2, depth: .3 }, scene);
  trim.position.set(0, .1, 9.8);
  trim.material = trimMaterial;

  const portalMaterial = new StandardMaterial('portal-glow', scene);
  portalMaterial.emissiveColor = new Color3(.05, .48, 1);
  portalMaterial.diffuseColor = new Color3(.02, .15, .6);
  portalMaterial.disableLighting = true;
  const portal = MeshBuilder.CreateTorus('decorative-portal', { diameter: 2.15, thickness: .08, tessellation: 64 }, scene);
  portal.rotation.x = Math.PI / 2;
  portal.scaling.x = .7;
  portal.position.set(0, 2.2, 9.65);
  portal.material = portalMaterial;
  const innerMaterial = new StandardMaterial('portal-inner', scene);
  innerMaterial.diffuseColor = new Color3(.03, .19, .5);
  innerMaterial.emissiveColor = new Color3(.015, .1, .3);
  innerMaterial.alpha = .65;
  const inner = MeshBuilder.CreateDisc('portal-inner', { radius: 1.04, tessellation: 64 }, scene);
  inner.position.set(0, 2.2, 9.7);
  inner.scaling.x = .7;
  inner.material = innerMaterial;

  const keys = new Set<string>();
  const motion: Motion = { x: 0, y: 0, z: 0, velocityY: 0 };
  let jumpRequested = false;
  let disposed = false;
  let actor: Awaited<ReturnType<typeof loadModel>> | undefined;
  let animation = '';
  const resetKeys = () => { keys.clear(); jumpRequested = false; };
  const keyDown = (event: KeyboardEvent) => {
    if (document.activeElement !== canvas || !actor) return;
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) jumpRequested = true;
  };
  const keyUp = (event: KeyboardEvent) => { keys.delete(event.code); };
  const focusCanvas = () => { if (!document.querySelector('dialog[open]')) canvas.focus(); };
  const resize = () => engine.resize();
  const visibility = () => { if (document.hidden) resetKeys(); };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', resetKeys);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('blur', resetKeys);
  canvas.addEventListener('pointerdown', focusCanvas);

  void (async () => {
    try {
      try {
        actor = await loadModel(scene, 'avatar/robot.glb', 1.9);
      } catch (error) {
        if (disposed) return;
        console.warn('원본 아바타를 불러오지 못해 대체 GLB를 사용합니다.', error);
        actor = await loadModel(scene, 'avatar/simple-robot.glb', 1.9);
      }
      if (disposed) { actor.container.dispose(); return; }
      actor.actor.rotation.y = Math.PI;
      actor.container.meshes.forEach(mesh => shadows.addShadowCaster(mesh));
      await scene.whenReadyAsync();
      if (disposed) return;
      loading.hidden = true;
      nameTag.hidden = false;
      focusCanvas();
    } catch (error) {
      if (disposed) return;
      loading.textContent = '아바타를 불러오지 못했습니다. 나가기 후 다시 입장해주세요.';
      console.error(error);
    }
  })();

  engine.runRenderLoop(() => {
    if (disposed) return;
    if (actor && loading.hidden) {
      const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      stepMotion(motion, x, z, jumpRequested, engine.getDeltaTime() / 1000);
      jumpRequested = false;
      actor.actor.position.set(motion.x, motion.y, motion.z);
      if (x || z) actor.actor.rotation.y = Math.atan2(x, z);
      const next = motion.y > 0 ? 'Jump' : x || z ? 'Run' : 'Idle';
      if (next !== animation) {
        actor.container.animationGroups.forEach(group => group.stop());
        const group = actor.container.animationGroups.find(group => group.name.endsWith(`|${next}`));
        group?.start(next !== 'Jump');
        animation = next;
      }
      cameraTarget.set(motion.x, 1, motion.z);
      camera.position.set(motion.x, 8.7, motion.z - 12);
      camera.setTarget(cameraTarget);
    }
    scene.render();
    if (actor && !nameTag.hidden) {
      const position = Vector3.Project(new Vector3(motion.x, motion.y + 2.5, motion.z), Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      nameTag.style.left = `${position.x / engine.getRenderWidth() * canvas.clientWidth}px`;
      nameTag.style.top = `${position.y / engine.getRenderHeight() * canvas.clientHeight}px`;
    }
  });

  return () => {
    disposed = true;
    resetKeys();
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    window.removeEventListener('blur', resetKeys);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('blur', resetKeys);
    canvas.removeEventListener('pointerdown', focusCanvas);
    engine.stopRenderLoop();
    scene.dispose();
    engine.dispose();
  };
}
