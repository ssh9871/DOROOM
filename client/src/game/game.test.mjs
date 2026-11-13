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
  assert.ok(new Set(stages[stage].boss).size >= 2);
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
  const boss = new Enemy('boss', '1-1', 240, ['fan']);
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

const stopped = new EnemyBullet(100, 100, 100, 0, 5, 'basic', true);
stopped.update(0.65, 480, 720);
near(stopped.x, 165);
stopped.update(0.5, 480, 720);
near(stopped.x, 165);
stopped.update(0.15, 480, 720);
near(stopped.x, 175);
start({ skill: 'clear' });
game.enemyBullets.push(stopped);
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
assert.equal(game.enemies.filter(enemy => enemy.kind === 'normal').length, 2);
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

for (let stage = 0; stage < stages.length; stage++) {
  start({ stage });
  game.step(dt);
  assert.equal(game.enemies.length, 2);
  game.enemies = [];
  game.eliteIndex = 4;
  game.areaTime = 299;
  game.waveTimer = 0;
  game.step(dt);
  assert.equal(game.enemies.filter(enemy => enemy.kind === 'normal').length, 2, stages[stage].id);
}
assert.ok(game.enemies[0].maxHp > new Enemy('normal', game.enemies[0].sprite, 240).maxHp);

const shooter = new Enemy('normal', 'patrol-drone', 240);
shooter.y = 35;
const shots = [];
shooter.update(1.9, { x: 240, y: 600 }, 10, shot => shots.push(shot), () => {}, () => {});
assert.equal(shots.length, 1, 'First shot fires as soon as the normal attack timer expires');
assert.equal(shots[0].radius, 6);

function bossVolleys(attack, seconds) {
  const boss = new Enemy('boss', '2-3', 240, [attack]);
  boss.y = 140;
  const volleys = [];
  for (let time = 0; time < seconds; time += dt) {
    const shots = [];
    boss.update(dt, { x: 300, y: 600 }, 180, shot => shots.push(shot), () => {}, () => {});
    if (shots.length) volleys.push(shots);
  }
  return volleys;
}

const patternSpeeds = [
  'single', 'diagonal', 'burst', 'fan', 'fixed', 'fixed-double', 'cross', 'radial',
  'stop', 'dash', 'return-dash', 'sweep', 'spray', 'barrier', 'reinforce', 'crane',
  'twin-radial', 'open-fan', 'split', 'corridor', 'ricochet',
].map(attack => {
  const shots = bossVolleys(attack, 7).flat();
  assert.ok(shots.length > 1, attack);
  const speed = Math.hypot(shots[0].vx, shots[0].vy);
  for (const shot of shots) near(Math.hypot(shot.vx, shot.vy), speed);
  return Math.round(speed);
});
assert.equal(new Set(patternSpeeds).size, patternSpeeds.length, 'Each attack has a distinct speed');

const [openFirst, openSecond] = bossVolleys('open-fan', 2);
assert.equal(openFirst.length, 4);
assert.ok(openFirst.every(shot => Math.abs(shot.vx) > 10));
assert.deepEqual(openFirst.map(shot => shot.vx), openSecond.map(shot => shot.vx));

const walls = bossVolleys('corridor', 7);
const gap = volley => [24, 72, 120, 168, 216, 264, 312, 360, 408, 456]
  .filter(x => !volley.some(shot => shot.x === x));
assert.deepEqual(walls.slice(0, 6).map(gap), [[168, 216], [216, 264], [264, 312], [264, 312], [216, 264], [168, 216]]);

const [splitVolley] = bossVolleys('split', 1);
const parent = splitVolley[1];
parent.update(0.8, WORLD.width, WORLD.height);
assert.deepEqual(parent.split(1), []);
parent.update(0.11, WORLD.width, WORLD.height);
const children = parent.split(1);
assert.equal(parent.alive, false);
assert.equal(children.length, 2);
assert.ok(children[0].vx < 0 && children[1].vx > 0);
for (const child of children) near(Math.hypot(child.vx, child.vy), Math.hypot(parent.vx, parent.vy));
assert.deepEqual(parent.split(1), []);
const unsplit = splitVolley[0];
unsplit.update(1, WORLD.width, WORLD.height);
assert.deepEqual(unsplit.split(0), []);
assert.ok(unsplit.alive);

