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
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { loadModel } from './model';
import { nearShop, shopPosition, nearPortal, portalPosition, stepFollowing, stepMotion, type Motion } from './movement';
import type { Pet } from '../pets/pets';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export function createRoom(canvas: HTMLCanvasElement, nameTag: HTMLElement, loading: HTMLElement, options: {
  petRoom: boolean;
  shopHint: HTMLElement;
  onShop: () => void;
  portalHint: HTMLElement;
  onPortal: () => void;
  onPetStatus: (message: string) => void;
}) {
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
  portalMaterial.emissiveColor = new Color3(.4, .85, 1);
  portalMaterial.diffuseColor = new Color3(.02, .15, .6);
  portalMaterial.disableLighting = true;
  const portal = MeshBuilder.CreateTorus('pet-room-portal', { diameter: 3, thickness: .07, tessellation: 96 }, scene);
  portal.rotation.x = Math.PI / 2;
  portal.scaling.x = .7;
  portal.position.set(portalPosition.x, 1.6, portalPosition.z);
  portal.material = portalMaterial;
  const glow = new GlowLayer('portal-glow', scene, { blurKernelSize: 32 });
  glow.intensity = .85;
  glow.addIncludedOnlyMesh(portal);
  const innerMaterial = new StandardMaterial('portal-inner', scene);
  innerMaterial.diffuseColor = new Color3(.3, .45, 1);
  innerMaterial.emissiveColor = new Color3(.2, .32, .8);
  innerMaterial.alpha = .28;
  innerMaterial.backFaceCulling = false;
  const inner = MeshBuilder.CreateDisc('portal-inner', { radius: 1.46, tessellation: 96 }, scene);
  inner.position.set(portalPosition.x, 1.6, portalPosition.z + .03);
  inner.scaling.x = .7;
  inner.material = innerMaterial;

  if (options.petRoom) {
    const shopWood = new StandardMaterial('shop-wood', scene);
    shopWood.diffuseColor = Color3.FromHexString('#D6A466');
    const shopRoof = new StandardMaterial('shop-roof', scene);
    shopRoof.diffuseColor = Color3.FromHexString('#62B8AD');
    for (const [name, width, height, depth, x, y, z, material] of [
      ['counter', 2.8, 1.1, 1.2, 0, .55, .4, shopWood],
      ['awning', 3.2, .22, 1.8, 0, 2.65, .4, shopRoof],
      ['left-post', .12, 2.5, .12, -1.3, 1.25, 1, shopWood],
      ['right-post', .12, 2.5, .12, 1.3, 1.25, 1, shopWood],
    ] as const) {
      const mesh = MeshBuilder.CreateBox(`shop-${name}`, { width, height, depth }, scene);
      mesh.position.set(shopPosition.x + x, y, shopPosition.z + z);
      mesh.material = material;
      shadows.addShadowCaster(mesh);
    }
    const sign = new DynamicTexture('shop-sign', { width: 512, height: 256 }, scene, false);
    const context = sign.getContext() as CanvasRenderingContext2D;
    context.fillStyle = '#183C3A';
    context.fillRect(0, 0, 512, 256);
    context.fillStyle = '#FFE2A0';
    context.beginPath(); context.ellipse(256, 112, 38, 29, 0, 0, Math.PI * 2); context.fill();
    for (const [x, y] of [[206, 74], [238, 52], [275, 52], [306, 74]]) {
      context.beginPath(); context.ellipse(x, y, 13, 19, 0, 0, Math.PI * 2); context.fill();
    }
    context.font = 'bold 40px sans-serif'; context.textAlign = 'center';
    context.fillText('PET SHOP', 256, 212); sign.update();
    const signMaterial = new StandardMaterial('shop-sign', scene);
    signMaterial.diffuseTexture = sign;
    signMaterial.emissiveColor = new Color3(.3, .3, .3);
    signMaterial.backFaceCulling = false;
    const board = MeshBuilder.CreatePlane('shop-sign', { width: 2.1, height: 1.05 }, scene);
    board.position.set(shopPosition.x, 2.12, shopPosition.z - .24);
    board.material = signMaterial;
  }

  const keys = new Set<string>();
  const motion: Motion = { x: 0, y: 0, z: 0, velocityY: 0 };
  let jumpRequested = false;
  let disposed = false;
  let paused = false;
  let petVersion = 0;
  let companion: Awaited<ReturnType<typeof loadModel>> | undefined;
  let companionAnimation = '';
  let actor: Awaited<ReturnType<typeof loadModel>> | undefined;
  let animation = '';
  const resetKeys = () => { keys.clear(); jumpRequested = false; };
  const clearPet = (model: Awaited<ReturnType<typeof loadModel>>) => {
    model.container.meshes.forEach(mesh => shadows.removeShadowCaster(mesh));
    model.container.dispose();
    model.actor.dispose();
  };
  const setPet = async (pet: Pet | null) => {
    const version = ++petVersion;
    if (companion) { clearPet(companion); companion = undefined; }
    companionAnimation = '';
    if (disposed) return;
    options.onPetStatus(pet ? '펫을 불러오고 있어요.' : '');
    if (!pet) return;
    try {
      const model = await loadModel(scene, pet.modelPath, .75);
      if (disposed || version !== petVersion) { clearPet(model); return; }
      companion = model;
      model.actor.position.set(motion.x > 7.3 ? motion.x - 1.4 : motion.x + 1.4, 0, motion.z);
      model.container.meshes.forEach(mesh => shadows.addShadowCaster(mesh));
      options.onPetStatus('');
    } catch (error) {
      if (disposed || version !== petVersion) return;
      options.onPetStatus('펫을 불러오지 못했어요. 펫 창(P)에서 해제 후 다시 장착해주세요.');
      console.error(error);
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if (paused || document.activeElement !== canvas || !actor || !loading.hidden) return;
    if (event.code === 'KeyE' && !event.repeat && options.petRoom && nearShop(motion)) {
      event.preventDefault();
      resetKeys();
      options.onShop();
      return;
    }
    if (event.code === 'KeyE' && !event.repeat && nearPortal(motion)) {
      event.preventDefault();
      paused = true;
      resetKeys();
      options.onPortal();
      return;
    }
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) jumpRequested = true;
  };
  const keyUp = (event: KeyboardEvent) => { keys.delete(event.code); };
  const focusCanvas = () => { if (!paused && !document.querySelector('dialog[open]')) canvas.focus(); };
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
    const seconds = engine.getDeltaTime() / 1000;
    const pulse = (Math.sin(performance.now() / 550) + 1) / 2;
    glow.intensity = .7 + pulse * .3;
    innerMaterial.alpha = .2 + pulse * .12;
    if (actor && loading.hidden) {
      const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      stepMotion(motion, x, z, jumpRequested, seconds);
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
      options.portalHint.hidden = paused || !nearPortal(motion);
      options.shopHint.hidden = paused || !options.petRoom || !nearShop(motion);
      if (companion && !paused) {
        const position = companion.actor.position;
        const moving = stepFollowing(position, motion, seconds);
        if (moving) companion.actor.rotation.y = Math.atan2(motion.x - position.x, motion.z - position.z);
        const nextPetAnimation = moving ? 'Walk' : 'Idle';
        if (nextPetAnimation !== companionAnimation) {
          companion.container.animationGroups.forEach(group => group.stop());
          companion.container.animationGroups.find(group => group.name.endsWith(`|${nextPetAnimation}`))?.start(true);
          companionAnimation = nextPetAnimation;
        }
      }
    }
    scene.render();
    if (actor && !nameTag.hidden) {
      const position = Vector3.Project(new Vector3(motion.x, motion.y + 2.5, motion.z), Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      nameTag.style.left = `${position.x / engine.getRenderWidth() * canvas.clientWidth}px`;
      nameTag.style.top = `${position.y / engine.getRenderHeight() * canvas.clientHeight}px`;
    }
  });

  const dispose = () => {
    disposed = true;
    ++petVersion;
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
  return {
    dispose,
    setPet: (pet: Pet | null) => { void setPet(pet); },
    setPaused(value: boolean) {
      paused = value;
      resetKeys();
      if (paused) { options.portalHint.hidden = true; options.shopHint.hidden = true; }
    },
  };
}
