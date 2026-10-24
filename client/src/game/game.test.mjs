import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The game uses Vite's extensionless TS imports; resolve them for the Node check.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return nextResolve(specifier, context);
} });
const { Game, resolveEnemyBulletHits } = await import('./Game.ts');
const { EnemyBullet } = await import('./Bullet.ts');
const { Input } = await import('./Input.ts');
const { PET, WORLD } = await import('./config.ts');
const { Enemy } = await import('./Enemy.ts');
for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.1]) {
  const boss = new Enemy('golem', WORLD.width / 2);
  const range = WORLD.width / 2 - boss.width / 2 - 10;
  let minX = boss.x;
  let maxX = boss.x;
  for (let time = 0; time < 16; time += dt) {
    const previousX = boss.x;
    const entering = boss.y < 140;
    boss.update(dt, { x: 240, y: 600 }, 1, () => {});
    assert.ok(Math.abs(boss.x - previousX) <= range * 0.8 * dt + 1e-8,
      `Boss must not teleport when entering patrol (dt=${dt})`);
    if (entering && boss.y < 140) assert.equal(boss.x, WORLD.width / 2);
    assert.ok(boss.y <= 140, 'Boss stops at hover height');
    assert.ok(boss.x >= boss.width / 2 + 10 && boss.x <= WORLD.width - boss.width / 2 - 10);
    minX = Math.min(minX, boss.x);
    maxX = Math.max(maxX, boss.x);
  }
  assert.equal(boss.y, 140);
  assert.ok(minX < WORLD.width / 2 - range * 0.99 && maxX > WORLD.width / 2 + range * 0.99,
    'Boss still patrols both sides');
}
console.log('Boss: continuous entrance and patrol at 30/60/144 FPS and 100ms steps checks passed');
const handlers = new Map();
globalThis.window = {
  innerWidth: 960, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: (name, listener) => handlers.set(name, listener),
  removeEventListener: (name) => handlers.delete(name),
};
globalThis.document = new EventTarget();
let frame;
globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
const canvas = new EventTarget();
Object.assign(canvas, { style: {}, getContext: () => ({ setTransform() {} }) });
const profile = { id: 'pet-cat-001', previewPath: '/assets/previews/pet.png' };
const game = new Game(canvas, profile);
// Rendering is checked in the browser; this check advances input and simulation.
game.render = () => {};
assert.equal(game.activatePetSkill(), false, 'Main screen blocks skill');
game.setSettingsOpen(true);
game.startRun();
assert.equal(game.state, 'ready', 'Settings blocks starting');
game.setSettingsOpen(false);
game.startRun();
assert.equal(game.pet.cooldownRemaining, 0, 'New run starts ready');
game.pet.update(12, game.player);
assert.equal(game.pet.isShieldActive, false, 'No automatic activation');
assert.equal(game.activatePetSkill(), true);
assert.equal(game.player.isShieldActive, true, 'Immediate player protection');
assert.equal(game.player.takeDamage(), false);
assert.equal(game.pet.cooldownRemaining, PET.shieldCooldown);
assert.equal(game.activatePetSkill(), false, 'Spam blocked');
const bullet = new EnemyBullet(game.player.x, game.player.y, 0, 0);
let absorbed = 0;
resolveEnemyBulletHits(game.player, [bullet], () => absorbed++, () => assert.fail('Shield leaked damage'));
assert.equal(absorbed, 1);
game.pet.update(PET.shieldDuration, game.player);
assert.equal(game.player.isShieldActive, false);
assert.equal(game.pet.cooldownRemaining, 7);
assert.equal(game.player.takeDamage(), true, 'Damage resumes after shield');
game.state = 'paused';
game.step(5);
assert.equal(game.pet.cooldownRemaining, 7, 'Pause freezes cooldown');
assert.equal(game.activatePetSkill(), false, 'Pause blocks skill');
game.state = 'gameover';
assert.equal(game.activatePetSkill(), false, 'Game over blocks skill');
game.state = 'playing';
game.pet.update(20, game.player);
assert.equal(game.pet.cooldownRemaining, 0, 'Cooldown clamps at zero');
assert.equal(game.pet.isShieldActive, false, 'Cooldown expiry does not activate');
assert.equal(game.activatePetSkill(), true, 'Manual reuse');
game.best = 123;
game.score = 10;
game.enemyBullets.push(bullet);
const selectedPet = game.pet;
game.returnToMain();
assert.equal(game.state, 'ready');
assert.equal(game.pet, selectedPet, 'Selection preserved');
assert.equal(game.best, 123);
assert.equal(game.score, 0);
assert.equal(game.enemyBullets.length, 0);
assert.equal(game.player.isShieldActive, false);
assert.equal(game.pet.cooldownRemaining, 0);
game.startRun();
game.player.lives = 0;
game.step(0);
assert.equal(game.state, 'gameover', 'Depleted health ends the run');
game.startRun();
assert.equal(game.state, 'playing', 'Retry starts a fresh run');
assert.equal(game.player.lives, 3, 'Retry restores health');
assert.equal(game.score, 0);
game.player.lives = 0;
game.step(0);
game.returnToMain();
assert.equal(game.state, 'ready', 'Game over can return to main');
assert.equal(game.pet, selectedPet, 'Game over return preserves pet');
assert.equal(game.best, 123, 'Game over return preserves best score');
game.startRun();
game.start();
const key = (code, repeat = false, target = canvas) => handlers.get('keydown')({ code, repeat, target, preventDefault() {} });
key('KeyE');
frame(performance.now() + 16);
assert.equal(game.pet.isShieldActive, true, 'E activates skill');
game.pet.update(11, game.player);
key('KeyE', true);
frame(performance.now() + 32);
assert.equal(game.pet.isShieldActive, false, 'Held E does not reactivate');
key('KeyE', false, {});
frame(performance.now() + 48);
assert.equal(game.pet.isShieldActive, false, 'Other focused UI blocks game input');
document.hidden = true;
document.dispatchEvent(new Event('visibilitychange'));
assert.equal(game.state, 'paused', 'Hidden tab pauses game');
game.stop();
assert.equal(handlers.size, 0, 'Stop removes window listeners');
const input = new Input();
input.attach(canvas);
key('KeyE');
assert.equal(input.wasPressed('KeyE'), true);
handlers.get('blur')();
assert.equal(input.wasPressed('KeyE'), false, 'Blur clears pending input');
input.detach();
console.log('Game: manual skill, shield collision, pause, reset, keyboard and cleanup checks passed');
