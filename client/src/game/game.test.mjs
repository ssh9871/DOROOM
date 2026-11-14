import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return nextResolve(specifier, context);
} });

const { Game } = await import('./Game.ts');
const { Enemy } = await import('./Enemy.ts');
const { EnemyBullet, PlayerBullet } = await import('./Bullet.ts');
const { createPetState } = await import('../pets/pets.ts');
const { baseLevels, scoreRun, weekStart, weeklyRanking } = await import('./progress.ts');
const { battlePets } = await import('./petCatalog.ts');
const { canEnterEndless, canEnterStage, endlessStages, stages } = await import('./stages.ts');
const { WORLD } = await import('./config.ts');

const dt = 1 / 60;
const ctx = { fillRect() {} };
const canvas = new EventTarget();
canvas.getContext = () => ctx;
const results = [];
const game = new Game(canvas, () => {}, result => results.push(result));
game.render = () => {};
const start = (setup = {}) => game.startRun({ mode: 'stage', stage: 0, levels: baseLevels, skill: 'shield', petLevel: 1, ...setup });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

for (let stage = 0; stage < stages.length; stage++) {
  start({ stage });
  game.step(dt);
  game.player.hp = 1;
  game.skipToBoss();
  assert.deepEqual(game.enemies.map(enemy => enemy.sprite), [stages[stage].id]);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.elapsed, 0);
  assert.equal(game.canSkipToBoss, false);
  assert.equal(game.bossTimeLeft, stage === 0 ? undefined : 50);
  assert.ok(stages[stage].boss.length);
  game.areaTime += 20;
  game.step(0);
  assert.deepEqual(game.enemies.slice(1).map(enemy => enemy.sprite),
    [stages[stage].wave[0], stages[stage].wave[1 % stages[stage].wave.length]]);
}
game.abort();
assert.equal(results.pop().bossPractice, true);
start({ mode: 'endless' });
assert.equal(game.canSkipToBoss, false);

for (const step of [1 / 30, dt, 1 / 144, 0.1]) {
  const boss = new Enemy('boss', '1-1', 240, ['aimed-fan']);
  for (let time = 0; time < 16; time += step) {
    const previousX = boss.x;
    const entering = boss.y < 140;
    boss.update(step, { x: 240, y: 600 }, 180, () => {}, () => {}, () => {});
    assert.ok(Math.abs(boss.x - previousX) <= 72 * step + 1e-8);
    if (entering && boss.y < 140) assert.equal(boss.x, 240);
    assert.ok(boss.x >= boss.width / 2 && boss.x <= WORLD.width - boss.width / 2);
  }
  assert.equal(boss.y, 140);
}

assert.equal(stages.length, 12);
stages.forEach((stage, index) => {
  assert.equal(canEnterStage(index, {}, false), index === 0);
  assert.equal(canEnterStage(index, {}, true), true);
  assert.ok(stage.start.length && stage.clear.length);
  const root = '../../public/assets/minigame/';
  for (const path of [`props/${stage.prop}.png`, `bosses/boss-${stage.id}.png`,
    `maps/map-0${stage.zone + 1}.png`, `backgrounds/battle-0${stage.zone + 1}.png`,
    ...stage.wave.map(id => `enemies/enemy-${id}.json`)]) {
    assert.ok(existsSync(new URL(root + path, import.meta.url)), path);
  }
  const sheet = JSON.parse(readFileSync(new URL(root + `bosses/boss-${stage.id}.json`, import.meta.url)));
  assert.deepEqual(sheet.meta.frameTags.map(tag => tag.name), ['idle', 'attack', 'purified']);
});
assert.equal(canEnterStage(3, { '1-3': true }, false), true);
assert.equal(canEnterStage(12, {}, true), false);
assert.equal(canEnterEndless({}, false), false);
assert.equal(canEnterEndless({}, true), true);
assert.equal(canEnterEndless({ '4-3': true }, false), true);

