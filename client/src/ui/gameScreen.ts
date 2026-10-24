import { Game } from '../game/Game';
import { PET } from '../game/config';
import type { PetState } from '../pets/pets';

export function openGame(state: PetState, onClose: () => void): () => void {
  const overlay = document.createElement('div');
  overlay.id = 'game-fullscreen-overlay';
  overlay.className = 'game-overlay';
  overlay.innerHTML = `
    <header class="game-header"><button type="button" class="game-back">〈 DOROBUS로 돌아가기</button></header>
    <section class="game-stage" aria-label="정화의 비행">
      <canvas id="game" tabindex="0" aria-label="방향키 이동, E 펫 스킬, P 또는 Escape 일시정지"></canvas>
      <div class="game-main-actions">
        <button type="button" class="game-start">게임 시작</button>
        <button type="button" class="game-pet-settings">펫 설정</button>
      </div>
      <div class="game-main-actions gameover-actions" hidden>
        <button type="button" class="game-start">다시하기</button>
        <button type="button" class="game-return-main">메인으로</button>
      </div>
      <button type="button" class="game-skill" hidden>펫 스킬 [E]<small></small></button>
    </section>
    <dialog class="pet-dialog game-pet-dialog" aria-labelledby="game-pet-title">
      <header class="pet-dialog-header"><h2 id="game-pet-title">펫 설정</h2><button type="button" class="game-pet-close" aria-label="펫 설정 닫기" autofocus>×</button></header>
      <div class="game-pet-content">
        <button type="button" class="game-pet-choice" aria-pressed="true"><img alt=""/><strong></strong><span>선택됨</span></button>
        <dl><dt>레벨</dt><dd class="game-pet-level"></dd><dt>경험치</dt><dd class="game-pet-experience"></dd><dt>능력</dt><dd class="game-pet-ability"></dd><dt>지속 시간</dt><dd>${PET.shieldDuration}초</dd><dt>쿨타임</dt><dd>${PET.shieldCooldown}초</dd></dl>
      </div>
    </dialog>`;
  const canvas = overlay.querySelector<HTMLCanvasElement>('canvas')!;
  const actions = overlay.querySelector<HTMLElement>('.game-main-actions')!;
  const gameoverActions = overlay.querySelector<HTMLElement>('.gameover-actions')!;
  const skill = overlay.querySelector<HTMLButtonElement>('.game-skill')!;
  const skillStatus = skill.querySelector('small')!;
  const dialog = overlay.querySelector<HTMLDialogElement>('dialog')!;
  const settings = overlay.querySelector<HTMLButtonElement>('.game-pet-settings')!;
  const choice = overlay.querySelector<HTMLButtonElement>('.game-pet-choice')!;
  const syncUi = () => {
    actions.hidden = game.state !== 'ready';
    gameoverActions.hidden = game.state !== 'gameover';
    skill.hidden = game.state === 'ready' || game.state === 'gameover';
    skill.disabled = game.state !== 'playing' || game.pet.cooldownRemaining > 0;
    skill.classList.toggle('active', game.pet.isShieldActive);
    const seconds = Math.ceil(game.pet.cooldownRemaining);
    const label = `${game.pet.isShieldActive ? '방어막 사용 중 · ' : ''}${seconds > 0 ? `${seconds}초` : '사용 가능'}`;
    if (skillStatus.textContent !== label) skillStatus.textContent = label;
  };
  const game = new Game(canvas, state.pet, syncUi);
  const root = document.querySelector<HTMLElement>('#app')!;
  const wasInert = root.inert;
  root.inert = true;
  document.body.appendChild(overlay);
  document.body.classList.add('in-game');
  const start = () => { game.startRun(); canvas.focus(); };
  overlay.querySelectorAll('.game-start').forEach(button => button.addEventListener('click', start));
  overlay.querySelector('.game-return-main')!.addEventListener('click', () => {
    game.returnToMain();
    canvas.focus();
  });
  settings.addEventListener('click', () => {
    if (game.state !== 'ready') return;
    const pet = state.pet;
    const image = choice.querySelector('img')!;
    image.src = pet.previewPath;
    image.alt = pet.name;
    choice.querySelector('strong')!.textContent = pet.name;
    choice.setAttribute('aria-label', `${pet.name} 선택`);
    dialog.querySelector('.game-pet-level')!.textContent = `${pet.level}`;
    dialog.querySelector('.game-pet-experience')!.textContent = `${pet.experience}/${state.requiredExperience}`;
    dialog.querySelector('.game-pet-ability')!.textContent = pet.ability.name;
    game.setSettingsOpen(true);
    dialog.showModal();
  });
  choice.addEventListener('click', () => {
    game.selectPet(state.pet);
    choice.setAttribute('aria-pressed', 'true');
  });
  overlay.querySelector('.game-pet-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    game.setSettingsOpen(false);
    settings.focus();
  });
  skill.addEventListener('click', () => { game.activatePetSkill(); canvas.focus(); });
  const dispose = () => {
    game.stop();
    if (dialog.open) dialog.close();
    overlay.remove();
    root.inert = wasInert;
    document.body.classList.remove('in-game');
  };
  overlay.querySelector('.game-back')!.addEventListener('click', onClose);
  syncUi();
  game.start();
  canvas.focus();
  return dispose;
}
