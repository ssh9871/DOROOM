import { Background } from './Background';
import type { SoundCue } from './audio';
import { EnemyBullet, PlayerBullet } from './Bullet';
import { BOSS_AT, ELITES, ENEMY_ESCAPE_PENALTY, PLAYER, WORLD } from './config';
import { Effects } from './Effects';
import { Enemy, isWideAttack, normalAttack, waveSize } from './Enemy';
import { ENDLESS, endlessBossBaseHp, endlessDifficulty, endlessLoop, endlessStageIndex, endlessZone, totalZoneBonus, zoneBonus } from './endless';
import { Input } from './Input';
import { Pet } from './Pet';
import { Player } from './Player';
import { eliteSprites, stages } from './stages';
import { BOSS_TIME_LIMIT, type RunOutcome, type RunResult, type RunSetup } from './progress';
import { drawSprite } from './sprites';
import { circleRectOverlap, circlesOverlap, rectsOverlap } from './utils';

export type GameState = 'ready' | 'playing' | 'paused' | 'gameover';
export type ZoneNotice = 'zone-clear';
const FIXED_DT = 1 / 60;
const MAX_ENEMIES = 24;
const STAGE_NORMAL_LIMIT = 18;
const SHOOTER_LIMIT = 6;
const WIDE_SHOOTER_LIMIT = 3;
const MAX_SHOTS = 180;
const EPSILON = 1e-8;

export function resolveEnemyBulletHits(
  player: Player, bullets: readonly EnemyBullet[],
  onAbsorb: (bullet: EnemyBullet) => void, onHit: (bullet: EnemyBullet) => void,
): void {
  for (const bullet of bullets) {
    const radius = player.isShieldActive ? PLAYER.shieldRadius : player.hitRadius;
    if (bullet.alive && circlesOverlap(player.x, player.y, radius, bullet.x, bullet.y, bullet.radius)) {
      bullet.alive = false;
      (player.isShieldActive ? onAbsorb : onHit)(bullet);
    }
  }
}