start();
assert.equal(game.player.hp, 5);
assert.equal(game.activatePetSkill(), true);
assert.equal(game.pet.cooldownRemaining, 60);
assert.equal(game.activatePetSkill(), false);
assert.equal(game.player.takeDamage(), false);
game.enemyBullets.push(new EnemyBullet(game.player.x, game.player.y, 0, 0));
game.step(dt);
assert.equal(game.enemyBullets.length, 0);
assert.equal(game.player.hp, 5);
assert.equal(game.playerBullets.length, 1);
game.state = 'paused';
const previous = [game.elapsed, game.pet.cooldownRemaining, game.pet.effectRemaining];
game.step(5);
assert.deepEqual([game.elapsed, game.pet.cooldownRemaining, game.pet.effectRemaining], previous);
game.resume();
game.pet.update(3, game.player);
assert.equal(game.player.takeDamage(), true);
assert.equal(game.player.takeDamage(), false);

start({ skill: 'heal' });
assert.equal(game.activatePetSkill(), false);
assert.equal(game.pet.cooldownRemaining, 0);
game.player.hp = 4;
assert.equal(game.activatePetSkill(), true);
assert.equal(game.player.hp, 5);
start({ skill: 'rapid-fire', levels: { amount: 2, damage: 2, size: 1, 'max-hp': 3 } });
assert.equal(game.player.hp, 8);
assert.equal(game.activatePetSkill(), true);
assert.equal(game.player.fireRate, 1.3);
game.step(dt);
assert.equal(game.playerBullets.length, 3);
near(game.playerBullets[0].damage, 1.2);
assert.ok(game.playerBullets[0].width > new PlayerBullet(0, 0).width);
game.pet.update(5, game.player);
assert.equal(game.player.fireRate, 1);

const accelerating = new EnemyBullet(100, 100, 100, 0, 6, 'basic', { acceleration: 40, maxSpeed: 124 });
accelerating.update(0.5, 480, 720);
near(accelerating.vx, 120);
accelerating.update(0.5, 480, 720);
near(accelerating.vx, 124);
start({ skill: 'clear' });
game.enemyBullets.push(accelerating);
assert.equal(game.activatePetSkill(), true);
game.step(dt);
assert.equal(game.enemyBullets.length, 0);

start();
for (const boundary of [60, 120, 180, 240]) {
  game.areaTime = boundary - dt;
  game.step(dt);
  assert.equal(game.enemies.filter(enemy => enemy.kind === 'elite').length, boundary / 60);
  game.step(dt);
  assert.equal(game.enemies.filter(enemy => enemy.kind === 'elite').length, boundary / 60);
}
game.enemies = game.enemies.filter(enemy => enemy.kind === 'elite');
game.waveTimer = 0;
game.step(dt);
assert.equal(game.enemies.filter(enemy => enemy.kind === 'normal').length, 10);
game.enemyBullets.push(new EnemyBullet(200, 200, 0, 0));
game.areaTime = 300 - dt;
game.elapsed = 300 - dt;
game.step(dt);
assert.deepEqual(game.enemies.map(enemy => enemy.kind), ['boss']);
assert.equal(game.enemyBullets.length, 0);
game.areaTime = 320 - dt;
game.step(0);
assert.deepEqual(game.enemies.map(enemy => enemy.kind), ['boss']);
game.step(dt);
assert.deepEqual(game.enemies.map(enemy => enemy.kind), ['boss', 'normal', 'normal']);
game.step(dt);
assert.equal(game.enemies.length, 3, 'Boss summons once per encounter');
game.elapsed = 340;
const boss = game.boss;
boss.y = 140;
boss.hp = 1;
game.playerBullets.push(new PlayerBullet(boss.x, boss.y));
game.player.hp = 1;
game.enemyBullets.push(new EnemyBullet(game.player.x, game.player.y, 0, 0));
game.step(0);
assert.equal(game.player.hp, 0);
assert.equal(results.at(-1).outcome, 'clear');
assert.equal(game.enemies.length, 0, 'Boss defeat clears remaining summons');
assert.equal(results.at(-1).seconds, 340);
assert.equal(game.score, 310);

