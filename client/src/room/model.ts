import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';

export async function loadModel(scene: Scene, path: string, height: number) {
  const container = await SceneLoader.LoadAssetContainerAsync('/assets/', path, scene);
  if (scene.isDisposed) {
    container.dispose();
    throw new Error('Scene disposed during loading');
  }
  container.addAllToScene();
  container.animationGroups.forEach(group => group.stop());
  const root = new TransformNode('model', scene);
  container.rootNodes.forEach(node => { node.parent = root; });
  root.computeWorldMatrix(true);
  container.meshes.forEach(mesh => { mesh.computeWorldMatrix(true); mesh.refreshBoundingInfo({ applySkeleton: true }); });
  const bounds = root.getHierarchyBoundingVectors(true);
  const size = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(size) || size <= 0) {
    container.dispose();
    root.dispose();
    throw new Error('Invalid model bounds');
  }
  const scale = height / size;
  root.scaling.setAll(scale);
  root.position.set(-(bounds.min.x + bounds.max.x) / 2 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) / 2 * scale);
  const actor = new TransformNode('actor', scene);
  root.parent = actor;
  return { actor, container };
}