const [bounceVolley] = bossVolleys('ricochet', 1);
const bouncing = bounceVolley[0];
while (bouncing.vx < 0 && bouncing.alive) bouncing.update(dt, WORLD.width, WORLD.height);
assert.ok(bouncing.alive && bouncing.vx > 0);
while (bouncing.alive) bouncing.update(dt, WORLD.width, WORLD.height);
assert.ok(bouncing.vx > 0, 'Only one side-wall reflection');

const [frozen, aimed] = bossVolleys('stop', 2);
assert.equal(frozen.length, 8);
assert.equal(aimed.length, 1);
assert.equal(aimed[0].shot, 'aimed');

// Aim is measured from the nozzle that actually fired, after any movement.
for (const [id, attack, shotType, count] of [
  ['2-1', 'return-dash', 'aimed', 3], ['2-2', 'spray', 'spray', 5],
  ['2-3', 'fan', 'aimed', 3], ['3-1', 'barrier', 'aimed', 1],
]) {
  const boss = new Enemy('boss', id, 240, [attack]);
  const volleys = [];
  for (let time = 0; time < 8; time += dt) {
    const target = { x: 280 + time * 14, y: 610 };
    const volley = [];
    boss.update(dt, target, 180, shot => volley.push(shot), () => {}, () => {});
    if (volley[0]?.shot === shotType) volleys.push({ volley, target });
  }
  assert.ok(volleys.length > 0, id);
  for (const { volley, target } of volleys.slice(0, attack === 'spray' ? 2 : 1)) {
    assert.equal(volley.length, count);
    const center = volley[Math.floor(count / 2)];
    const speed = Math.hypot(center.vx, center.vy);
    const distance = Math.hypot(target.x - center.x, target.y - center.y);
    near(center.vx / speed, (target.x - center.x) / distance);
    near(center.vy / speed, (target.y - center.y) / distance);
  }
  if (attack === 'spray') assert.notEqual(volleys[0].volley[0].x, volleys[1].volley[0].x, 'Both nozzles fire');
}

let previousWaveDelay = Infinity;
for (let stage = 0; stage < stages.length; stage++) {
  start({ stage });
  game.step(dt);
  assert.ok(game.waveTimer < previousWaveDelay, 'Each stage shortens the wave interval');
  previousWaveDelay = game.waveTimer;
}
start();
const patrol = new Enemy('normal', 'patrol-drone', 100);
patrol.y = 35;
game.enemies = [patrol];
game.waveTimer = 10;
game.step(1.4);
assert.equal(game.enemyBullets.length, 1);
near(Math.hypot(game.enemyBullets[0].vx, game.enemyBullets[0].vy), 119);

for (const sprite of ['patrol-drone', 'mower', 'guard', 'carrier', 'sprayer', 'armored-worker', 'small-worker', 'relay']) {
  const enemy = new Enemy('normal', sprite, 105);
  enemy.update(0.5, { x: 240, y: 600 }, 180, () => {}, () => {}, () => {});
  assert.ok(Math.abs(enemy.x - 105) > 10, sprite + ' moves laterally');
}
for (const [sprite, attack] of [['patrol', 'dash'], ['irrigation', 'return-dash'], ['maintenance', 'reinforce'], ['hub', 'sweep']]) {
  const persistent = new Enemy('elite', sprite, 110, [attack]);
  const emitted = [];
  for (let i = 0; i < 65 / dt; i++) {
    persistent.update(dt, { x: 240, y: 600 }, 180, shot => emitted.push(shot), () => {}, () => {});
    assert.ok(persistent.y <= WORLD.height - persistent.height / 2);
  }
  assert.ok(persistent.alive && emitted.length > 10);
  if (sprite === 'hub') assert.ok(emitted.some(shot => shot.vy < 0), 'Hub elite fires radial volleys');
}

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

start();
const elite = new Enemy('elite', 'patrol', 240, ['dash']);
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