start();
for (let i = 0; i < 300 / dt; i++) {
  // Keep the movement and firing loop at 60 Hz while checking the full spawn schedule.
  game.player.hp = game.player.maxHp;
  game.step(dt);
}
assert.equal(game.boss?.sprite, '1-1');
assert.equal(game.warning, 'boss-in');
assert.ok(game.purified > 0);
assert.equal(game.state, 'playing');
for (let i = 0; i < 110 / dt && game.state === 'playing'; i++) {
  game.player.hp = game.player.maxHp;
  game.player.x = (game.boss ?? game.enemies[0]).x;
  game.step(dt);
}
assert.equal(results.at(-1).outcome, 'clear');
assert.ok(results.at(-1).seconds > 300);

const waveCounts = [
  [10], [4], [4], [10, 4], [2], [10, 2], [5, 6], [2, 3], [5, 3], [12, 12, 4], [3, 3, 3], [12, 12, 4, 3, 5, 4, 3],
];
let previousWaveDelay = Infinity;
for (let stage = 0; stage < stages.length; stage++) {
  start({ stage });
  game.step(dt);
  assert.ok(game.waveTimer < previousWaveDelay, 'Each stage shortens the wave interval');
  previousWaveDelay = game.waveTimer;
  assert.equal(game.enemies.length, waveCounts[stage][0]);
  game.eliteIndex = 4;
  game.areaTime = 299;
  for (let i = 1; i <= stages[stage].wave.length; i++) {
    game.enemies = [];
    game.waveTimer = 0;
    game.step(0);
    const wave = i % stages[stage].wave.length;
    assert.equal(game.enemies.length, waveCounts[stage][wave], stages[stage].id);
    assert.ok(game.enemies.every(enemy => enemy.sprite === stages[stage].wave[wave]));
  }
}
assert.ok(game.enemies[0].maxHp > new Enemy('normal', game.enemies[0].sprite, 240).maxHp);

start({ stage: 9 });
game.step(0);
assert.equal(game.enemies.length, 12);
game.waveTimer = 0;
game.step(0);
assert.equal(game.enemies.length, 12, 'A crowded screen defers the entire next wave');
assert.equal(game.reachedWave, 1);
game.enemies = [];
game.waveTimer = 0;
game.step(0);
assert.deepEqual(new Set(game.enemies.map(enemy => enemy.sprite)), new Set(['carrier']));

function sample(enemy) {
  let time = 0;
  const target = { x: 240, y: 600 };
  const volleys = [];
  const tick = (room = 180) => {
    const shots = [];
    time += dt;
    enemy.update(dt, target, room, shot => shots.push(shot), () => false, () => {}, 1, 1);
    if (shots.length) volleys.push({ time, shots });
  };
  const take = (n, room) => {
    const start = time;
    while (volleys.length < n && time - start < 15) tick(room);
    assert.equal(volleys.length, n, enemy.nextAttack);
    return volleys.map(volley => volley.shots);
  };
  return { take, tick, target, volleys };
}

for (const sprite of ['patrol-drone', 'carrier']) {
  const enemy = new Enemy('normal', sprite, 100);
  const run = sample(enemy);
  let furthest = enemy.x;
  for (let i = 0; i < 240; i++) {
    run.tick();
    furthest = Math.max(furthest, enemy.x);
  }
  assert.equal(run.volleys.length, 0, sprite);
  assert.ok(furthest > 130, sprite + ' moves laterally');
}

for (const [sprite, count, stage] of [
  ['mower', 4], ['small-worker', 8], ['sprayer', 10], ['guard', 3], ['relay', 1],
  ['armored-worker', 1], ['armored-worker', 18, '4-2'],
]) {
  const enemy = new Enemy('normal', sprite, 240, [], 1, undefined, { stage });
  const [shots] = sample(enemy).take(1);
  assert.equal(shots.length, count, sprite);
  assert.ok(shots.every(shot => shot.radius === 6));
  if (sprite === 'sprayer') {
    const speed = shot => Math.hypot(shot.vx, shot.vy);
    assert.ok(speed(shots[0]) < speed(shots[1]));
    near(Math.atan2(shots[0].vx, shots[0].vy), Math.atan2(shots[1].vx, shots[1].vy));
  }
}

