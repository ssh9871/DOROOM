import { Background } from './Background';
import { EnemyBullet, PlayerBullet } from './Bullet';
import { COLORS, DIFFICULTY_RAMP_SECONDS, PLAYER, STORAGE_KEY_BEST, WORLD } from './config';
import { Effects } from './Effects';
import { Enemy, EnemySpawner } from './Enemy';
import { Input } from './Input';
import { Pet } from './Pet';
import { Player } from './Player';
import { circleRectOverlap, circlesOverlap, rectsOverlap } from './utils';
import type { Pet as OwnedPet } from '../pets/pets';

export type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

/** 고정 시뮬레이션 간격(60Hz). 화면 주사율과 상관없이 게임 속도가 일정합니다. */
const FIXED_DT = 1 / 60;
/** 탭 전환 등으로 프레임이 크게 밀렸을 때 따라잡기 상한(초) */
const MAX_FRAME_TIME = 0.1;
const SCORE_HISTORY_KEY = 'dorobus_scores';

const FONT = "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Noto Sans CJK KR', sans-serif";

const PAUSE_BUTTONS = {
  continue: { x: WORLD.width / 2 - 110, y: 350, width: 220, height: 58 },
  quit: { x: WORLD.width / 2 - 110, y: 430, width: 220, height: 58 },
} as const;
type PauseButton = (typeof PAUSE_BUTTONS)[keyof typeof PAUSE_BUTTONS];

/**
 * 적 탄막 ↔ 플레이어 충돌 판정 (순수 함수: 단위 테스트 가능)
 *
 * 1. isShieldActive 이면 피해 없음. 쉴드 원에 닿은 탄막은 소멸(onAbsorb).
 * 2. 쉴드가 꺼져 있으면 작은 피격 판정(hitRadius)에 닿았을 때만 피해(onHit).
 */
export function resolveEnemyBulletHits(
  player: Player,
  bullets: readonly EnemyBullet[],
  onAbsorb: (bullet: EnemyBullet) => void,
  onHit: (bullet: EnemyBullet) => void,
): void {
  for (const bullet of bullets) {
    if (!bullet.alive) continue;

    if (player.isShieldActive) {
      if (circlesOverlap(player.x, player.y, PLAYER.shieldRadius, bullet.x, bullet.y, bullet.radius)) {
        bullet.alive = false;
        onAbsorb(bullet);
      }
      continue;
    }

    if (circlesOverlap(player.x, player.y, player.hitRadius, bullet.x, bullet.y, bullet.radius)) {
      bullet.alive = false; // 무적 시간 중에도 탄은 사라지지만 피해는 takeDamage 가 막아줍니다.
      onHit(bullet);
    }
  }
}

export class Game {
  state: GameState = 'ready';
  score = 0;
  best = 0;
  /** 플레이 시작 후 경과 시간(초). 일시정지 중에는 흐르지 않습니다. */
  elapsed = 0;

  readonly player = new Player();
  pet: Pet;
  enemies: Enemy[] = [];
  playerBullets: PlayerBullet[] = [];
  enemyBullets: EnemyBullet[] = [];

  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new Input();
  private readonly background = new Background();
  private readonly effects = new Effects();
  private readonly spawner = new EnemySpawner();

  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private shake = 0;
  private running = false;
  private scoreSaved = false;
  private settingsOpen = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    selectedPet: OwnedPet,
    private readonly updateUi: () => void = () => {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다.');
    this.ctx = ctx;
    this.pet = new Pet(this.player, selectedPet.previewPath);
    this.best = this.loadBest();
    this.resize();
  }

  // ───────────────────────── 시작 / 정지 ─────────────────────────

  /** 입력 리스너를 붙이고 requestAnimationFrame 메인 루프를 시작합니다. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.input.attach(this.canvas, this.onCanvasMouseDown);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'gameover') {
      this.saveScoreHistory();
    }
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.detach();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  returnToMain(): void {
    if (this.state !== 'ready') this.saveScoreHistory();
    this.resetRun();
    this.state = 'ready';
    this.updateUi();
  }

  setSettingsOpen(open: boolean): void {
    this.settingsOpen = open;
    this.input.clear();
  }

  selectPet(selectedPet: OwnedPet): void {
    if (this.state !== 'ready') return;
    this.pet = new Pet(this.player, selectedPet.previewPath);
  }

  activatePetSkill(): boolean {
    if (this.state !== 'playing' || this.settingsOpen || !this.pet.activateShield(this.player)) return false;
    this.effects.ring(this.player.x, this.player.y, COLORS.shieldEdge, PLAYER.shieldRadius + 14, 0.4);
    this.updateUi();
    return true;
  }

  /** 새 판을 시작합니다. */
  startRun(): void {
    if (this.settingsOpen) return;
    this.resetRun();
    this.state = 'playing';
    this.updateUi();
  }

