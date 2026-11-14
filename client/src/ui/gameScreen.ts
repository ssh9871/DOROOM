import { Game } from '../game/Game';
import { asset, areaImage, drawSprite, loadBattle, loadSprite } from '../game/sprites';
import { endlessStages, operations, speakers, stages, type Dialogue } from '../game/stages';
import { BOSS_TIME_LIMIT, skills, upgradeIds, upgrades, type Levels, type RunResult, type RunSetup, type SkillId, type UpgradeId } from '../game/progress';
import { battlePets } from '../game/petCatalog';
import type { GameResult, Pet, StageList, StatUpgrade } from '../../../shared/types';
import { minigameApi } from '../api/minigame';
import { formatRankingWeek } from './weeklyRanking';

const icon = (key: string) => `<img src="${asset(`ui/${key}`)}" alt="">`;
const button = (action: string, label: string, key?: string) =>
  `<button type="button" data-action="${action}">${key ? icon(key) : ''}${label}</button>`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const returned: readonly Dialogue[] = [['void', '위험 한계 도달. 자동 귀환을 시작합니다.']];
const statCodes = { amount: 'PROJECTILE_COUNT', damage: 'DAMAGE', size: 'PROJECTILE_SIZE', 'max-hp': 'HP' };
const abilityIds: Record<string, SkillId> = { HEAL: 'heal', RAPID_FIRE: 'rapid-fire', SHIELD: 'shield', BULLET_CLEAR: 'clear' };
const sortieScore = (seconds: number, kills: number) => Math.floor(Math.round(seconds * 1000) / 1000) * 10 + kills * 5;