const bossAttack = attack => sample(new Enemy('boss', '2-3', 240, [attack]));
const angle = shot => Math.atan2(shot.vx, shot.vy) * 180 / Math.PI;
const speed = shot => Math.hypot(shot.vx, shot.vy);
const offset = bossAttack('offset-fan');
const rings = offset.take(6, 0);
assert.equal(rings.flat().length, 108, 'Boss fires the complete pattern on a full screen');
for (const [step, shots] of rings.entries()) {
  const shift = step >= 3 ? 10 : 0;
  const headings = shots.map(shot => (Math.round(angle(shot)) + 360) % 360);
  assert.deepEqual(headings, Array.from({ length: 18 }, (_, i) => 20 * i + shift));
  for (const shot of shots) near(speed(shot), step < 3 ? 178 : 178 * 1.15);
}
for (let i = 1; i < rings.length; i++) near(offset.volleys[i].time - offset.volleys[i - 1].time, 0.15);

start();
game.skipToBoss();
game.boss.y = 140;
game.playerBullets = [];
for (let i = 0; i < 85; i++) game.step(dt);
assert.ok(game.enemyBullets.length > 72, 'Stage boss is not throttled by the old cap');

const stream = bossAttack('aimed-stream');
const [aimed] = stream.take(1);
near(speed(aimed[1]), 215);
stream.target.x = 430;
assert.ok(stream.take(10).every(shots => shots.length === 3));
near(angle(stream.volleys.at(-1).shots[1]), angle(aimed[1]));
const firstBoss = sample(new Enemy('boss', '1-1', 240, ['offset-fan']));
firstBoss.take(7);
near(firstBoss.volleys[6].time - firstBoss.volleys[5].time, 1.2);

const scheduledShots = run => run.volleys.flatMap(({ time, shots }) =>
  shots.map(shot => ({ shot, firedAt: time - dt + shot.firstStepDelay })));
const arcBoss = new Enemy('boss', '2-3', 240, ['arc-sweep']);
const arc = sample(arcBoss);
while (arcBoss.index === 0 && arcBoss.age < 5) arc.tick();
const arcShots = scheduledShots(arc);
assert.equal(arcShots.length, 74);
for (const [i, { shot, firedAt }] of arcShots.entries()) {
  near(speed(shot), 300);
  near(firedAt - arcShots[0].firedAt, i * 0.01);
  near(angle(shot) - angle(arcShots[0].shot), 5 * (i < 37 ? i : 73 - i));
}
const ringBoss = new Enemy('boss', '3-3', 240, ['ring-sweep']);
const ringRun = sample(ringBoss);
while (ringBoss.index === 0 && ringBoss.age < 8) ringRun.tick(0);
const ring = scheduledShots(ringRun);
assert.equal(ring.length, 144);
for (let i = 0; i < ring.length; i += 2) {
  const { shot, firedAt } = ring[i];
  const second = ring[i + 1];
  near(speed(shot), 200);
  near(speed(second.shot), 300);
  near(angle(shot), angle(second.shot));
  near(firedAt, second.firedAt);
  near(firedAt - ring[0].firedAt, i / 2 * 0.01);
  near((angle(shot) - angle(ring[0].shot) + 360) % 360, i / 2 * 5);
}
const lateShot = ring[2].shot;
const initialX = lateShot.x;
const initialY = lateShot.y;
const firstStepDelay = lateShot.firstStepDelay;
lateShot.update(dt, WORLD.width, WORLD.height);
near(Math.hypot(lateShot.x - initialX, lateShot.y - initialY), 200 * (dt - firstStepDelay));
const scatter = bossAttack('scatter');
const scatterShots = scatter.take(14, 0);
assert.deepEqual(scatterShots.map(shots => shots.length), [...Array(6).fill(72), ...Array(8).fill(71)]);
for (const shot of scatterShots.flat()) near(speed(shot), 250);
assert.ok(scatter.volleys.at(-1).time - scatter.volleys[0].time >= 3.12);
assert.equal(scatter.volleys.flatMap(volley => volley.shots).length, 1000);