export class Game {
  state: GameState = 'ready';
  elapsed = 0;
  areaTime = 0;
  purified = 0;
  readonly player = new Player();
  readonly pet = new Pet();
  enemies: Enemy[] = [];
  playerBullets: PlayerBullet[] = [];
  enemyBullets: EnemyBullet[] = [];
  potions: { x: number; y: number }[] = [];

  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new Input();
  private readonly background = new Background();
  private readonly effects = new Effects();
  private setup?: RunSetup;
  private id = '';
  private area = 0;
  private eliteIndex = 0;
  private waveIndex = 0;
  private enterFromLeft = true;
  private reachedWave = 0;
  private waveTimer = 0;
  private bossPhase = false;
  private bossSummoned = false;
  private bossPractice = false;
  private bossDefeated?: Enemy;
  /** 무한 모드: 보스를 정화한 구역 번호(0부터) */
  clearedAreas: number[] = [];
  /** 무한 모드: 구역 전환 안내 */
  zoneNotice?: ZoneNotice;
  private noticeTime = 0;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly updateUi: () => void,
    private readonly finish: (result: RunResult) => void,
    private readonly sound?: (cue: SoundCue) => void,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D를 열 수 없습니다.');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  get isEndless() { return this.setup?.mode === 'endless'; }
  get stage() { return stages[this.isEndless ? endlessStageIndex(this.area) : this.setup?.stage ?? 0]!; }
  /** 무한 모드 HUD용: 구역(1~4), 회차(1~), 위험도 */
  get endlessInfo() {
    return { area: this.area, zone: endlessZone(this.area) + 1, loop: endlessLoop(this.area) + 1,
      tier: endlessDifficulty(this.area, this.areaTime).tier };
  }
  private get bossAt() { return this.isEndless ? ENDLESS.zoneSeconds : BOSS_AT; }
  private get eliteTimes(): readonly number[] { return this.isEndless ? ENDLESS.elites : ELITES; }
  get boss() { return this.enemies.find(enemy => enemy.kind === 'boss'); }
  get canSkipToBoss() {
    return this.setup?.mode === 'stage' && this.state === 'playing' && !this.bossPhase;
  }
  get bossTimeLeft() {
    if (!this.bossPhase || this.bossDefeated || this.isEndless) return;  // 무한 모드 보스는 제한 시간 없음
    if (this.setup?.mode === 'stage' && this.setup.stage > 0)
      return Math.max(0, BOSS_AT + BOSS_TIME_LIMIT - this.areaTime);
  }
  get score() {
    const seconds = this.setup?.mode === 'endless' ? this.elapsed : Math.min(this.elapsed, BOSS_AT);
    return this.purified * 10 + Math.floor(seconds + EPSILON);
  }
  /** 무한 모드 구역 클리어 보너스 합계 (서버 ENDLESS_RULE 과 같은 공식) */
  get zoneBonusScore() { return this.isEndless ? totalZoneBonus(this.clearedAreas) : 0; }
  get warning() {
    if (this.zoneNotice && this.noticeTime > 0) return this.zoneNotice;
    if (this.bossPhase) return this.areaTime < this.bossAt + 3 ? 'boss-in' : '';
    if (this.areaTime >= this.bossAt - 5) return 'boss';
    const next = this.eliteTimes[this.eliteIndex];
    return next !== undefined && this.areaTime >= next - 5 ? 'elite' : '';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.input.attach(this.canvas);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  startRun(setup: RunSetup, id = crypto.randomUUID()): void {
    this.setup = { ...setup, levels: { ...setup.levels } };
    this.id = id;
    this.area = this.elapsed = this.purified = 0;
    this.reachedWave = 0;
    this.bossPractice = false;
    this.clearedAreas = [];
    this.zoneNotice = undefined;
    this.noticeTime = 0;
    this.player.reset(this.setup.levels, setup.petLevel, setup.pet, setup.entryShieldSeconds);
    this.pet.reset(this.player, setup.skill, setup.pet);
    this.resetArea();
    this.state = 'playing';
    this.input.clear();
    this.accumulator = 0;
    this.render();
    this.updateUi();
  }

  returnToMain(): void {
    this.input.clear();
    this.state = 'ready';
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.input.clear();
    this.state = 'playing';
    this.updateUi();
  }

  abort(): void {
    if (this.state === 'playing' || this.state === 'paused') this.endRun('abort');
  }

  skipToBoss(): void {
    if (!this.setup || !this.canSkipToBoss) return;
    this.bossPractice = true;
    this.elapsed = this.purified = 0;
    this.reachedWave = 0;
    this.player.reset(this.setup.levels, this.setup.petLevel, this.setup.pet);
    this.pet.reset(this.player, this.setup.skill, this.setup.pet);
    this.resetArea();
    this.input.clear();
    this.areaTime = BOSS_AT;
    this.spawn(0);
    this.render();
    this.updateUi();
  }

  activatePetSkill(): boolean {
    if (this.state !== 'playing' || !this.pet.activate(this.player, () => { this.enemyBullets = []; })) return false;
    this.sound?.(this.pet.skill);
    if (this.pet.skill === 'clear') this.effects.play('bullet-clear', WORLD.width / 2, WORLD.height / 2, 0.5);
    if (this.pet.skill === 'heal') this.effects.play('heal', this.player.x, this.player.y);
    this.updateUi();
    return true;
  }

  private resetArea(keepBackground = false): void {
    this.areaTime = this.eliteIndex = this.waveIndex = this.waveTimer = 0;
    this.enterFromLeft = true;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.potions = [];
    this.bossPhase = false;
    this.bossSummoned = false;
    this.bossDefeated = undefined;
    if (!keepBackground) {
      this.effects.clear();
      this.background.reset();
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.accumulator += Math.min(Math.max(0, now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    if (this.input.wasPressed('Escape')) {
      if (this.state === 'paused') this.resume();
      else if (this.state === 'playing') this.pause();
      this.accumulator = 0;
    } else if (this.input.wasPressed('KeyE')) this.activatePetSkill();

    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    this.input.endFrame();
    if (this.state === 'playing') {
      this.render();
      this.updateUi();
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.clear();
    this.updateUi();
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.state === 'playing') this.pause();
  };

  step(dt: number): void {
    if (this.state !== 'playing' || !this.setup) return;
    this.elapsed += dt;
    this.areaTime += dt;
    this.background.update(dt);
    this.effects.update(dt);
    this.pet.update(dt, this.player);
    this.player.update(dt, this.input, bullet => this.playerBullets.push(bullet), () => this.sound?.('playerShot'));
    this.spawn(dt);

    this.noticeTime = Math.max(0, this.noticeTime - dt);
    const isStage = this.setup.mode === 'stage';
    const endless = endlessDifficulty(this.area, this.areaTime);
    const pace = isStage ? 0.7 + this.setup.stage * 0.01 : endless.pace;
    const bulletSpeed = isStage ? 0.7 + this.setup.stage * 0.014 : endless.bulletSpeed;
    // Give waiting shooters a turn even when a wide volley takes longer than their cooldown.
    const enemies = this.enemies.slice().sort((a, b) =>
      Number(b.kind === 'boss') - Number(a.kind === 'boss') || b.timeSinceAttack - a.timeSinceAttack);
    let activeShooters = enemies.filter(enemy => enemy.isShooter && enemy.isFiring).length;
    let wideInFlight = this.enemyBullets.some(bullet => bullet.wide);
    for (const enemy of enemies) {
      const shotLimit = isStage ? 48 : Math.min(MAX_SHOTS, endless.shotLimit);
      const shooting = enemy.isFiring;
      const canStart = (!enemy.isShooter || activeShooters < 2)
        && (!isWideAttack(enemy.nextAttack) || !wideInFlight);
      enemy.update(dt, this.player, shotLimit - this.enemyBullets.length,
        bullet => {
          this.enemyBullets.push(bullet);
          if (bullet.wide) wideInFlight = true;
        }, () => this.reinforce(enemy.x), () => { this.enemyBullets = []; }, pace, bulletSpeed, canStart, this.sound);
      if (enemy.isShooter && !shooting && enemy.timeSinceAttack === 0) activeShooters++;
    }
    // 처치 못 한 몹이 아래로 빠져나가면 HP 1 감소 (같은 프레임에 여러 마리여도 1회, 무적·보호막 규칙 동일)
    const escaped = enemies.find(enemy => enemy.escaped);
    if (ENEMY_ESCAPE_PENALTY && escaped) this.damagePlayer(escaped.x, WORLD.height - 12);

    for (const bullet of this.playerBullets) bullet.update(dt, WORLD.width, WORLD.height);
    for (const bullet of this.enemyBullets) bullet.update(dt, WORLD.width, WORLD.height, this.player);
    this.handleCollisions();
    this.updatePotions(dt);
    this.enemies = this.enemies.filter(enemy => enemy.alive);
    this.playerBullets = this.playerBullets.filter(bullet => bullet.alive);
    this.enemyBullets = this.enemyBullets.filter(bullet => bullet.alive);

    const areaCleared = this.bossDefeated;
    if (areaCleared) this.enemies = [];
    if (areaCleared && this.setup.mode === 'stage') this.endRun('clear');
    else if (this.player.hp <= 0) this.endRun('return');
    else if (areaCleared) {
      // 무한 모드: 보스를 정화해야만 다음 구역으로 (제한 시간 없음)
      this.sound?.('victory');
      this.advanceZone();
    } else if (this.bossTimeLeft !== undefined && this.bossTimeLeft <= EPSILON) this.endRun('return', true);
    else if (!this.bossSummoned && this.areaTime + EPSILON >= this.bossAt + (this.isEndless ? ENDLESS.bossReinforceAfter : 20)) {
      const boss = this.boss;
      if (boss) {
        this.bossSummoned = true;
        this.reinforce(boss.x, this.stage.wave);
        this.effects.play('enemy-reinforce', boss.x, boss.y);
      }
    }
  }

  /** 무한 모드: 보스 정화 후 다음 구역으로. 배경은 크로스페이드, 생존 시간·정화 수는 이어짐 */
  private advanceZone(): void {
    const previous = this.stage;
    this.clearedAreas.push(this.area);
    this.area++;
    this.resetArea(true);
    this.background.transition(previous);
    this.zoneNotice = 'zone-clear';
    this.noticeTime = ENDLESS.noticeSeconds;
  }

  private spawn(dt: number): void {
    const stage = this.stage;
    const isStage = this.setup?.mode === 'stage';
    const endless = endlessDifficulty(this.area, this.areaTime);
    const difficulty = isStage ? 1 : endless.enemyHp;
    const stageIndex = isStage ? this.setup!.stage : 0;
    if (this.bossPhase) return;
    if (this.areaTime + EPSILON >= this.bossAt) {
      const bossHp = isStage ? (stageIndex === 0 ? 160 : 375 + 32 * (stageIndex - 1)) : endlessBossBaseHp(this.area);
      this.enemies = [new Enemy('boss', stage.id, WORLD.width / 2, stage.boss, isStage ? 1 : endless.bossHp, bossHp, { stage: stage.id })];
      this.enemyBullets = [];
      this.bossPhase = true;
      this.sound?.('bossEnter');
      return;
    }
    const next = this.eliteTimes[this.eliteIndex];
    if (next !== undefined && this.areaTime + EPSILON >= next) {
      const lane = [85, 395, 145, 335][this.eliteIndex % 4]!;
      const health = isStage ? 1 + stageIndex * 0.045 : endless.eliteHp;
      this.enemies.push(new Enemy('elite', eliteSprites[stage.zone]!, lane, stage.elite, health, undefined, { stage: stage.id }));
      this.eliteIndex++;
    }
    this.waveTimer -= dt;
    if (this.waveTimer > EPSILON) return;
    this.waveTimer = isStage
      ? 3.4 - stageIndex * 0.065 - this.areaTime / 2400
      : endless.spawnInterval;
    const sprite = stage.wave[this.waveIndex % stage.wave.length]!;
    const attack = normalAttack(sprite, stage.id);
    const count = waveSize(sprite, stage.id, stage.zone);
    if (!this.canSpawnNormals(count, attack ? count : 0, isWideAttack(attack) ? count : 0)) return;

    const health = isStage ? 1 + stageIndex * 0.075 : difficulty;
    const left = this.enterFromLeft;
    for (let i = 0; i < count; i++) {
      const x = attack ? WORLD.width * (i + 0.5) / count : (left ? 60 : 420) + (i % 2) * (left ? 62 : -62);
      const offset = attack ? 0 : Math.floor(i / 2) * 55 + (i % 2) * 23;
      this.enemies.push(new Enemy('normal', sprite, x, [], health, undefined,
        { stage: stage.id, delay: i * 0.6, offset }));
    }
    if (!attack) this.enterFromLeft = !left;
    this.waveIndex++;
    this.reachedWave++;
  }

  private canSpawnNormals(count: number, shooters: number, wide: number): boolean {
    const live = this.enemies.filter(enemy => enemy.alive);
    const capacity = this.setup?.mode === 'stage'
      ? STAGE_NORMAL_LIMIT - live.filter(enemy => enemy.kind === 'normal').length
      : MAX_ENEMIES - (this.bossPhase ? 0 : this.eliteTimes.length - this.eliteIndex) - live.length;
    return count <= capacity
      && shooters + live.filter(enemy => enemy.isShooter).length <= SHOOTER_LIMIT
      && wide + live.filter(enemy => enemy.isWideShooter).length <= WIDE_SHOOTER_LIMIT;
  }

  private reinforce(x: number, sprites: readonly string[] = ['small-worker']): boolean {
    const stage = this.setup?.mode === 'stage' ? this.setup.stage : undefined;
    const health = stage === undefined ? endlessDifficulty(this.area, this.areaTime).enemyHp : 1 + stage * 0.075;
    let spawned = false;
    for (let i = 0; i < 2; i++) {
      const sprite = sprites[i % sprites.length]!;
      const attack = normalAttack(sprite, this.stage.id);
      if (!this.canSpawnNormals(1, Number(!!attack), Number(isWideAttack(attack)))) break;
      this.enemies.push(new Enemy('normal', sprite, Math.min(440, Math.max(40, x + (i === 0 ? -90 : 90))),
        [], health, undefined, { stage: this.stage.id, delay: i * 0.6 }));
      spawned = true;
    }
    if (spawned) this.sound?.('reinforce');
    return spawned;
  }

  private handleCollisions(): void {
    for (const bullet of this.playerBullets) {
      if (!bullet.alive) continue;
      for (const enemy of this.enemies) {
        if (!enemy.alive || !rectsOverlap(bullet.x, bullet.y, bullet.width, bullet.height,
          enemy.x, enemy.y, enemy.width, enemy.height)) continue;
        bullet.alive = false;
        this.effects.play('hit-spark', bullet.x, bullet.y, 0.4, 36);
        if (enemy.hit(bullet.damage)) {
          this.purified++;
          this.effects.play('purify', enemy.x, enemy.y);
          if (enemy.kind === 'elite') this.potions.push({ x: enemy.x, y: enemy.y });
          if (enemy.kind === 'boss') this.bossDefeated = enemy;
          else this.sound?.('purify');
        } else this.sound?.('enemyHit');
        break;
      }
    }
    const { player } = this;
    resolveEnemyBulletHits(player, this.enemyBullets,
      bullet => {
        this.effects.play('hit-spark', bullet.x, bullet.y, 0.4, 24);
        this.sound?.('absorb');
      }, () => this.damagePlayer());
    for (const enemy of this.enemies) {
      if (enemy.laserHits(player, player.hitRadius) || (enemy.alive
        && circleRectOverlap(player.x, player.y, player.hitRadius, enemy.x, enemy.y, enemy.width, enemy.height)))
        this.damagePlayer();
    }
  }

  private updatePotions(dt: number): void {
    const { player } = this;
    this.potions = this.potions.filter(potion => {
      potion.y += 60 * dt;
      if (circlesOverlap(player.x, player.y, 24, potion.x, potion.y, 12)) {
        if (player.heal()) {
          this.effects.play('heal', player.x, player.y);
          this.sound?.('heal');
        }
        return false;
      }
      return potion.y - 12 <= WORLD.height;
    });
  }

  private damagePlayer(x = this.player.x, y = this.player.y): void {
    if (!this.player.takeDamage()) return;
    this.effects.play('hit-spark', x, y);
    this.sound?.('damage');
  }

  private endRun(outcome: RunOutcome, bossTimeout = false): void {
    if (this.state === 'gameover' || !this.setup) return;
    this.state = 'gameover';
    if (this.bossDefeated) this.enemyBullets = [];
    this.render();
    const seconds = Math.round(this.elapsed * 1e8) / 1e8;
    this.finish({ id: this.id, mode: this.setup.mode, stage: this.setup.stage, outcome, seconds,
      purified: this.purified, reachedWave: this.reachedWave, completedAt: Date.now(), bossTimeout, bossPractice: this.bossPractice,
      ...(this.isEndless && { clearedAreas: [...this.clearedAreas], reachedZone: this.area + 1 }) });
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#15263a';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    this.background.draw(ctx, this.stage);
    for (const bullet of this.playerBullets) bullet.draw(ctx);
    for (const enemy of this.enemies) enemy.draw(ctx);
    this.bossDefeated?.draw(ctx);
    for (const potion of this.potions) drawSprite(ctx, 'projectiles/hp-potion', potion.x, potion.y);
    this.pet.draw(ctx);
    if (this.player.hp > 0) this.player.draw(ctx);
    for (const bullet of this.enemyBullets) bullet.draw(ctx);
    if (this.pet.skill === 'rapid-fire' && this.pet.effectRemaining > 0)
      drawSprite(ctx, 'effects/fx-rapid-fire', this.player.x, this.player.y - 40, { time: this.elapsed, scale: 1 });
    this.effects.draw(ctx);
  }
}
