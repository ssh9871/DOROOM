// 3D 모델이 없는 펫: 그림을 세워서(빌보드) 보여준다. 마이룸 따라다니는 펫·펫 정원 마당 펫이 같이 쓴다.
import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

export type Companion = {
  actor: TransformNode;
  container: { meshes: AbstractMesh[]; animationGroups: AnimationGroup[]; dispose(): void };
  face?: (dx: number) => void;
};

export function loadPicturePet(scene: Scene, url: string, height: number): Companion {
  const actor = new TransformNode('pet-actor', scene);
  const texture = new Texture(url, scene);
  texture.hasAlpha = true;
  const material = new StandardMaterial('pet-picture', scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane('pet-picture', { size: height }, scene);
  plane.material = material;
  plane.billboardMode = TransformNode.BILLBOARDMODE_Y;
  plane.parent = actor;
  plane.position.y = height / 2 - height * .076;
  const shadowMaterial = new StandardMaterial('pet-blob', scene);
  shadowMaterial.diffuseColor = Color3.Black();
  shadowMaterial.disableLighting = true;
  shadowMaterial.alpha = .28;
  const blob = MeshBuilder.CreateDisc('pet-blob', { radius: height * .28, tessellation: 24 }, scene);
  blob.material = shadowMaterial;
  blob.rotation.x = Math.PI / 2;
  blob.position.y = .01;
  blob.parent = actor;
  return {
    actor,
    container: {
      meshes: [],                                   // 그림판은 그림자를 만들지 않는다 (대신 바닥에 둥근 그림자)
      animationGroups: [],
      dispose() { plane.dispose(); blob.dispose(); material.dispose(); shadowMaterial.dispose(); texture.dispose(); },
    },
    // 그림은 왼쪽을 보고 있다 → 오른쪽으로 걸을 때만 뒤집는다
    face(dx) { if (Math.abs(dx) > .01) plane.scaling.x = dx > 0 ? -1 : 1; },
  };
}