const [turning] = bossAttack('redirect-fan').take(1);
assert.equal(turning.length, 7);
const redirected = turning[3];
const aimRight = { x: 400, y: 500 };
const initialAngle = angle(redirected);
redirected.update(1.99, WORLD.width, WORLD.height, aimRight);
near(speed(redirected), 164);
near(angle(redirected), initialAngle);
const expectedAngle = Math.atan2(aimRight.x - redirected.x, aimRight.y - redirected.y) * 180 / Math.PI;
redirected.update(0.02, WORLD.width, WORLD.height, aimRight);
near(angle(redirected), expectedAngle);
redirected.update(0.1, WORLD.width, WORLD.height, { x: 50, y: 500 });
near(angle(redirected), expectedAngle);
near(speed(redirected), 164 + 340 * 0.11);
redirected.update(1, WORLD.width, WORLD.height, aimRight);
near(speed(redirected), 470);

const laser = new Enemy('boss', '2-2', 240, ['laser']);
const beam = sample(laser);
for (let i = 0; laser.volley === 0 && i < 240; i++) beam.tick();
for (let shot = 0; shot < 3; shot++) {
  assert.equal(laser.volley, 2 * shot + 1);
  const beamTarget = { ...beam.target };
  assert.equal(laser.laserHits(beamTarget, 5), false, 'Telegraph deals no damage');
  beam.target.x += 80;
  for (let i = 0; i < 29; i++) beam.tick();
  assert.equal(laser.laserHits(beamTarget, 5), false);
  beam.tick();
  assert.equal(laser.volley, 2 * shot + 2);
  assert.ok(laser.laserHits(beamTarget, 5), 'Laser locks the telegraphed line');
  assert.equal(laser.laserHits(beam.target, 5), false);
  const strokeLines = [];
  laser.draw({
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo(x, y) { strokeLines.push([x, y]); },
    stroke() { assert.equal(this.lineWidth, 24); },
  });
  assert.equal(strokeLines.length, 1);
  for (let i = 0; i < 21; i++) beam.tick();
}
assert.equal(laser.index, 1, 'One attack completes after three beams');
assert.equal(laser.volley, 0);
assert.equal(laser.laserHits(beam.target, 5), false);

start({ stage: 11 });
game.skipToBoss();
game.boss.y = 140;
game.boss.hp = game.boss.maxHp / 2;
game.enemyBullets.push(new EnemyBullet(200, 200, 0, 0));
game.step(0);
assert.equal(game.enemyBullets.length, 0);
assert.equal(game.boss.nextAttack, 'laser');
game.step(0.79);
assert.equal(game.boss.volley, 0);
game.step(0.01);
assert.equal(game.boss.volley, 1);

start({ stage: 10 });
game.step(0);
assert.equal(game.enemies.filter(enemy => enemy.isWideShooter).length, 3);
const wideSources = new Set();
for (let i = 0; i < 24 / dt && game.enemies.some(enemy => enemy.sprite === 'sprayer'); i++) {
  game.player.hp = game.player.maxHp;
  game.player.x = 15;
  game.step(dt);
  for (const enemy of game.enemies) if (enemy.timeSinceAttack === 0) wideSources.add(enemy);
  assert.ok(game.enemyBullets.filter(shot => shot.wide).length <= 18);
}
assert.equal(wideSources.size, 3, 'Each wide shooter gets a turn');

start({ stage: 1 });
game.areaTime = game.elapsed = 300;
game.step(0);
assert.equal(game.boss.maxHp, 375);
assert.equal(game.bossTimeLeft, 50);
game.areaTime = game.elapsed = 350;
game.step(0);
assert.equal(results.at(-1).bossTimeout, true);
assert.equal(results.at(-1).outcome, 'return');

