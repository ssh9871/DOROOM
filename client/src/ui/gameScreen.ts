import { Game } from '../game/Game';
import { asset, areaImage, drawSprite, loadBattle, loadSprite } from '../game/sprites';
import { canEnterEndless, canEnterStage, endlessStages, operations, speakers, stages, type Dialogue } from '../game/stages';
import { BOSS_TIME_LIMIT, scoreRun, skills, upgradeIds, upgrades, type RunResult, type RunSetup, type UpgradeId } from '../game/progress';
import { battlePets, battlePetStats } from '../game/petCatalog';
import { PLAYER } from '../game/config';
import type { PetState } from '../pets/pets';
import { formatWeek } from './weeklyRanking';

const icon = (key: string) => `<img src="${asset(`ui/${key}`)}" alt="">`;
const button = (action: string, label: string, key?: string) =>
  `<button type="button" data-action="${action}">${key ? icon(key) : ''}${label}</button>`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const returned: readonly Dialogue[] = [['void', '위험 한계 도달. 자동 귀환을 시작합니다.']];

export function openGame(state: PetState, onClose: () => void): () => void {
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
          <p>최고 점수 <strong class="mg-best"></strong></p>
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
  let saved = false;
  let savedRunId = '';
  let firstClear = false;
  let retry = false;
  let upgrade: UpgradeId = 'amount';
  let inspectingPet = '';
  let lines: readonly Dialogue[] = [];
  let line = 0;
  let dialogueDone: () => void;
  let dialogueOnBattle = false;
  let portraitFrame = 0;
  let progress = state.minigame;

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
    write(score, game.score.toLocaleString());
    write(best, (progress.best[key] ?? 0).toLocaleString());
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

  function main(): void {
    game.returnToMain();
    active = undefined;
    show(`
      <button type="button" class="mg-debug" data-action="debug" aria-pressed="${debug}">디버그${debug ? ' 켜짐' : ''}</button>
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
    const open = canEnterEndless(progress.cleared, debug);
    show(panel('출동 모드 선택', `
      <div class="mg-choices">
        <div>${button('map', '스테이지 모드', 'mode-stage')}<p>네 작전 지도를 따라 오류의 원인을 찾으세요.</p></div>
        <div><button type="button" data-action="endless" ${open ? '' : 'disabled'}>${icon('mode-endless')} 무한 모드</button>
          <p>${open ? '네 구역을 순환하며 오래 살아남으세요.' : '4-3 클리어 후 해금'}</p></div>
      </div>${button('main', '메인으로')}`), 'scenes/main-hangar');
  }

  function map(focusPoint = false): void {
    const points = stages.map((stage, index) => {
      if (stage.zone !== zone) return '';
      const cleared = !!progress.cleared[stage.id];
      const unlocked = canEnterStage(index, progress.cleared, debug);
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
    const allowed = canEnterStage(selected, progress.cleared, debug);
    show(panel(`${stage.id} ${stage.name}`, `<p>${stage.intro}</p>
      <p>목표 · ${stage.bossName} 정화 및 ${stage.objective}</p><p>5분까지 일반 웨이브 · 이후 보스전</p>
      ${selected > 0 ? `<p>보스전은 ${BOSS_TIME_LIMIT}초 동안 진행돼요. 발사체 개수·피해량을 강화하거나 펫 설정에서 출전 펫을 바꿔 보세요.</p>` : ''}
      ${allowed ? button('enter', '입장') : `<p>${stages[selected - 1]!.id} 클리어 후 입장할 수 있어요.</p>`}
      ${button('map-point', '지도로')}`), areaImage(stage.zone, 'map'));
  }

  function begin(runMode: RunSetup['mode'], index: number, isRetry = false): void {
    const allowed = runMode === 'endless' ? canEnterEndless(progress.cleared, debug) : canEnterStage(index, progress.cleared, debug);
    if (!allowed) return;
    const pet = battlePets.find(candidate => candidate.id === progress.petId)!;
    const setup = { mode: runMode, stage: runMode === 'endless' ? endlessStages[0] : index, levels: progress.levels, skill: pet.ability.id, pet };
    active = setup;
    retry = isRetry;
    const stage = stages[setup.stage]!;
    show(panel(stage.name, '<p role="status">전투 리소스를 불러오는 중…</p>'), areaImage(stage.zone, 'map'));
    const used = runMode === 'endless' ? endlessStages.map(i => stages[i]!) : [stage];
    void loadBattle(used).then(() => {
      if (disposed || active !== setup) return;
      if (runMode === 'endless') { play(); return; }
      dialogue(stage.start, () => index === 0 ? tutorial() : play(), false);
    }).catch(() => {
      if (!disposed && active === setup) show(panel('전투를 준비하지 못했어요.',
        `${button('retry-load', '다시 불러오기')} ${button(runMode === 'endless' ? 'modes' : 'intro', '돌아가기')}`));
    });
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
      ${button('next-line', '다음')}${retry || progress.cleared[stage.id] && !dialogueOnBattle ? button('skip-line', '건너뛰기') : ''}</div>
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
    firstClear = run.outcome === 'clear' && !run.bossPractice && !progress.cleared[stage.id];
    saveResult();
    if (run.mode === 'stage' && run.outcome !== 'abort')
      dialogue(run.outcome === 'clear' ? stage.clear : run.bossTimeout
        ? [['void', '정화 제한 시간이 끝났습니다. 자동 귀환을 시작합니다.']] : returned, showResult, true);
    else showResult();
  }

  function saveResult(): void {
    if (!result || saved && result.id === savedRunId) return;
    saved = state.recordRun(result);
    savedRunId = result.id;
    progress = state.minigame;
  }
  function showResult(): void {
    const run = result!;
    const stage = stages[run.stage]!;
    const tally = scoreRun(run, stage.reward);
    const title = { clear: '작전 완료', return: '귀환', abort: '출동 중단' }[run.outcome];
    const next = stages[run.stage + 1];
    let unlock = '';
    if (firstClear && saved) {
      if (!next) unlock = '반복 송신 종료 · 무한 모드 해금';
      else if (!progress.cleared[next.id]) unlock = `새 지점 ${next.id} ${next.name} 해금`;
    }
    show(panel(title, `
      <p>${run.mode === 'stage' ? `${stage.id} ${stage.name}` : '무한 모드'}</p>
      ${run.bossPractice ? '<p>디버그 보스 테스트 · 기록과 보상 제외</p>' : ''}
      ${run.bossTimeout ? '<p>보스 정화 시간 초과</p>' : ''}
      <dl class="mg-tally"><dt>생존 시간</dt><dd>${clock(run.seconds)} · ${tally.survival}점</dd>
        <dt>정화 수</dt><dd>${run.purified}기 · ${tally.purification}점</dd>
        <dt>최종 점수</dt><dd>${tally.score}점</dd>
        <dt>점수 보상</dt><dd>${tally.scoreCells}셀</dd>
        <dt>클리어 보상</dt><dd>${tally.clearCells}셀</dd></dl>
      ${unlock ? `<p class="mg-unlock">${icon('cleared')}${unlock}</p>` : ''}
      ${saved ? '' : `<p role="alert">결과를 저장하지 못했어요.</p>${button('save-result', '저장 다시 시도')}`}
      <div class="mg-actions">${button('retry', '다시 도전')}
        ${run.mode === 'stage' ? button('result-map', '지도') : ''}
        ${unlock && !next ? button('endless', '무한 모드 출동') : ''}${button('main', '메인으로')}</div>`),
      run.mode === 'stage' ? areaImage(stage.zone, 'map') : 'scenes/main-hangar');
  }

  function showUpgrades(message = '', focus?: string): void {
    const { levels } = progress;
    const current = upgrades[upgrade];
    const level = levels[upgrade];
    const cost = current.costs[level];
    const { cells } = state.user;
    show(panel('능력치 강화', `
      <p>${icon('hud-cell')} 보유 ${cells.toLocaleString()}셀</p>
      <div class="mg-columns">
        <div class="mg-upgrade-list">${upgradeIds.map(id =>
          `<button type="button" data-upgrade="${id}" aria-pressed="${id === upgrade}">${icon(`stat-${id}`)} ${upgrades[id].name}
            <small>${levels[id]} / ${upgrades[id].costs.length}단계</small></button>`).join('')}</div>
        <section><h2>${current.name}</h2><p>${current.effect(level)}${cost === undefined ? '' : ` → ${current.effect(level + 1)}`}</p>
          <p>${cost === undefined ? '최대 단계' : `비용 ${cost}셀${cells < cost ? ' · 셀이 부족해요.' : ''}`}</p>
          <button type="button" data-action="buy" ${cost === undefined || cells < cost ? 'disabled' : ''}>강화</button>
          <p role="status"></p></section>
      </div>${button('main', '메인으로')}`), 'scenes/main-hangar', false, focus);
    menu.querySelector('[role="status"]')!.textContent = message;
  }

  function showPets(message = '', focus?: string): void {
    const pet = battlePets.find(candidate => candidate.id === inspectingPet)!;
    const skill = pet.ability.id;
    const stats = battlePetStats(pet, PLAYER.maxHp);
    const description = skill === 'rapid-fire'
      ? `5초 동안 자동 발사 빈도가 ${Math.round((pet.ability.effectValue - 1) * 100)}% 증가해요.`
      : skill === 'heal' ? `체력을 ${stats.healHp} HP 회복해요.` : skills[skill].description;
    show(panel('펫 설정', `
      <div class="mg-columns">
        <div class="mg-pet-list">${battlePets.map(owned =>
          `<button type="button" data-pet="${owned.id}" aria-pressed="${owned.id === pet.id}">
            <span aria-hidden="true">${owned.icon}</span> ${owned.name}${owned.id === progress.petId ? ' · 출전 중' : ''}</button>`).join('')}</div>
        <section><h2>${pet.name} · ${pet.grade}</h2><p>${icon(`skill-${skill}`)} ${pet.ability.name}</p><p>${description}</p>
          <p>재사용 대기 ${pet.ability.cooldownSec}초</p>
          <p>기본 공격력 ${pet.attack} · 체력 ${pet.maxHp}<br>이동속도 ${pet.moveSpeed} · 탄속 ${pet.bulletSpeed}</p>
          <p>전투 기본 체력 ${stats.maxHp} HP · 정화 펄스 피해량 ${Math.round(stats.damageScale * 100)}%</p>
          <div class="mg-pet-actions">${button('equip', '장착')}${button('gear', '장비 슬롯', 'gear-slot')}</div>
          <p role="status"></p></section>
      </div>${button('main', '메인으로')}`), 'scenes/main-hangar', false, focus);
    menu.querySelector('[role="status"]')!.textContent = message;
  }

  function showRank(): void {
    const { start, end, rows } = state.weeklyRanking();
    show(panel('이번 주 무한 모드 순위', `
      <p>이 브라우저의 기록 · ${formatWeek(start, end)}</p>
      ${rows.length ? '<table class="mg-ranking"><thead><tr><th>순위</th><th>닉네임</th><th>점수</th></tr></thead><tbody></tbody></table>'
        : '<p>이번 주 플레이 기록이 없어요.</p>'}
      ${button('main', '메인으로')}`), 'scenes/main-hangar');
    const tbody = menu.querySelector('tbody');
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      for (const value of [`${index + 1}위`, row.nickname, row.score.toLocaleString()]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        tr.append(cell);
      }
      tbody?.append(tr);
    });
  }

  overlay.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!target) {
      if (game.state === 'playing' && menu.hidden) canvas.focus({ preventScroll: true });
      return;
    }
    if (target.disabled) return;
    if (target.dataset.zone !== undefined) { zone = Number(target.dataset.zone); map(); menu.querySelector<HTMLElement>(`[data-zone="${zone}"]`)?.focus(); return; }
    if (target.dataset.stage !== undefined) { selected = Number(target.dataset.stage); intro(); return; }
    if (target.dataset.upgrade) { upgrade = target.dataset.upgrade as UpgradeId; showUpgrades('', `[data-upgrade="${upgrade}"]`); return; }
    if (target.dataset.pet) { inspectingPet = target.dataset.pet; showPets('', `[data-pet="${inspectingPet}"]`); return; }
    switch (target.dataset.action) {
      case 'debug': debug = !debug; main(); menu.querySelector<HTMLElement>('.mg-debug')?.focus(); break;
      case 'exit': onClose(); break;
      case 'main': main(); break;
      case 'modes': modes(); break;
      case 'map': map(); break;
      case 'map-point': map(true); break;
      case 'intro': intro(); break;
      case 'enter': begin('stage', selected, !!progress.cleared[stages[selected]!.id]); break;
      case 'endless': begin('endless', endlessStages[0]); break;
      case 'next-line': if (++line < lines.length) showLine(); else dialogueDone(); break;
      case 'skip-line': dialogueDone(); break;
      case 'play': play(); break;
      case 'skill': game.activatePetSkill(); canvas.focus(); break;
      case 'skip-boss': if (debug && game.canSkipToBoss) { game.skipToBoss(); canvas.focus(); } break;
      case 'resume': game.resume(); canvas.focus(); break;
      case 'abort': game.abort(); break;
      case 'save-result': saveResult(); showResult(); break;
      case 'retry': if (result) begin(result.mode, result.stage, true); break;
      case 'retry-load': if (active) begin(active.mode, active.stage, retry); break;
      case 'result-map': selected = result!.stage; zone = stages[selected]!.zone; map(true); break;
      case 'upgrades': showUpgrades(); break;
      case 'buy': {
        const message = state.buyUpgrade(upgrade);
        progress = state.minigame;
        showUpgrades(message, `[data-upgrade="${upgrade}"]`);
        break;
      }
      case 'pets': inspectingPet = progress.petId; showPets(); break;
      case 'equip': {
        const ok = state.equipRunPet(inspectingPet);
        progress = state.minigame;
        showPets(ok ? '' : '장착을 저장하지 못했어요.', '[data-action="equip"]');
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
  main();
  game.start();
  return () => {
    disposed = true;
    cancelAnimationFrame(portraitFrame);
    window.removeEventListener('resize', resize);
    game.stop();
    overlay.remove();
    root.inert = wasInert;
    document.body.classList.remove('in-game');
  };
}
