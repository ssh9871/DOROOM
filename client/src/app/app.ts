import { connectPetShop } from '../ui/petShop';
import { gamesScreen, homeScreen, roomScreen } from '../ui/screens';
import { createPetState } from '../pets/pets';
import { openGame } from '../ui/gameScreen';

export function startApp() {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Missing app root');
  let cleanup: (() => void) | undefined;
  let version = 0;
  const petState = createPetState();

  async function render() {
    const currentVersion = ++version;
    cleanup?.();
    cleanup = undefined;
    const page = location.hash.slice(1);
    const inRoom = page === 'room' || page === 'pet-room';
    document.body.classList.toggle('in-room', inRoom);
    root!.innerHTML = inRoom ? roomScreen(page === 'pet-room', petState.user) : page === 'minigames' ? gamesScreen(petState.user) : homeScreen(petState.user);
    window.scrollTo(0, 0);
    // 미니게임 화면일 경우 버튼 이벤트 연결
    if (page === 'minigames') {
      const playBtn = root!.querySelector<HTMLButtonElement>('#start-minigame-btn');
      const leaderboardBtn = root!.querySelector<HTMLButtonElement>('#leaderboard-btn');
      const leaderboardModal = root!.querySelector<HTMLDivElement>('#leaderboard-modal');
      const leaderboardCloseBtn = root!.querySelector<HTMLButtonElement>('#leaderboard-close-btn');
      const leaderboardConfirmBtn = root!.querySelector<HTMLButtonElement>('#leaderboard-confirm-btn');
      const leaderboardList = root!.querySelector<HTMLOListElement>('#leaderboard-list');
      const leaderboardBestScore = root!.querySelector<HTMLElement>('#leaderboard-best-score');
      const scoreHistoryKey = 'dorobus_scores';

      const loadScores = (): number[] => {
        try {
          const raw = localStorage.getItem(scoreHistoryKey);
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed)
            ? parsed
              .filter((value): value is number => (
                typeof value === 'number' && Number.isFinite(value) && value >= 0
              ))
              .sort((a, b) => b - a)
            : [];
        } catch {
          return [];
        }
      };

      const renderLeaderboard = (): void => {
        if (!leaderboardList || !leaderboardBestScore) return;
        const scores = loadScores().slice(0, 5);
        leaderboardBestScore.textContent = scores.length > 0
          ? `${scores[0].toLocaleString()}점`
          : '기록 없음';
        leaderboardList.replaceChildren();

        if (scores.length === 0) {
          const empty = document.createElement('li');
          empty.className = 'leaderboard-empty';
          empty.textContent = '아직 플레이 기록이 없습니다.';
          leaderboardList.appendChild(empty);
          return;
        }

        scores.forEach((score, index) => {
          const item = document.createElement('li');
          item.className = 'leaderboard-item';
          const rank = document.createElement('span');
          rank.className = 'leaderboard-rank';
          rank.textContent = `${index + 1}위`;
          const value = document.createElement('strong');
          value.className = 'leaderboard-score';
          value.textContent = `${score.toLocaleString()}점`;
          item.append(rank, value);
          leaderboardList.appendChild(item);
        });
      };

      const closeLeaderboard = (): void => {
        if (!leaderboardModal) return;
        leaderboardModal.hidden = true;
        leaderboardModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('leaderboard-open');
        leaderboardBtn?.focus();
      };

      const openLeaderboard = (): void => {
        if (!leaderboardModal) return;
        renderLeaderboard();
        leaderboardModal.hidden = false;
        leaderboardModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('leaderboard-open');
        leaderboardCloseBtn?.focus();
      };

      const onLeaderboardKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && leaderboardModal && !leaderboardModal.hidden) {
          closeLeaderboard();
        }
      };
      
      if (playBtn) {
        let disposeGame: (() => void) | undefined;
        const closeGame = () => {
          disposeGame?.();
          disposeGame = undefined;
          playBtn.focus();
        };

        leaderboardBtn?.addEventListener('click', openLeaderboard);
        leaderboardCloseBtn?.addEventListener('click', closeLeaderboard);
        leaderboardConfirmBtn?.addEventListener('click', closeLeaderboard);
        leaderboardModal?.addEventListener('click', (event) => {
          if (event.target === leaderboardModal) closeLeaderboard();
        });
        document.addEventListener('keydown', onLeaderboardKeyDown);

        playBtn.addEventListener('click', () => {
          if (!disposeGame) disposeGame = openGame(petState, closeGame);
        });

        cleanup = () => {
            closeGame();
            document.removeEventListener('keydown', onLeaderboardKeyDown);
            document.body.classList.remove('leaderboard-open');
        };
      }
      return;
    }
    if (!inRoom) return;

    const canvas = root!.querySelector<HTMLCanvasElement>('#room-canvas')!;
    const dialog = root!.querySelector<HTMLDialogElement>('#exit-dialog')!;
    const pets = root!.querySelector<HTMLDialogElement>('#pet-dialog')!;
    const shop = root!.querySelector<HTMLDialogElement>('#shop-dialog')!;
    const menu = root!.querySelector<HTMLElement>('#room-menu')!;
    const menuToggle = root!.querySelector<HTMLButtonElement>('#room-menu-toggle')!;
    const equipButton = root!.querySelector<HTMLButtonElement>('#toggle-pet')!;
    let room: ReturnType<typeof import('../room/room').createRoom> | undefined;
    const updateEquipment = () => {
      root!.querySelector<HTMLElement>('#pet-equipped-badge')!.hidden = !petState.equipped;
      equipButton.textContent = petState.equipped ? '해제' : '장착';
      equipButton.classList.toggle('equipped', petState.equipped);
      const saveNotice = root!.querySelector<HTMLElement>('#pet-save-notice')!;
      saveNotice.hidden = petState.persistent && !petState.recovered;
      saveNotice.textContent = !petState.persistent ? '저장할 수 없어 새로고침하면 변경 사항이 사라질 수 있어요.' : '잘못된 저장 값을 기본값으로 복구했어요.';
      root!.querySelector('#pet-affection')!.textContent = `${petState.pet.affection}/100`;
      root!.querySelector('#pet-hunger')!.textContent = `${petState.pet.hunger}/100`;
      root!.querySelector('#pet-progress')!.textContent = `Lv. ${petState.pet.level} · 경험치 ${petState.pet.experience}/${petState.requiredExperience}`;
    };
    const setMenu = (open: boolean) => {
      menu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      room?.setPaused(open);
      if (open) root!.querySelector<HTMLButtonElement>('#open-pets')!.focus();
    };
    const openPets = () => {
      if (dialog.open || pets.open || shop.open) return;
      setMenu(false);
      updateEquipment();
      pets.showModal();
      room?.setPaused(true);
    };
    const showShop = connectPetShop(shop, petState, updateEquipment);
    const openShop = () => {
      if (dialog.open || pets.open || shop.open) return;
      setMenu(false);
      showShop();
      room?.setPaused(true);
    };
    root!.querySelector('#close-shop')!.addEventListener('click', () => shop.close());
    shop.addEventListener('close', () => { room?.setPaused(false); canvas.focus(); });
    menuToggle.addEventListener('click', () => {
      setMenu(menu.hidden !== false);
      if (menu.hidden) canvas.focus();
    });
    root!.querySelector('#open-pets')!.addEventListener('click', openPets);
    root!.querySelector('#close-pets')!.addEventListener('click', () => pets.close());
    pets.addEventListener('close', () => {
      room?.setPaused(false);
      canvas.focus();
    });
    equipButton.addEventListener('click', () => {
      petState.setEquipped(!petState.equipped);
      updateEquipment();
      room?.setPet(petState.equipped ? petState.pet : null);
    });
    root!.querySelector('#exit-room')!.addEventListener('click', () => {
      setMenu(false);
      dialog.returnValue = '';
      dialog.showModal();
      room?.setPaused(true);
    });
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'yes') location.hash = 'home';
      else { room?.setPaused(false); canvas.focus(); }
    });
    const shortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || dialog.open || pets.open || shop.open) return;
      if (event.code === 'Escape' && !menu.hidden) {
        event.preventDefault();
        setMenu(false);
        canvas.focus();
      } else if (event.code === 'KeyP' && document.activeElement === canvas) {
        event.preventDefault();
        openPets();
      }
    };
    window.addEventListener('keydown', shortcut);
    cleanup = () => { window.removeEventListener('keydown', shortcut); room?.dispose(); };
    updateEquipment();

    try {
      const { createRoom } = await import('../room/room');
      if (currentVersion !== version) return;
      room = createRoom(canvas, root!.querySelector('#room-name-tag')!, root!.querySelector('.room-loading')!, {
        petRoom: page === 'pet-room',
        shopHint: root!.querySelector('#shop-hint')!,
        onShop: openShop,
        portalHint: root!.querySelector('#portal-hint')!,
        onPortal: () => { location.hash = page === 'pet-room' ? 'room' : 'pet-room'; },
        onPetStatus: (message) => {
          if (currentVersion !== version) return;
          for (const id of ['#pet-scene-status', '#pet-model-notice']) {
            const notice = root!.querySelector<HTMLElement>(id)!;
            notice.hidden = !message;
            notice.textContent = message;
          }
        },
      });
      room.setPaused(!menu.hidden || pets.open || dialog.open || shop.open);
      room.setPet(petState.equipped ? petState.pet : null);
    } catch (error) {
      if (currentVersion !== version) return;
      root!.querySelector('.room-loading')!.textContent = '3D 마이룸을 시작할 수 없습니다. WebGL 지원 및 파일 연결을 확인해주세요.';
      console.error(error);
    }
  }

  window.addEventListener('hashchange', render);
  void render();
}