start({ petLevel: 2 });
game.step(dt);
near(game.playerBullets[0].damage, 1.15);

const petSave = new Map();
const petStorage = () => ({
  getItem: key => petSave.get(key) ?? null,
  setItem: (key, value) => petSave.set(key, value),
  removeItem: key => petSave.delete(key),
});
const petState = createPetState(petStorage);
assert.equal(battlePets.length, 4);
assert.equal(petState.equipRunPet('unknown-pet'), false);
for (const [index, pet] of battlePets.entries()) {
  assert.equal(petState.equipRunPet(pet.id), true);
  assert.equal(createPetState(petStorage).minigame.petId, pet.id);
  start({ pet, skill: pet.ability.id });
  assert.equal(game.player.maxHp, [5, 5, 6, 8][index]);
  game.player.hp--;
  const previousHp = game.player.hp;
  game.enemyBullets.push(new EnemyBullet(100, 100, 0, 0));
  assert.equal(game.activatePetSkill(), true);
  assert.equal(game.pet.cooldownRemaining, [15, 20, 25, 30][index]);
  assert.equal(game.player.hp, previousHp + Number(index === 0));
  assert.equal(game.player.fireRate, index === 1 ? 1.5 : 1);
  assert.equal(game.player.isShieldActive, index === 2);
  assert.equal(game.enemyBullets.length, index === 3 ? 0 : 1);
  game.step(dt);
  near(game.playerBullets[0].damage, [1, 1, 1.2, 1.5][index]);
}

start();
const elite = new Enemy('elite', 'patrol', 240, ['square']);
elite.y = 300;
elite.hp = 1;
game.enemies.push(elite);
game.playerBullets.push(new PlayerBullet(240, 300));
game.step(0);
assert.equal(game.potions.length, 1);
game.player.hp = 4;
game.potions[0].y = game.player.y;
game.step(0);
assert.equal(game.player.hp, 5);
assert.equal(game.potions.length, 0);
game.potions.push({ x: game.player.x, y: game.player.y }, { x: 240, y: 750 });
game.step(dt);
assert.equal(game.player.hp, 5);
assert.equal(game.potions.length, 0);

start({ mode: 'endless', stage: endlessStages[0] });
for (let area = 0; area < 4; area++) {
  assert.equal(game.stage.id, stages[endlessStages[area]].id);
  game.areaTime = 300;
  game.step(0);
  game.boss.y = 140;
  game.boss.hp = 1;
  game.playerBullets.push(new PlayerBullet(game.boss.x, game.boss.y));
  game.step(0);
  assert.equal(game.areaTime, 0);
}
assert.equal(game.stage.id, '1-3');
assert.equal(game.purified, 4);
game.abort();
game.abort();
assert.equal(results.length, 4);
assert.equal(results.at(-1).outcome, 'abort');

const handlers = new Map();
globalThis.window = { addEventListener: (name, listener) => handlers.set(name, listener), removeEventListener: name => handlers.delete(name) };
globalThis.document = new EventTarget();
let frame;
globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
const key = (code, target = canvas) => handlers.get('keydown')({ code, target, preventDefault() {} });
start();
game.start();
key('KeyP');
frame(performance.now() + 16);
assert.equal(game.state, 'playing');
key('Escape');
frame(performance.now() + 32);
assert.equal(game.state, 'paused');
key('Enter');
frame(performance.now() + 48);
assert.equal(game.state, 'paused');
key('Escape');
frame(performance.now() + 64);
assert.equal(game.state, 'playing');
key('KeyE', {});
frame(performance.now() + 80);
assert.equal(game.pet.cooldownRemaining, 0);
key('KeyE');
frame(performance.now() + 96);
assert.ok(game.pet.cooldownRemaining > 0);
document.hidden = true;
document.dispatchEvent(new Event('visibilitychange'));
assert.equal(game.state, 'paused');
game.stop();
assert.equal(handlers.size, 0);