export function openGame(onClose: () => void, onBalance: (cells: number) => void): () => void {
  const api = minigameApi();
  const overlay = document.createElement('div');
  overlay.id = 'game-fullscreen-overlay';
  overlay.className = 'game-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '도로랜드: 펫 정화 작전');
  overlay.innerHTML = `
    <div class="mg-frame">
      <section class="mg-battle" hidden aria-label="전투">
        <aside class="mg-hud">
          <p class="mg-mode"></p><h2 class="mg-area"></h2>
          <p>${icon('hud-time')} <span class="mg-time"></span></p>
          <p>${icon('hud-score')} 점수 <strong class="mg-score"></strong></p>
          <p>최근 최고 점수 <strong class="mg-best"></strong></p>
          <button type="button" class="mg-boss-skip" data-action="skip-boss" hidden>보스로 스킵</button>
        </aside>
        <div class="mg-playfield">
          <canvas id="game" width="480" height="720" tabindex="0"
            aria-label="전투 화면. 방향키 또는 WASD 이동, Shift 정밀 이동, E 펫 스킬, Esc 일시정지"></canvas>
          <div class="mg-boss" hidden><label for="mg-boss-hp"></label><progress id="mg-boss-hp"></progress><small class="mg-boss-time" hidden></small></div>
          <p class="mg-warning" role="status" hidden></p>
          <section class="mg-pause" hidden aria-label="일시정지">
            <h2>일시정지</h2>${button('resume', '계속하기')}${button('abort', '출동 중단')}
          </section>
        </div>
        <aside class="mg-hud">
          <p>${icon('hud-hp')} <strong class="mg-hp"></strong></p>
          <button type="button" class="mg-skill" data-action="skill"><img alt=""><span></span></button>
          <p class="mg-keys">방향키 / WASD 이동<br>Shift 정밀 이동<br>Esc 일시정지</p>
        </aside>
      </section>
      <section class="mg-menu"></section>
    </div>`;
  const frame = overlay.querySelector<HTMLElement>('.mg-frame')!;
  const menu = overlay.querySelector<HTMLElement>('.mg-menu')!;
  const battle = overlay.querySelector<HTMLElement>('.mg-battle')!;
  const canvas = overlay.querySelector<HTMLCanvasElement>('canvas')!;
  const pause = overlay.querySelector<HTMLElement>('.mg-pause')!;
  const warning = overlay.querySelector<HTMLElement>('.mg-warning')!;
  const bossHud = overlay.querySelector<HTMLElement>('.mg-boss')!;
  const bossLabel = bossHud.querySelector('label')!;
  const bossHp = bossHud.querySelector('progress')!;
  const bossTime = bossHud.querySelector<HTMLElement>('.mg-boss-time')!;
  const skillButton = overlay.querySelector<HTMLButtonElement>('.mg-skill')!;
  const bossSkip = overlay.querySelector<HTMLButtonElement>('.mg-boss-skip')!;
  const skillIcon = skillButton.querySelector('img')!;
  const skillLabel = skillButton.querySelector('span')!;
  const mode = overlay.querySelector('.mg-mode')!;
  const area = overlay.querySelector('.mg-area')!;
  const time = overlay.querySelector('.mg-time')!;
  const hp = overlay.querySelector('.mg-hp')!;
  const score = overlay.querySelector('.mg-score')!;
  const best = overlay.querySelector('.mg-best')!;
  const root = document.querySelector<HTMLElement>('#app')!;
  const wasInert = root.inert;
  let disposed = false;
  let debug = false;
  let zone = 0;
  let selected = 0;
  let active: RunSetup | undefined;
  let result: RunResult | undefined;
  let official: GameResult | undefined;
  let runId: number | null = null;
  let saving = false;
  let saveError = '';
  let retry = false;
  let upgrade: UpgradeId = 'amount';
  let inspectingPet = 0;
  let selectedPet = 0;
  let lines: readonly Dialogue[] = [];
  let line = 0;
  let dialogueDone: () => void;
  let dialogueOnBattle = false;
  let portraitFrame = 0;
  let stageList: StageList;
  let pets: Pet[] = [];
  let stats: StatUpgrade[] = [];
  let cells = 0;
  let clearBonus = 0;
  const bestScores: Record<string, number> = {};
  const stageInfo = (index: number) => stageList.stages.find(stage => stage.displayId === stages[index]?.id);
  const canEnterStage = (index: number) => debug || stageInfo(index)?.unlocked === true;
  const canEnterEndless = () => debug || stageList.endlessUnlocked;
  const changeBalance = (balance: number) => {
    cells = balance;
    onBalance(balance);
  };

  function write(node: Element, value: string): void {
    if (node.textContent !== value) node.textContent = value;
  }

  function syncBattle(): void {
    if (!active) return;
    bossSkip.hidden = !debug || !game.canSkipToBoss;
    const current = game.stage;
    const key = active.mode === 'endless' ? 'endless' : current.id;
    const skill = game.pet.skill;
    write(mode, active.mode === 'endless' ? '무한 모드' : '스테이지 모드');
    write(area, active.mode === 'endless' ? operations[current.zone]! : `${current.id} ${current.name}`);
    write(time, clock(game.elapsed));
    write(hp, `${game.player.hp} / ${game.player.maxHp} HP`);
    write(score, sortieScore(game.elapsed, game.purified).toLocaleString());
    write(best, (bestScores[key] ?? 0).toLocaleString());
    const cooldown = Math.ceil(game.pet.cooldownRemaining);
    const effect = Math.ceil(game.pet.effectRemaining);
    const status = effect ? `효과 적용 중 ${effect}초` : cooldown ? `재사용 대기 ${cooldown}초` : '사용 가능';
    write(skillLabel, `${skills[skill].name} [E] · ${status}`);
    if (skillIcon.getAttribute('src') !== asset(`ui/skill-${skill}`)) skillIcon.src = asset(`ui/skill-${skill}`);
    skillButton.disabled = game.state !== 'playing' || cooldown > 0;
    if (warning.dataset.kind !== game.warning) {
      warning.dataset.kind = game.warning;
      warning.hidden = !game.warning;
      warning.replaceChildren();
      if (game.warning) {
        warning.insertAdjacentHTML('afterbegin', icon(game.warning === 'elite' ? 'hud-elite' : 'hud-boss'));
        warning.append({
          elite: '엘리트 접근 중', boss: '보스 접근 중', 'boss-in': '보스 등장',
        }[game.warning]);
      }
    }
    const boss = game.boss;
    bossHud.hidden = !boss;
    if (boss) {
      write(bossLabel, current.bossName);
      bossHp.max = boss.maxHp;
      bossHp.value = boss.hp;
      const remaining = game.bossTimeLeft;
      bossTime.hidden = remaining === undefined;
      if (remaining !== undefined) write(bossTime, `정화 제한 ${Math.ceil(remaining)}초`);
    }
    pause.hidden = game.state !== 'paused';
    if (!pause.hidden && !pause.contains(document.activeElement) && document.activeElement !== canvas) canvas.focus();
  }

  const game = new Game(canvas, syncBattle, finish);
  const resize = () => frame.style.setProperty('--mg-scale', String(Math.min(overlay.clientWidth / 1280, overlay.clientHeight / 720)));

  function show(html: string, background = '', keepBattle = false, focus?: string): void {
    cancelAnimationFrame(portraitFrame);
    battle.hidden = !keepBattle;
    battle.inert = keepBattle;
    menu.hidden = false;
    menu.classList.toggle('mg-dialogue-over-battle', keepBattle);
    menu.style.backgroundImage = background ? `url("${asset(background)}")` : '';
    menu.innerHTML = html;
    (focus ? menu.querySelector<HTMLElement>(focus) : menu.querySelector<HTMLElement>('h1, h2'))?.focus();
  }

  const heading = (title: string) => `<h1 tabindex="-1">${title}</h1>`;
  const panel = (title: string, content: string) => `<div class="mg-panel">${heading(title)}${content}</div>`;

  function fail(title: string, error: unknown, action: string, back: string): void {
    show(panel(title, `<p role="alert"></p>${button(action, '다시 시도')} ${button(back, '돌아가기')}`));
    menu.querySelector('[role="alert"]')!.textContent = error instanceof Error ? error.message : '서버에 연결할 수 없어요.';
  }

  async function loadLobby(): Promise<void> {
    show(panel('도로랜드: 펫 정화 작전', `<p role="status">계정 정보를 불러오는 중…</p>${button('exit', '돌아가기')}`));
    try {
      const [user, stagesData, owned, upgradesData, history] = await Promise.all([
        api.account(), api.stages(), api.pets(), api.upgrades(), api.history(),
      ]);
      if (disposed) return;
      stageList = stagesData;
      pets = owned.filter(pet => battlePets.some(asset => asset.speciesId === pet.species.speciesId) &&
        Object.hasOwn(abilityIds, pet.species.ability.code));
      selectedPet = (pets.find(pet => pet.canSortie) ?? pets[0])?.userPetId ?? 0;
      stats = upgradesData;
      changeBalance(user.cellBalance);
      for (const run of history) {
        const key = run.displayId ?? 'endless';
        if (run.status === 'FINISHED') bestScores[key] = Math.max(bestScores[key] ?? 0, run.score);
      }
      main();
    } catch (error) {
      if (!disposed) fail('계정 정보를 불러오지 못했어요.', error, 'load-lobby', 'exit');
    }
  }

  function main(): void {
    game.returnToMain();
    active = undefined;
    show(`
      <button type="button" class="mg-debug" data-action="debug" aria-pressed="${debug}">디버그 모드${debug ? ' 켜짐' : ''}</button>
      <div class="mg-exit">${button('exit', 'DOROBUS로 돌아가기')}</div>
      <div class="mg-main-panel">
        ${heading('도로랜드: 펫 정화 작전')}
        <div class="mg-main-actions">
          ${button('modes', '게임 시작', 'menu-start')}
          ${button('upgrades', '능력치 강화', 'menu-upgrade')}
          ${button('pets', '펫 설정', 'menu-pets')}
          ${button('rank', '랭킹', 'menu-ranking')}
        </div>
      </div>`, 'scenes/main-hangar');
  }

  function modes(): void {
    const open = canEnterEndless();
    show(panel('출동 모드 선택', `
      <div class="mg-choices">
        <div>${button('map', '스테이지 모드', 'mode-stage')}<p>작전 지도를 따라 오류의 원인을 찾으세요.</p></div>
        <div><button type="button" data-action="endless" ${open ? '' : 'disabled'}>${icon('mode-endless')} 무한 모드</button>
          <p>${open ? '네 구역을 순환하며 오래 살아남으세요.' : '4-3 클리어 후 해금'}</p></div>
      </div>${button('main', '메인으로')}`), 'scenes/main-hangar');
  }

  function map(focusPoint = false): void {
    const points = stages.map((stage, index) => {
      if (stage.zone !== zone) return '';
      const cleared = stageInfo(index)?.cleared;
      const unlocked = canEnterStage(index);
      const hint = !unlocked ? `${stages[index - 1]!.id} 클리어 필요` : cleared ? '클리어 · 재도전 가능' : '입장 가능';
      return `<button type="button" class="mg-point" data-stage="${index}" style="--x:${stage.pin[0]}%;--y:${stage.pin[1]}%"
        aria-label="${stage.id} ${stage.name}, ${hint}">${icon(cleared ? 'cleared' : unlocked ? 'available' : 'locked')}
        <strong>${stage.id} ${stage.name}</strong><small>${hint}</small></button>`;
    }).join('');
    const tabs = operations.map((name, index) =>
      `<button type="button" data-zone="${index}" aria-pressed="${index === zone}">${index + 1}. ${name}</button>`).join('');
    show(`<div class="mg-map-panel">${heading('작전 지도')}<nav class="mg-tabs">${tabs}</nav>
      <div class="mg-map" style="background-image:url('${asset(areaImage(zone, 'map'))}')">${points}</div>
      ${button('modes', '모드 선택으로')}</div>`, '', false, focusPoint ? `[data-stage="${selected}"]` : undefined);
  }

  function intro(): void {
    const stage = stages[selected]!;
    const allowed = canEnterStage(selected);
    show(panel(`${stage.id} ${stage.name}`, `<p>${stage.intro}</p>
      <p>목표 · ${stage.bossName} 정화 및 ${stage.objective}</p><p>5분까지 일반 웨이브 · 이후 보스전</p>
      ${selected > 0 ? `<p>보스전은 ${BOSS_TIME_LIMIT}초 동안 진행돼요. 발사체 개수·피해량을 강화하거나 펫 설정에서 출전 펫을 바꿔 보세요.</p>` : ''}
      ${allowed ? button('enter', '입장') : `<p>${stages[selected - 1]!.id} 클리어 후 입장할 수 있어요.</p>`}
      ${button('map-point', '지도로')}`), areaImage(stage.zone, 'map'));
  }

  async function begin(runMode: RunSetup['mode'], index: number, isRetry = false): Promise<void> {
    const allowed = runMode === 'endless' ? canEnterEndless() : canEnterStage(index);
    if (!allowed) return;
    if (!pets.find(pet => pet.userPetId === selectedPet)?.canSortie) {
      show(panel('출전할 수 있는 펫을 선택해 주세요.', button('pets', '펫 설정') + button('modes', '돌아가기')));
      return;
    }
    active = undefined;
    result = undefined;
    official = undefined;
    saveError = '';
    retry = isRetry;
    const stage = stages[index]!;
    show(panel(stage.name, `<p role="status">출동을 준비하는 중…</p>${button('exit', '돌아가기')}`), areaImage(stage.zone, 'map'));
    const used = runMode === 'endless' ? endlessStages.map(i => stages[i]!) : [stage];
    try {
      await loadBattle(used);
      if (disposed) return;
      const start = await api.start({
        mode: runMode === 'stage' ? 'STAGE' : 'ENDLESS',
        stageNo: runMode === 'stage' ? stageInfo(index)?.stageNo : undefined,
        userPetId: selectedPet, practice: debug,
      });
      if (disposed) {
        if (start.runId !== null) await api.abort(start.runId);
        return;
      }
      runId = start.runId;
      clearBonus = start.stage?.clearBonusScore ?? 0;
      const { ability, ...combat } = start.combatStats;
      const skill = abilityIds[ability.code]!;
      const pet = { ...battlePets.find(candidate => candidate.speciesId === start.pet.species.speciesId)!, ...combat,
        ability: { id: skill, name: ability.name, effectValue: ability.effectValue, cooldownSec: ability.cooldownSec } };
      const levels = Object.fromEntries(upgradeIds.map(id => {
        const value = start.upgrades.find(stat => stat.scope === 'MINIGAME' && stat.statCode === statCodes[id])?.valueBonus ?? 0;
        return [id, id === 'damage' || id === 'size' ? value / 10 : value];
      })) as Levels;
      stats = start.upgrades;
      active = { mode: runMode, stage: index, levels, skill, pet };
      if (runMode === 'endless') { play(); return; }
      dialogue(stage.start, () => index === 0 ? tutorial() : play(), false);
    } catch (error) {
      if (disposed) return;
      fail('전투를 준비하지 못했어요.', error, runMode === 'endless' ? 'endless' : 'enter', runMode === 'endless' ? 'modes' : 'intro');
    }
  }

  function tutorial(): void {
    show(panel('제로의 조작 안내', `<img class="mg-tutorial-portrait" src="${asset('portraits/portrait-zero')}" alt="제로">
      <p>방향키 또는 WASD로 이동하고, Shift를 누르면 천천히 움직여요. 정화 펄스는 자동으로 발사돼요.</p>
      <p>E 또는 오른쪽 스킬 버튼을 누르면 펫이 도와줘요. Esc로 출동을 멈추거나 계속할 수 있어요.</p>
      <p>오른쪽에서 HP를 확인하세요. 엘리트가 떨어뜨린 물약을 먹으면 1 HP를 회복해요.</p>
      ${button('play', '전투 시작')}`), areaImage(0, 'map'));
  }

  function dialogue(data: readonly Dialogue[], done: () => void, keepBattle: boolean): void {
    lines = data;
    line = 0;
    dialogueDone = done;
    dialogueOnBattle = keepBattle;
    showLine();
  }

  function showLine(): void {
    const [who, text, tag] = lines[line]!;
    const stage = stages[active!.stage]!;
    const overBattle = dialogueOnBattle && tag !== 'harmony';
    show(`<div class="mg-dialogue">
      ${tag ? '<canvas width="64" height="64" class="mg-portrait" aria-hidden="true"></canvas>'
        : `<img class="mg-portrait" src="${asset(`portraits/portrait-${who}`)}" alt="">`}
      <div><h2 tabindex="-1">${speakers[who]}</h2><p></p>
      ${button('next-line', '다음')}${retry || stageInfo(active!.stage)?.cleared && !dialogueOnBattle ? button('skip-line', '건너뛰기') : ''}</div>
      </div>`, overBattle ? '' : areaImage(stage.zone, 'map'), overBattle);
    menu.querySelector('p')!.textContent = text;
    if (!tag) return;
    const portrait = menu.querySelector('canvas')!;
    const ctx = portrait.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const started = performance.now();
    void loadSprite('portraits/neiti', true).then(() => {
      const animate = (now: number) => {
        if (disposed || !portrait.isConnected) return;
        ctx.clearRect(0, 0, 64, 64);
        drawSprite(ctx, 'portraits/neiti', 32, 32, { tag, time: (now - started) / 1000 });
        portraitFrame = requestAnimationFrame(animate);
      };
      portraitFrame = requestAnimationFrame(animate);
    }).catch(() => {});
  }

  function play(): void {
    if (!active) return;
    cancelAnimationFrame(portraitFrame);
    menu.hidden = true;
    battle.hidden = false;
    battle.inert = false;
    game.startRun(active);
    canvas.focus();
  }

  function finish(run: RunResult): void {
    result = run;
    const stage = stages[run.stage]!;
    void saveResult();
    if (run.mode === 'stage' && run.outcome !== 'abort')
      dialogue(run.outcome === 'clear' ? stage.clear : run.bossTimeout
        ? [['void', '정화 제한 시간이 끝났습니다. 자동 귀환을 시작합니다.']] : returned, showResult, true);
    else showResult();
  }

  async function saveResult(): Promise<void> {
    if (!result || runId === null || saving) return;
    const run = result;
    const id = runId;
    saving = true;
    saveError = '';
    try {
      if (run.outcome === 'abort') {
        await api.abort(id);
      } else {
        official = await api.finish(id, {
          survivalMs: Math.round(run.seconds * 1000), killCount: run.purified,
          reachedWave: run.reachedWave ?? 0, cleared: run.outcome === 'clear', reviveUsed: false,
        });
        const key = run.mode === 'stage' ? stages[run.stage]!.id : 'endless';
        bestScores[key] = Math.max(bestScores[key] ?? 0, official.score);
        const updatedPet = official.pet;
        if (updatedPet) pets = pets.map(pet => pet.userPetId === updatedPet.userPetId ? updatedPet : pet);
        changeBalance(official.balance);
        if (official.cleared) {
          const current = stageInfo(run.stage);
          const next = stageInfo(run.stage + 1);
          if (current) current.cleared = true;
          if (next) next.unlocked = true;
          else stageList.endlessUnlocked = true;
        }
      }
      runId = null;
    } catch (error) {
      saveError = error instanceof Error ? error.message : '서버에 연결할 수 없어요.';
    } finally {
      saving = false;
      if (!disposed && menu.querySelector('.mg-tally')) showResult();
    }
  }

  function showResult(): void {
    const run = result!;
    const stage = stages[run.stage]!;
    const title = { clear: '작전 완료', return: '귀환', abort: '출동 중단' }[run.outcome];
    const next = stages[run.stage + 1];
    let unlock = '';
    if (official?.firstClearBonus) {
      if (!next) unlock = '반복 송신 종료 · 무한 모드 해금';
      else if (!stageInfo(run.stage + 1)?.cleared) unlock = `새 지점 ${next.id} ${next.name} 해금`;
    }
    show(panel(title, `
      <p>${run.mode === 'stage' ? `${stage.id} ${stage.name}` : '무한 모드'}</p>
      ${debug ? '<p>디버그 연습 · 기록과 보상 제외</p>' : ''}
      ${run.bossTimeout ? '<p>보스 정화 시간 초과</p>' : ''}
      <dl class="mg-tally"><dt>생존 시간</dt><dd>${clock(run.seconds)}</dd>
        <dt>정화 수</dt><dd>${run.purified}기</dd>
        ${official ? `<dt>최종 점수</dt><dd>${official.score}점</dd>
          <dt>출동 보상</dt><dd>${official.rewardCell}셀</dd>
          <dt>첫 클리어 보상</dt><dd>${official.firstClearBonus}셀</dd>
          <dt>펫 경험치</dt><dd>${official.expGained}</dd>`
          : debug && run.outcome !== 'abort' ? `<dt>연습 점수</dt><dd>${sortieScore(run.seconds, run.purified) + (run.outcome === 'clear' ? clearBonus : 0)}점</dd>` : ''}</dl>
      ${unlock ? `<p class="mg-unlock">${icon('cleared')}${unlock}</p>` : ''}
      ${saving ? '<p role="status">결과를 확인하는 중…</p>' : saveError ? `<p role="alert"></p>${button('save-result', '저장 다시 시도')}` : ''}
      ${runId !== null ? '' : `<div class="mg-actions">${button('retry', '다시 도전')}
        ${run.mode === 'stage' ? button('result-map', '지도') : ''}
        ${unlock && !next ? button('endless', '무한 모드 출동') : ''}${button('main', '메인으로')}</div>`}`),
      run.mode === 'stage' ? areaImage(stage.zone, 'map') : 'scenes/main-hangar');
    const alert = menu.querySelector('[role="alert"]');
    if (alert) alert.textContent = saveError;
  }

  function showUpgrades(message = '', focus?: string): void {
    const stat = (id: UpgradeId) => stats.find(row => row.scope === 'MINIGAME' && row.statCode === statCodes[id]);
    const current = stat(upgrade);
    const cost = current?.nextCellCost ?? null;
    const effect = current?.valueBonus ?? 0;
    const effectLabel = (bonus: number) => current?.unit === 'PERCENT' ? `+${bonus}%` : `+${bonus}${upgrade === 'amount' ? '발' : ' HP'}`;
    show(panel('능력치 강화', `
      <p>${icon('hud-cell')} 보유 ${cells.toLocaleString()}셀</p>
      <div class="mg-columns">
        <div class="mg-upgrade-list">${upgradeIds.map(id =>
          `<button type="button" data-upgrade="${id}" aria-pressed="${id === upgrade}">${icon(`stat-${id}`)} ${upgrades[id].name}
            <small>${stat(id)?.level ?? 0} / ${stat(id)?.maxLevel ?? 0}단계</small></button>`).join('')}</div>
        <section><h2>${upgrades[upgrade].name}</h2><p>${effectLabel(effect)}</p>
          <p>${!current ? '강화 정보를 불러오지 못했어요.' : cost === null ? '최대 단계' : `비용 ${cost}셀${cells < cost ? ' · 셀이 부족해요.' : ''}`}</p>
          <button type="button" data-action="buy" ${cost === null || cells < cost ? 'disabled' : ''}>강화</button>
          <p role="status"></p></section>
      </div>${button('main', '메인으로')}`), 'scenes/main-hangar', false, focus);
    menu.querySelector('[role="status"]')!.textContent = message;
  }

  function showPets(message = '', focus?: string): void {
    const owned = pets.find(pet => pet.userPetId === inspectingPet);
    if (!owned) {
      show(panel('펫 설정', `<p>출전에 사용할 보유 펫이 없어요.</p>${button('main', '메인으로')}`));
      return;
    }
    const ability = owned.species.ability;
    const skill = abilityIds[ability.code]!;
    const description = skill === 'rapid-fire'
      ? `5초 동안 자동 발사 빈도가 ${Math.round((ability.effectValue - 1) * 100)}% 증가해요.`
      : skills[skill].description;
    show(panel('펫 설정', `
      <div class="mg-columns">
        <div class="mg-pet-list">${pets.map(candidate =>
          `<button type="button" data-pet="${candidate.userPetId}" aria-pressed="${candidate === owned}"></button>`).join('')}</div>
        <section><h2></h2><p>${icon(`skill-${skill}`)} ${skills[skill].name}</p><p>${description}</p>
          <p>재사용 대기 ${ability.cooldownSec}초 · 포만도 ${owned.hunger}/100</p>
          <div class="mg-pet-actions"><button type="button" data-action="equip" ${owned.canSortie ? '' : 'disabled'}>출전 펫으로 선택</button>${button('gear', '장비 슬롯', 'gear-slot')}</div>
          <p role="status"></p></section>
      </div>${button('main', '메인으로')}`), 'scenes/main-hangar', false, focus);
    menu.querySelector('h2')!.textContent = `${owned.nickname ?? owned.species.name} · Lv. ${owned.level} · ${owned.species.grade}`;
    for (const candidate of pets) {
      const label = candidate.nickname ?? candidate.species.name;
      menu.querySelector(`[data-pet="${candidate.userPetId}"]`)!.textContent =
        `${label}${candidate.userPetId === selectedPet ? ' · 출전 펫' : ''}${candidate.canSortie ? '' : ' · 출전 불가'}`;
    }
    menu.querySelector('[role="status"]')!.textContent = message;
  }

  async function showRank(): Promise<void> {
    show(panel('이번 주 무한 모드 순위', '<p role="status">순위를 불러오는 중…</p>'));
    try {
      const { weekStart, myRank, entries: rows } = await api.ranking();
      if (disposed) return;
      show(panel('이번 주 무한 모드 순위', `
        <p>${formatRankingWeek(weekStart)}</p>
        <p>${myRank ? `내 순위 ${myRank.rank}위 · ${myRank.bestScore.toLocaleString()}점` : '내 기록 없음'}</p>
        ${rows.length ? '<table class="mg-ranking"><thead><tr><th>순위</th><th>닉네임</th><th>점수</th></tr></thead><tbody></tbody></table>'
          : '<p>이번 주 플레이 기록이 없어요.</p>'}
        ${button('main', '메인으로')}`), 'scenes/main-hangar');
      const tbody = menu.querySelector('tbody');
      rows.forEach(row => {
        const tr = document.createElement('tr');
        for (const value of [`${row.rank}위`, row.nickname, row.bestScore.toLocaleString()]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          tr.append(cell);
        }
        tbody?.append(tr);
      });
    } catch (error) {
      if (!disposed) fail('순위를 불러오지 못했어요.', error, 'rank', 'main');
    }
  }

  overlay.addEventListener('click', async event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!target) {
      if (game.state === 'playing' && menu.hidden) canvas.focus({ preventScroll: true });
      return;
    }
    if (target.disabled) return;
    if (target.dataset.zone !== undefined) { zone = Number(target.dataset.zone); map(); menu.querySelector<HTMLElement>(`[data-zone="${zone}"]`)?.focus(); return; }
    if (target.dataset.stage !== undefined) { selected = Number(target.dataset.stage); intro(); return; }
    if (target.dataset.upgrade) { upgrade = target.dataset.upgrade as UpgradeId; showUpgrades('', `[data-upgrade="${upgrade}"]`); return; }
    if (target.dataset.pet) { inspectingPet = Number(target.dataset.pet); showPets('', `[data-pet="${inspectingPet}"]`); return; }
    switch (target.dataset.action) {
      case 'debug': debug = !debug; main(); menu.querySelector<HTMLElement>('.mg-debug')?.focus(); break;
      case 'exit': onClose(); break;
      case 'load-lobby': void loadLobby(); break;
      case 'main': main(); break;
      case 'modes': modes(); break;
      case 'map': map(); break;
      case 'map-point': map(true); break;
      case 'intro': intro(); break;
      case 'enter': void begin('stage', selected, !!stageInfo(selected)?.cleared); break;
      case 'endless': begin('endless', endlessStages[0]); break;
      case 'next-line': if (++line < lines.length) showLine(); else dialogueDone(); break;
      case 'skip-line': dialogueDone(); break;
      case 'play': play(); break;
      case 'skill': game.activatePetSkill(); canvas.focus(); break;
      case 'skip-boss': if (debug && game.canSkipToBoss) { game.skipToBoss(); canvas.focus(); } break;
      case 'resume': game.resume(); canvas.focus(); break;
      case 'abort': game.abort(); break;
      case 'save-result': void saveResult(); showResult(); break;
      case 'retry': if (result) { selected = result.stage; void begin(result.mode, result.stage, true); } break;
      case 'result-map': selected = result!.stage; zone = stages[selected]!.zone; map(true); break;
      case 'upgrades': showUpgrades(); break;
      case 'buy': {
        show(panel('능력치 강화', '<p role="status">구매를 확인하는 중…</p>'));
        let message = '강화했어요.';
        try {
          const purchase = await api.buy(statCodes[upgrade]);
          stats = stats.map(stat => stat.statCode === purchase.upgrade.statCode ? purchase.upgrade : stat);
          changeBalance(purchase.balance);
        } catch (error) {
          message = error instanceof Error ? error.message : '구매 결과를 확인하지 못했어요.';
          try {
            const [user, currentStats] = await Promise.all([api.account(), api.upgrades()]);
            stats = currentStats;
            changeBalance(user.cellBalance);
          } catch {
            if (!disposed) fail('강화 정보를 불러오지 못했어요.', error, 'load-lobby', 'exit');
            break;
          }
        }
        if (!disposed) showUpgrades(message, `[data-upgrade="${upgrade}"]`);
        break;
      }
      case 'pets': inspectingPet = selectedPet; showPets(); break;
      case 'equip': {
        selectedPet = inspectingPet;
        showPets('출전 펫을 선택했어요.', '[data-action="equip"]');
        break;
      }
      case 'gear': show(panel('펫 장비', `<p>${icon('gear-slot')} 장착할 수 있는 장비가 없어요.</p>${button('back-gear', '돌아가기')}`)); break;
      case 'back-gear': showPets('', '[data-action="gear"]'); break;
      case 'rank': showRank(); break;
    }
  });

  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape' && game.state === 'paused' && event.target !== canvas && !battle.inert) {
      event.preventDefault();
      game.resume();
      canvas.focus();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from((menu.hidden ? battle : menu).querySelectorAll<HTMLElement>('button:not(:disabled), canvas[tabindex="0"]'))
      .filter(element => !element.closest('[hidden]'));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  root.inert = true;
  document.body.append(overlay);
  document.body.classList.add('in-game');
  window.addEventListener('resize', resize);
  resize();
  void loadLobby();
  game.start();
  return () => {
    disposed = true;
    if (runId !== null && !result) void api.abort(runId).catch(console.error);
    cancelAnimationFrame(portraitFrame);
    window.removeEventListener('resize', resize);
    game.stop();
    overlay.remove();
    root.inert = wasInert;
    document.body.classList.remove('in-game');
  };
}
