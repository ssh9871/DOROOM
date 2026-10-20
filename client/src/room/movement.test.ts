import { nearPortal, portalPosition, stepFollowing, stepMotion, type Motion } from './movement.ts';

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

const follower = { x: 0, z: 0 };
assert(!stepFollowing(follower, { x: 1, z: 0 }, .02) && follower.x === 0, 'Following stops within gap');
assert(!stepFollowing(follower, follower, .02), 'Coincident positions stay finite');
assert(stepFollowing(follower, { x: 4, z: 0 }, .02) && Math.abs(follower.x - .1) < 1e-10, 'Following approaches');
const delayedPet = { x: 0, z: 0 };
stepFollowing(delayedPet, { x: 4, z: 0 }, 30);
assert(delayedPet.x <= .25, 'Following frame cap');
const closePet = { x: 0, z: 0 };
stepFollowing(closePet, { x: 1.21, z: 0 }, .05);
assert(Math.abs(1.21 - closePet.x - 1.2) < 1e-10, 'Following does not overshoot gap');
const cornerPet = { x: -8.7, z: -8.7 };
for (let i = 0; i < 300; i++) stepFollowing(cornerPet, { x: 8.7, z: 8.7 }, .05);
assert(cornerPet.x <= 8.7 && cornerPet.z <= 8.7 && Math.hypot(8.7 - cornerPet.x, 8.7 - cornerPet.z) >= 1.2 - 1e-10, 'Following corner bounds and gap');
assert(nearPortal({ ...portalPosition, y: 0 }), 'Portal in range');
assert(!nearPortal({ x: 0, z: 0, y: 0 }), 'Portal out of range');
assert(!nearPortal({ ...portalPosition, y: .5 }), 'Portal requires ground');
console.log('Following and portal: 9 checks passed');
