import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

/**
 * 🟩 생성 모델 펫(뼈대·걷기 애니메이션 없음)의 다리 걷기 동작 (창규)
 * 강아지·고양이·판다·구미호는 모델 안의 Walk 애니메이션을 쓰고,
 * 나머지 생성 모델은 이름이 붙은 다리 부품(foot_*, leg_*, side_foot)을 코드로 번갈아 움직인다.
 * 다리 부품이 없는 펫(물고기 등)은 null → 지금처럼 통통 튀며 따라온다.
 *
 * 다리 좌표는 모델 원본 단위(펫 높이 약 1.7)라서, 아래 값도 그 단위 기준이다.
 */
type Leg = { node: TransformNode; x: number; y: number; z: number; turn: Quaternion; phase: number; stride: number; lift: number; swing: number };
export type PetGait = { update(moving: boolean, seconds: number): void };

const STEP_RATE = 13;   // 걷는 중 위상 속도 (rad/s) → 1초에 약 2걸음 주기

export function createPetGait(meshes: AbstractMesh[], actor: TransformNode): PetGait | null {
  const model = actor.getChildren()[0] as TransformNode | undefined;
  if (!model) return null;
  const parts = meshes.filter(mesh => /^(foot_|leg_|side_foot)/.test(mesh.name));
  if (!parts.length) return null;
  const feet = parts.filter(mesh => mesh.name.startsWith('foot_'));
  const biped = feet.length === 2 && parts.length === 2;   // 병아리·펭귄·앵무새: 두 발로 뒤뚱뒤뚱
  const crawler = parts.some(mesh => mesh.name === 'side_foot');   // 애벌레: 앞에서 뒤로 물결치듯
  const legs: Leg[] = parts.map(node => {
    const { x, y, z } = node.position;
    let phase: number;
    let stride = .13, lift = .15, swing = .4;
    if (node.name.startsWith('leg_')) {
      // 게 다리 leg_{-1|1}_{0..2}: 한쪽 0·2번과 반대쪽 1번이 같이 움직이는 삼각 보행
      const [, side, index] = node.name.split('_').map(Number);
      phase = ((side > 0 ? 0 : 1) + index) % 2 * Math.PI;
      stride = .05; lift = .09; swing = 0;
    } else if (crawler) {
      // 앞발부터 뒤로 차례차례 (z 가 클수록 먼저)
      phase = -z * 4.5 + (x < 0 ? 0 : Math.PI / 3);
      stride = .05; lift = .08; swing = .2;
    } else if (biped) {
      phase = x < 0 ? 0 : Math.PI;
      stride = .12; lift = .14;
    } else {
      // 네 발: 대각선 짝(왼앞+오른뒤 / 오른앞+왼뒤)이 같이 나가는 종종걸음
      const front = node.name.endsWith('_front');
      const left = node.name.includes('_L_');
      phase = front === left ? 0 : Math.PI;
    }
    // glTF 부품은 rotationQuaternion 으로 돌므로, 원래 회전에 앞뒤 흔들림을 곱해서 쓴다
    const turn = node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
    node.rotationQuaternion = turn.clone();
    return { node, x, y, z, turn, phase, stride, lift, swing };
  });
  const base = { y: model.position.y, rz: model.rotation.z };
  const scale = model.scaling.y || 1;
  const tilt = new Quaternion();
  let cycle = 0;
  let amount = 0;   // 0 = 서 있음, 1 = 걷는 중 (멈출 때 다리를 부드럽게 제자리로)
  return {
    update(moving, seconds) {
      const dt = Math.min(Math.max(seconds, 0), .05);
      amount += ((moving ? 1 : 0) - amount) * Math.min(1, dt * (moving ? 10 : 6));
      if (moving) cycle += dt * STEP_RATE;
      // 몸통은 한 걸음마다 살짝 오르내림 (월드 단위 약 2.5cm). 발은 그만큼 내려서 바닥에 붙어 있게 한다
      const bob = (1 - Math.cos(cycle * 2)) / 2 * .025 * amount;
      model.position.y = base.y + bob;
      model.rotation.z = base.rz + (biped ? Math.sin(cycle) * .1 * amount : 0);   // 두 발 펫은 좌우로 뒤뚱
      for (const leg of legs) {
        const t = cycle + leg.phase;
        // 발을 앞으로 내딛는 동안(cos>0)만 들어 올리고, 디딘 뒤에는 바닥을 밀며 뒤로
        leg.node.position.set(
          leg.x,
          leg.y + (Math.max(0, Math.cos(t)) * leg.lift - bob / scale) * amount,
          leg.z + Math.sin(t) * leg.stride * amount,
        );
        if (leg.swing) leg.turn.multiplyToRef(Quaternion.RotationAxisToRef(Vector3.Right(), Math.sin(t) * leg.swing * amount, tilt), leg.node.rotationQuaternion!);
      }
    },
  };
}