const values = new Map();
let blocked = false;
const storage = () => ({ getItem: key => values.get(key) ?? null, setItem(key, value) {
  if (blocked) throw Error('storage blocked');
  values.set(key, value);
}, removeItem: key => values.delete(key) });
const initial = createPetState(storage);
assert.equal(initial.user.cells, 0);
assert.equal(canEnterStage(1, initial.minigame.cleared, false), false);
values.set('doroom.pet-progress', JSON.stringify({
  version: 4,
  user: { id: initial.user.id, cells: 1000 },
  pets: { [initial.pet.id]: { experience: 100 } },
}));
const state = createPetState(storage);
assert.match(state.grow(state.pet.id), /성장했/);
const monday = Date.parse('2026-11-16T00:00:00+09:00');
const defeat = { id: 'return', mode: 'stage', outcome: 'return', stage: 0, purified: 50, seconds: 240, completedAt: monday };
const clear = { ...defeat, id: 'clear', outcome: 'clear', seconds: 340, purified: 110 };
assert.deepEqual(scoreRun(defeat, 40), { survival: 240, purification: 500, score: 740, scoreCells: 29, clearCells: 0 });
assert.deepEqual(scoreRun(clear, 40), { survival: 300, purification: 1100, score: 1400, scoreCells: 56, clearCells: 40 });
const practice = { ...clear, bossPractice: true };
assert.equal(scoreRun(practice, 40).scoreCells + scoreRun(practice, 40).clearCells, 0);
const beforePractice = [state.user.cells, state.pet.experience, state.minigame];
assert.equal(state.recordRun(practice), true);
assert.deepEqual([state.user.cells, state.pet.experience, state.minigame], beforePractice);
assert.equal(state.recordRun(defeat), true);
assert.equal(state.recordRun(defeat), true);
assert.equal(state.user.cells, 929);
assert.equal(state.pet.experience, 50);
blocked = true;
assert.equal(state.recordRun(clear), false);
assert.equal(state.minigame.cleared['1-1'], undefined);
assert.equal(state.user.cells, 929);
assert.equal(state.pet.experience, 50);
assert.match(state.buyUpgrade('amount'), /저장하지/);
assert.equal(state.minigame.levels.amount, 0);
blocked = false;
assert.equal(state.recordRun(clear), true);
assert.equal(state.recordRun({ ...clear, id: 'abort', outcome: 'abort' }), true);
assert.equal(state.user.cells, 1025);
assert.match(state.buyUpgrade('amount'), /강화했/);
const restored = createPetState(storage);
assert.equal(restored.user.cells, 905);
assert.equal(restored.pet.experience, 160);
assert.equal(restored.minigame.levels.amount, 1);
assert.equal(restored.minigame.best['1-1'], 1400);
assert.equal(canEnterStage(1, restored.minigame.cleared, false), true);
assert.equal(restored.recordRun(clear), true);
assert.equal(restored.user.cells, 905);

assert.equal(weekStart(monday), monday);
assert.equal(weekStart(monday - 1), monday - 7 * 86400000);
const endless = { ...defeat, id: 'sunday', mode: 'endless', completedAt: monday - 1 };
restored.recordRun(endless);
restored.recordRun({ ...endless, id: 'monday', completedAt: monday });
restored.recordRun({ ...endless, id: 'tied', completedAt: monday + 1 });
restored.recordRun({ ...endless, id: 'late-save', completedAt: monday - 2, purified: 99 });
const ranking = createPetState(storage).weeklyRanking(monday + 1);
assert.equal(ranking.rows[0].id, 'monday');
assert.equal(ranking.rows[0].score, 740);
assert.equal(createPetState(storage).weeklyRanking(monday - 1).rows[0].id, 'late-save');
assert.equal(weeklyRanking([], restored.user, monday).rows.length, 0);
console.log('Minigame: stage assets, debug access, combat, skills, settlement, upgrades and Korean weekly ranking passed');
