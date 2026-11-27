import { airborne, blocked, flatWorld, nearShop, nearPortal, petRadius, portalPosition, stepFollowing, stepMotion, type Motion } from './movement.ts';
import { BRIDGE, BRIDGES, petRoomLayout, STATION, STREAM, TERRACE, terrainHeight } from './petRoomMap.ts';

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
assert(delayed.x <= 6.5 * 0.05 + 1e-9, 'Frame delta cap');
console.log('Movement: 6 checks passed');

const follower = { x: 0, z: 0 };
assert(!stepFollowing(follower, { x: 1, z: 0 }, .02) && follower.x === 0, 'Following stops within gap');
assert(!stepFollowing(follower, follower, .02), 'Coincident positions stay finite');
assert(stepFollowing(follower, { x: 4, z: 0 }, .02) && Math.abs(follower.x - 8 * .02) < 1e-10, 'Following approaches');
const delayedPet = { x: 0, z: 0 };
stepFollowing(delayedPet, { x: 4, z: 0 }, 30);
assert(delayedPet.x <= 8 * .05 + 1e-9, 'Following frame cap');
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

const { shop: shopPosition, portal, limit, world } = petRoomLayout;
const shop = { ...shopPosition, y: 0 };
assert(nearShop(shop, shopPosition), 'Shop in range');
assert(nearShop({ ...shop, x: shop.x - 2 }, shopPosition), 'Shop boundary inclusive');
assert(!nearShop({ ...shop, x: shop.x - 2.01 }, shopPosition), 'Shop beyond boundary');
assert(!nearShop({ ...shop, y: .1 }, shopPosition), 'Shop requires ground');
assert(!nearPortal(shop, portal, world) && !nearShop({ ...portal, y: world.height(portal.x, portal.z) }, shopPosition, world), 'Shop and pet room portal ranges separate');
assert(!blocked(world, shop.x, shop.z) && !blocked(world, portal.x, portal.z - 1.5), 'Shop and portal approachable');
const wide = fresh();
for (let i = 0; i < 2000; i++) stepMotion(wide, 1, -1, false, 0.02, limit);
assert(wide.x === limit && wide.z === -limit, 'Pet room bounds');
console.log('Shop proximity and pet room: 7 checks passed');

// 충돌과 높이: 상점 부스를 통과하지 못하고, 경사로로 테라스에 올라 포털에 닿습니다.
const walker = { x: STATION.x, y: 0, z: 2, velocityY: 0 };
for (let i = 0; i < 400; i++) stepMotion(walker, 0, 1, false, 0.02, limit, world);
assert(walker.z < STATION.z - 1.7 && !blocked(world, walker.x, walker.z), 'Station blocks walking through');
const climber = { x: 0, y: 0, z: 0, velocityY: 0 };
for (let i = 0; i < 1200 && !nearPortal(climber, portal, world); i++) stepMotion(climber, 0, 1, false, 0.02, limit, world);
assert(nearPortal(climber, portal, world) && Math.abs(climber.y - TERRACE.height) < .01, 'Ramp leads up to portal');
const wallHugger = { x: 8, y: 0, z: 10, velocityY: 0 };
for (let i = 0; i < 400; i++) stepMotion(wallHugger, 0, 1, false, 0.02, limit, world);
assert(wallHugger.z < TERRACE.z - .6 && wallHugger.y === 0, 'Terrace wall blocks without ramp');
const jumper2 = { x: 8, y: 0, z: 12.5, velocityY: 0 };
for (let i = 0; i < 200; i++) stepMotion(jumper2, 0, 1, i % 20 === 0, 0.02, limit, world);
assert(jumper2.z < TERRACE.z, 'Jumping cannot skip the terrace wall');
const pet = { x: STATION.x, z: 4 };
for (let i = 0; i < 300; i++) stepFollowing(pet, { x: STATION.x, z: 14 }, .05, limit, world);
assert(!blocked(world, pet.x, pet.z, petRadius), 'Following pet stays out of buildings');
assert(flatWorld.height(3, 3) === 0, 'Flat world for my room');
console.log('Collision and terrain: 6 checks passed');

// 다리: 길 방향으로 건너면 다리 바닥 위로 올라가고, 옆으로는 난간에 막힙니다.
const bridge = BRIDGES[0]!;
const dir = { x: Math.sin(bridge.heading), z: Math.cos(bridge.heading) };
const crosser = { x: bridge.x - dir.x * (BRIDGE.length / 2 + .8), y: 0, z: bridge.z - dir.z * (BRIDGE.length / 2 + .8), velocityY: 0 };
crosser.y = world.height(crosser.x, crosser.z);
let highest = 0;
for (let i = 0; i < 120; i++) {
  stepMotion(crosser, dir.x, dir.z, false, .02, limit, world);
  highest = Math.max(highest, crosser.y - terrainHeight(crosser.x, crosser.z));
}
assert(highest > .3, 'Walking over the bridge raises the character onto the deck');
assert(Math.hypot(crosser.x - bridge.x, crosser.z - bridge.z) > BRIDGE.length / 2, 'Bridge can be crossed end to end');
const sideways = { x: bridge.x, y: world.height(bridge.x, bridge.z), z: bridge.z, velocityY: 0 };
const side = { x: Math.cos(bridge.heading), z: -Math.sin(bridge.heading) };
for (let i = 0; i < 200; i++) stepMotion(sideways, side.x, side.z, false, .02, limit, world);
assert(Math.abs((sideways.x - bridge.x) * side.x + (sideways.z - bridge.z) * side.z) < BRIDGE.width / 2, 'Bridge rails stop walking off the side');
const [streamX, streamZ] = STREAM[10]!;
const wader = { x: streamX + 2.5, y: 0, z: streamZ, velocityY: 0 };
wader.y = world.height(wader.x, wader.z);
for (let i = 0; i < 300; i++) stepMotion(wader, -1, 0, false, .02, limit, world);
assert(wader.x > streamX, 'Stream cannot be waded across away from the bridge');
console.log('Bridge: 4 checks passed');

// 테라스(높이 2) 위에서도 점프 판정은 그 자리 바닥 기준 (예전엔 y > 0 이라 테라스에서 계속 점프 자세로 굳음)
{
  const world = petRoomLayout.world, limit = petRoomLayout.limit;
  const walker = { x: 0, y: world.height(0, 18), z: 18, velocityY: 0 };
  assert(walker.y === TERRACE.height && !airborne(walker, world), 'Standing on the terrace is not airborne');
  let floated = false;
  for (let i = 0; i < 400 && walker.z > 4; i++) { stepMotion(walker, 0, -1, false, 1 / 60, limit, world); floated ||= airborne(walker, world); }
  assert(walker.z <= 4 && !floated, 'Walking down the ramp never counts as a jump');
  const hopper = { x: 0, y: world.height(0, 18), z: 18, velocityY: 0 };
  stepMotion(hopper, 0, 0, true, .05, limit, world);
  for (let i = 0; i < 3; i++) stepMotion(hopper, 0, 0, false, .05, limit, world);
  assert(airborne(hopper, world), 'Jumping on the terrace is airborne');
  console.log('Terrace jump state: 3 checks passed');
}
