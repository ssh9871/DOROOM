import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { shopPosition } from './movement';

// 펫 마이룸 전용 꾸미기. 일반 마이룸과 공유하는 바닥·벽·조명·포털은 room.ts에 있습니다.
export function buildPetRoom(scene: Scene, shadows: ShadowGenerator) {
  buildShop(scene, shadows);
}

function buildShop(scene: Scene, shadows: ShadowGenerator) {
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
