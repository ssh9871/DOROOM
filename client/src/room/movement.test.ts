import { stepMotion, type Motion } from './movement.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
const fresh = (): Motion => ({ x: 0, y: 0, z: 0, velocityY: 0 });
const straight = fresh();
const diagonal = fresh();
stepMotion(straight, 1, 0, false, 0.02);
stepMotion(diagonal, 1, 1, false, 0.02);
assert(Math.abs(straight.x - Math.hypot(diagonal.x, diagonal.z)) < 1e-10, 'Diagonal speed');
const jumper = fresh();
stepMotion(jumper, 0, 0, true, 0.02);
assert(jumper.y > 0, 'Jump begins');
const before = jumper.velocityY;
stepMotion(jumper, 0, 0, true, 0.02);
assert(jumper.velocityY < before, 'No air jump');
for (let i = 0; i < 200; i++) stepMotion(jumper, 0, 0, false, 0.02);
assert(jumper.y === 0 && jumper.velocityY === 0, 'Landing');
const edge = fresh();
for (let i = 0; i < 500; i++) stepMotion(edge, 1, -1, false, 0.02);
assert(edge.x === 8.7 && edge.z === -8.7, 'Room bounds');
const delayed = fresh();
stepMotion(delayed, 1, 0, false, 30);
assert(delayed.x <= 0.2, 'Frame delta cap');
console.log('Movement: 6 checks passed');