  private resetRun(): void {
    this.input.clear();
    this.accumulator = 0;
    this.scoreSaved = false;
    this.score = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.effects.clear();
    this.spawner.reset();
    this.player.reset();
    this.pet.reset(this.player);
  }

  // ───────────────────────── 메인 루프 ─────────────────────────

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const frameTime = Math.min((now - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = now;

    this.handleStateInput();

    this.accumulator += frameTime;
    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.render();
    this.input.endFrame();
    this.rafId = requestAnimationFrame(this.frame);
  };

  /** 시작/일시정지/재시작 같은 "한 번 누르는" 입력 처리 */
  private handleStateInput(): void {
    if (this.settingsOpen) return;
    const confirm = this.input.wasPressed('Enter', 'Space');
    const pause = this.input.wasPressed('KeyP', 'Escape');

    switch (this.state) {
      case 'ready':
      case 'gameover':
        if (confirm) this.startRun();
        break;
      case 'playing':
        if (pause) this.state = 'paused';
        else if (this.input.wasPressed('KeyE')) this.activatePetSkill();
        break;
      case 'paused':
        if (pause || confirm) this.state = 'playing';
        break;
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.state === 'playing') this.state = 'paused';
  };

  /** 일시정지 버튼을 CSS 크기와 무관하게 논리 좌표로 판정합니다. */
  private readonly onCanvasMouseDown = (event: MouseEvent): void => {
    if (this.state !== 'paused') return;

    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WORLD.width;
    const y = ((event.clientY - rect.top) / rect.height) * WORLD.height;
    const inside = (button: PauseButton): boolean => (
      x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height
    );

    if (inside(PAUSE_BUTTONS.continue)) {
      this.state = 'playing';
      return;
    }
    if (inside(PAUSE_BUTTONS.quit)) {
      this.returnToMain();
    }
  };

  /** 고정 간격 시뮬레이션 1틱 */
  step(dt: number): void {
    // 배경은 어떤 상태에서도 계속 흐르되, 일시정지 중에는 멈춥니다.
    if (this.state !== 'paused') this.background.update(dt);
    this.effects.update(dt);
    this.shake = Math.max(0, this.shake - dt);

    if (this.state !== 'playing') return;

    this.elapsed += dt;

    // 플레이어(이동 + 자동 발사)
    this.player.update(dt, this.input, (b) => this.playerBullets.push(b));

    // 수동 발동한 방어막의 시간과 추적만 갱신합니다.
    this.pet.update(dt, this.player);

    // 적 생성 및 이동/발사
    this.enemies.push(...this.spawner.update(dt, this.elapsed, this.enemies));
    const difficulty = this.difficulty;
    for (const enemy of this.enemies) {
      enemy.update(dt, this.player, difficulty, (b) => this.enemyBullets.push(b));
    }

    // 탄환 이동
    for (const b of this.playerBullets) b.update(dt, WORLD.width, WORLD.height);
    for (const b of this.enemyBullets) b.update(dt, WORLD.width, WORLD.height);

    this.handleCollisions();

    // 죽은 객체 정리
    this.enemies = this.enemies.filter((e) => e.alive);
    this.playerBullets = this.playerBullets.filter((b) => b.alive);
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);

    if (this.player.lives <= 0) this.endRun();
  }

  /** 1(시작) → 2(DIFFICULTY_RAMP_SECONDS 이후) 로 올라가는 난이도 계수 */
  get difficulty(): number {
    return 1 + Math.min(1, this.elapsed / DIFFICULTY_RAMP_SECONDS);
  }

  // ───────────────────────── 충돌 판정 ─────────────────────────

  private handleCollisions(): void {
    this.collidePlayerBulletsWithEnemies();

    // 적 탄막 ↔ 플레이어 (쉴드 중이면 무피해 + 탄막 소멸)
    resolveEnemyBulletHits(
      this.player,
      this.enemyBullets,
      (bullet) => this.effects.burst(bullet.x, bullet.y, COLORS.shieldEdge, 4, 90, 3),
      () => this.damagePlayer(),
    );

    this.collideEnemyBodiesWithPlayer();
  }

  /** 플레이어 탄환 ↔ 적 */
  private collidePlayerBulletsWithEnemies(): void {
    for (const bullet of this.playerBullets) {
      if (!bullet.alive) continue;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (!rectsOverlap(bullet.x, bullet.y, bullet.width, bullet.height, enemy.x, enemy.y, enemy.width, enemy.height)) {
          continue;
        }
        bullet.alive = false;
        this.effects.burst(bullet.x, bullet.y, COLORS.playerBullet, 2, 120, 3);
        if (enemy.hit(bullet.damage)) this.destroyEnemy(enemy);
        break;
      }
    }
  }

  /** 적 몸체 ↔ 플레이어 (쉴드 중에는 무피해) */
  private collideEnemyBodiesWithPlayer(): void {
    const { player } = this;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (circleRectOverlap(player.x, player.y, player.hitRadius + 8, enemy.x, enemy.y, enemy.width, enemy.height)) {
        this.damagePlayer();
      }
    }
  }

  private damagePlayer(): void {
    if (!this.player.takeDamage()) return; // 쉴드/무적이면 false
    this.shake = 0.3;
    this.effects.burst(this.player.x, this.player.y, COLORS.player, 18, 220, 5);
  }

  private destroyEnemy(enemy: Enemy): void {
    this.score += enemy.score;
    const big = enemy.kind === 'golem';
    this.effects.burst(enemy.x, enemy.y, '#9ca3af', big ? 60 : 16, big ? 340 : 200, big ? 8 : 5);
    this.effects.burst(enemy.x, enemy.y, '#facc15', big ? 30 : 8, big ? 300 : 160, big ? 6 : 4);
    if (big) {
      this.shake = 0.5;
      // 보스를 잡으면 화면의 적 탄막을 모두 정화합니다.
      for (const b of this.enemyBullets) {
        b.alive = false;
        this.effects.burst(b.x, b.y, COLORS.playerBullet, 1, 60, 3);
      }
    }
  }

  private endRun(): void {
    this.saveScoreHistory();
    this.state = 'gameover';
    this.effects.burst(this.player.x, this.player.y, COLORS.player, 50, 320, 6);
    this.shake = 0.5;
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest();
    }
  }

  /** 한 판의 최종 점수를 로컬 리더보드에 한 번만 추가합니다. */
  private saveScoreHistory(): void {
    if (this.scoreSaved) return;
    this.scoreSaved = true;

    try {
      const raw = localStorage.getItem(SCORE_HISTORY_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const scores: number[] = Array.isArray(parsed)
        ? parsed.filter((value): value is number => (
          typeof value === 'number' && Number.isFinite(value) && value >= 0
        ))
        : [];

      scores.push(this.score);
      localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(scores.slice(-50)));
    } catch {
      // 저장소가 차단된 환경에서도 게임 종료 자체는 정상 동작합니다.
    }
  }

  // ───────────────────────── 렌더링 ─────────────────────────

  /**
   * 캔버스를 창 크기에 맞춰 키우되 논리 해상도(WORLD)의 비율은 유지합니다.
   * 고해상도(Retina) 화면에서도 선명하도록 devicePixelRatio 를 반영합니다.
   */
  private readonly resize = (): void => {
    const cssScale = Math.min(window.innerWidth / WORLD.width, Math.max(1, window.innerHeight - 56) / WORLD.height);
    const ratio = cssScale * (window.devicePixelRatio || 1);
    this.canvas.style.width = `${Math.floor(WORLD.width * cssScale)}px`;
    this.canvas.style.height = `${Math.floor(WORLD.height * cssScale)}px`;
    this.canvas.width = Math.round(WORLD.width * ratio);
    this.canvas.height = Math.round(WORLD.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  private render(): void {
    const { ctx } = this;
    ctx.save();
    // 투명 캔버스를 유지합니다. 밝은 놀이공원 페이지 배경이 캔버스 뒤에서 보입니다.
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    if (this.shake > 0) {
      const power = this.shake * 14;
      ctx.translate((Math.random() - 0.5) * power, (Math.random() - 0.5) * power);
    }

    // 그리는 순서 = 레이어 순서(아래 → 위)
    this.background.draw(ctx);
    for (const b of this.playerBullets) b.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    if (this.state !== 'ready') {
      this.pet.draw(ctx);
      if (this.player.lives > 0) this.player.draw(ctx);
    }
    for (const b of this.enemyBullets) b.draw(ctx);
    this.effects.draw(ctx);
    ctx.restore();

    if (this.state !== 'ready') this.drawHud();
    this.drawOverlay();
    this.updateUi();
  }

  private drawHud(): void {
    const { ctx } = this;
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`점수 ${this.score}`, 12, 10);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`최고 ${this.best}`, WORLD.width - 12, 14);

    // 생명: 파란 사각형
    ctx.textAlign = 'left';
    for (let i = 0; i < PLAYER.maxLives; i += 1) {
      ctx.fillStyle = i < this.player.lives ? COLORS.player : 'rgba(255,255,255,0.12)';
      ctx.fillRect(12 + i * 22, 40, 16, 16);
    }

  }

  private drawOverlay(): void {
    const { ctx } = this;
    if (this.state === 'playing') return;

    // 시작 화면과 일시정지 화면 모두 맑은 하늘 테마의 밝은 패널을 사용합니다.
    ctx.fillStyle = 'rgba(235, 250, 255, 0.72)';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = WORLD.width / 2;

    const line = (text: string, y: number, size: number, color: string, bold = false): void => {
      ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(text, cx, y);
    };

    if (this.state === 'ready') {
      line('도로랜드', 200, 22, COLORS.textDim);
      line('정화의 비행', 250, 46, COLORS.accent, true);
      line('펫과 함께 하늘을 날아보세요', 300, 16, COLORS.text);
      line('방향키  이동    Shift  천천히 이동', 400, 15, COLORS.textDim);
      line('총알은 자동 발사', 428, 15, COLORS.textDim);
      line('E  펫 스킬    P / Esc  일시정지', 456, 15, COLORS.textDim);
    } else if (this.state === 'paused') {
      line('일시정지', 300, 40, COLORS.text, true);
      this.drawPauseButton(PAUSE_BUTTONS.continue, '계속하기', '#dbeafe', '#2563eb');
      this.drawPauseButton(PAUSE_BUTTONS.quit, '메인으로', '#ffe4e6', '#e11d48');
      line('버튼을 클릭하거나 P / Esc 로 계속하기', 525, 14, COLORS.textDim);
    } else if (this.state === 'gameover') {
      line('정화 실패...', 270, 42, '#fca5a5', true);
      line(`점수 ${this.score}`, 335, 26, COLORS.text, true);
      line(this.score > 0 && this.score >= this.best ? '최고 기록 달성!' : `최고 ${this.best}`, 372, 16, COLORS.accent);
      line('Enter 또는 Space 로 다시 도전', 450, 18, COLORS.text);
    }
  }

  private drawPauseButton(
    button: PauseButton,
    label: string,
    fill: string,
    stroke: string,
  ): void {
    const { ctx } = this;
    const radius = 14;
    ctx.beginPath();
    ctx.moveTo(button.x + radius, button.y);
    ctx.arcTo(button.x + button.width, button.y, button.x + button.width, button.y + button.height, radius);
    ctx.arcTo(button.x + button.width, button.y + button.height, button.x, button.y + button.height, radius);
    ctx.arcTo(button.x, button.y + button.height, button.x, button.y, radius);
    ctx.arcTo(button.x, button.y, button.x + button.width, button.y, radius);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = stroke;
    ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2);
  }

  // ───────────────────────── 최고 점수 저장 ─────────────────────────

  private loadBest(): number {
    try {
      return Number(localStorage.getItem(STORAGE_KEY_BEST)) || 0;
    } catch {
      return 0; // 저장소 접근이 막힌 환경에서도 게임은 동작해야 합니다.
    }
  }

  private saveBest(): void {
    try {
      localStorage.setItem(STORAGE_KEY_BEST, String(this.best));
    } catch {
      /* 무시 */
    }
  }
}
